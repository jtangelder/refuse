import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FuseAPI, EFFECT_MODELS } from '../index';
import { Store } from '../store';

describe('PresetImporter Integration via FuseAPI', () => {
  let api: FuseAPI;
  let store: Store;
  let protocol: any;

  const mockPresetXml = `
    <FenderPreset name="Test Preset" version="1.0">
      <Amplifier ID="0" POS="0" BypassState="0">
        <Module ID="0" POS="0" BypassState="0">
          <Param ControlIndex="0">32768</Param>
          <Param ControlIndex="1">51200</Param>
        </Module>
      </Amplifier>
      <FX>
        <Stompbox>
          <Module ID="19" POS="0" BypassState="0">
            <Param ControlIndex="0">12800</Param>
          </Module>
        </Stompbox>
      </FX>
      <Info author="Fender Audio" genre1="Blues" genre2="Rock" tags="clean, vintage">Classic studio tone</Info>
    </FenderPreset>
  `;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Protocol manually or use the class
    protocol = {
      isConnected: true,
      isSupported: true,
      listeners: [],
      connect: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      sendPacket: vi.fn().mockResolvedValue(undefined),
      getNextSequenceId: vi.fn().mockReturnValue(1),
    };

    store = new Store();
    // FuseAPI expects a full IProtocol, our mock object suffices for this test if casted or matches interface
    api = new FuseAPI(store, protocol);
  });

  it('should parse preset name, amplifier settings, effects, and info into Store', async () => {
    await api.loadPresetFromXml(mockPresetXml);

    // Expect 2 modules found (Amplifier, Stompbox)
    // Each module sends 1 DSP Write + 1 Apply = 2 packets
    // Total 4 packets
    expect(protocol.sendPacket).toHaveBeenCalledTimes(4);

    // Store state should also be synchronized
    const state = store.getState();
    expect(state.amp.knobs[0]).toBe(128);
    expect(state.amp.knobs[1]).toBe(200);
    expect(state.slots[0]?.knobs[0]).toBe(50);
    expect(state.presetDetails.author).toBe('Fender Audio');
    expect(state.presetDetails.genre1).toBe('Blues');
    expect(state.presetDetails.tags).toBe('clean, vintage');
    expect(state.presetDetails.description).toBe('Classic studio tone');
  });

  it('should correctly resolve legacy FUSE ID 111 to Orange Box (0x0101)', async () => {
    const orangeBoxXml = `
      <FenderPreset name="Orange Preset" version="1.0">
        <FX>
          <Stompbox>
            <Module ID="111" POS="0" BypassState="0">
              <Param ControlIndex="0">25600</Param>
            </Module>
          </Stompbox>
        </FX>
      </FenderPreset>
    `;
    await api.loadPresetFromXml(orangeBoxXml);
    expect(store.getState().slots[0]?.modelId).toBe(EFFECT_MODELS.ORANGE_BOX.id);
  });

  it('should round-trip export and import preset XML', async () => {
    await api.loadPresetFromXml(mockPresetXml);
    const exportedXml = api.exportPresetToXml('Exported Blues');

    expect(exportedXml).toContain('name="Exported Blues"');
    expect(exportedXml).toContain('author="Fender Audio"');
    expect(exportedXml).toContain('Classic studio tone');

    // Reset store and reload from exported XML
    const freshStore = new Store();
    const freshApi = new FuseAPI(freshStore, protocol);
    await freshApi.loadPresetFromXml(exportedXml);

    expect(freshStore.getState().amp.knobs[0]).toBe(128);
    expect(freshStore.getState().amp.knobs[1]).toBe(200);
    expect(freshStore.getState().slots[0]?.knobs[0]).toBe(50);
    expect(freshStore.getState().presetDetails.author).toBe('Fender Audio');
  });

  it('should ignore unknown tags', async () => {
    const xmlWithExtra = mockPresetXml.replace(
      '</FenderPreset>',
      '<UnknownTag><Module ID="99" POS="0"/></UnknownTag></FenderPreset>',
    );
    await api.loadPresetFromXml(xmlWithExtra);

    // Should still process same valid modules
    expect(protocol.sendPacket).toHaveBeenCalledTimes(4);
  });

  it('should send hardware clear packets for previously active DSP blocks absent from imported XML', async () => {
    await api.effects.setEffectById(5, EFFECT_MODELS.TAPE_DELAY.id);
    await api.effects.setEffectById(6, EFFECT_MODELS.LARGE_HALL.id);
    protocol.sendPacket.mockClear();

    // mockPresetXml only has Amplifier + Stompbox (no Delay or Reverb)
    await api.loadPresetFromXml(mockPresetXml);

    expect(store.getState().slots[0]?.modelId).toBe(EFFECT_MODELS.OVERDRIVE.id);
    expect(store.getState().slots[5]).toBeNull();
    expect(store.getState().slots[6]).toBeNull();

    // 2 clears (Delay + Reverb = 4 packets) + 2 modules (Amp + Stomp = 4 packets) = 8 packets
    expect(protocol.sendPacket).toHaveBeenCalledTimes(8);
  });

  it('should clamp Stompbox POS to pre-amp and resolve duplicate POS collisions across imported effects', async () => {
    const collidingXml = `
      <Preset name="Collision Test">
        <FX>
          <Stompbox>
            <Module ID="19" POS="6" BypassState="0" />
          </Stompbox>
          <Modulation>
            <Module ID="26" POS="3" BypassState="0" />
          </Modulation>
        </FX>
      </Preset>
    `;

    await api.loadPresetFromXml(collidingXml);
    const slots = store.getState().slots;

    // Stompbox POS=6 clamped to 3; Modulation POS=3 reassigned to next free pre-amp slot 0
    expect(slots[3]?.modelId).toBe(EFFECT_MODELS.OVERDRIVE.id);
    expect(slots[0]?.modelId).toBe(EFFECT_MODELS.SINE_CHORUS.id);
  });

  it('should clear stale presetDetails when importing XML without Info or switching presets', async () => {
    await api.loadPresetFromXml(mockPresetXml);
    expect(store.getState().presetDetails.author).toBe('Fender Audio');

    const minimalXml = `
      <Preset name="Bare">
        <Amplifier>
          <Module ID="0" POS="0" BypassState="0" />
        </Amplifier>
      </Preset>
    `;
    await api.loadPresetFromXml(minimalXml);
    expect(store.getState().presetDetails.author).toBeUndefined();

    // Re-import with author, select slot 0, then switch to slot 1 -> author should clear
    await api.loadPresetFromXml(mockPresetXml);
    store.setPresetActive(0, 'Slot 0');
    expect(store.getState().presetDetails.author).toBe('Fender Audio');

    store.setPresetActive(1, 'Slot 1');
    expect(store.getState().presetDetails.author).toBeUndefined();
  });
});
