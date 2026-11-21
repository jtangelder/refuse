import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AMP_MODELS, EFFECT_MODELS, FuseAPI } from '../index';
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

  it('should correctly resolve legacy FUSE ID 111 and official FUSE ID 272 to Orange Box (0x1001)', async () => {
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
    expect(EFFECT_MODELS.ORANGE_BOX.id).toBe(0x1001);
  });

  it('should import and export real Fender FUSE / offa/plug XML with decimal IDs, unshifted amp params, and wire metadata', async () => {
    const realFuseXml = `<?xml version="1.0" encoding="utf-8"?>
      <Preset amplifier="Mustang I/II" ProductId="1">
        <Amplifier>
          <Module ID="100" POS="0" BypassState="1">
            <Param ControlIndex="0">32896</Param>
            <Param ControlIndex="1">51400</Param>
            <Param ControlIndex="9">46260</Param>
            <Param ControlIndex="15">5</Param>
            <Param ControlIndex="16">6</Param>
            <Param ControlIndex="17">2</Param>
            <Param ControlIndex="19">1</Param>
            <Param ControlIndex="20">1</Param>
          </Module>
        </Amplifier>
        <FX>
          <Stompbox ID="1">
            <Module ID="272" POS="0" BypassState="0">
              <Param ControlIndex="0">32896</Param>
              <Param ControlIndex="1">41120</Param>
              <Param ControlIndex="2">28784</Param>
            </Module>
          </Stompbox>
          <Modulation ID="2">
            <Module ID="287" POS="4" BypassState="0">
              <Param ControlIndex="0">32896</Param>
              <Param ControlIndex="1">4</Param>
              <Param ControlIndex="2">2</Param>
              <Param ControlIndex="3">1</Param>
              <Param ControlIndex="4">32896</Param>
            </Module>
          </Modulation>
        </FX>
        <FUSE>
          <Info name="Real Bassman" author="Fender" tags="tweed">Real FUSE capture</Info>
        </FUSE>
      </Preset>
    `;

    await api.loadPresetFromXml(realFuseXml);
    const state = store.getState();

    // ID="100" (0x64) -> '59 Bassman, NOT Studio Preamp; amp is always enabled even when BypassState="1"
    expect(state.amp.modelId).toBe(AMP_MODELS.F59_BASSMAN.id);
    expect(state.amp.enabled).toBe(true);
    expect(state.amp.knobs[0]).toBe(128);
    expect(state.amp.knobs[1]).toBe(200);
    expect(state.amp.knobs[9]).toBe(180);
    expect(state.amp.knobs[15]).toBe(5); // Noise Gate Custom (unshifted)
    expect(state.amp.knobs[16]).toBe(6); // Threshold (unshifted)
    expect(state.amp.cabinetId).toBe(2); // 4x10 '59 Bassman (unshifted)
    expect(state.amp.knobs[19]).toBe(1); // Sag Normal (unshifted)
    expect(state.amp.knobs[20]).toBe(1); // Brightness On (unshifted)

    // Effects: ID="272" -> Orange Box (0x1001), ID="287" -> Diatonic Pitch Shifter (0x1f10)
    expect(state.slots[0]?.modelId).toBe(EFFECT_MODELS.ORANGE_BOX.id);
    expect(state.slots[4]?.modelId).toBe(EFFECT_MODELS.DIATONIC_PITCH_SHIFTER.id);
    expect(state.slots[4]?.knobs[1]).toBe(4);
    expect(state.slots[4]?.knobs[2]).toBe(2);
    expect(state.slots[4]?.knobs[3]).toBe(1);
    expect(state.presetDetails.author).toBe('Fender');
    expect(state.presetDetails.description).toBe('Real FUSE capture');

    // Verify transmitted packets contain required amp and effect wire metadata bytes
    const sentPackets = protocol.sendPacket.mock.calls.map((c: unknown[]) => c[0] as Uint8Array);
    const ampPacket = sentPackets[0];
    expect(Array.from(ampPacket.slice(44, 47))).toEqual([0x02, 0x02, 0x02]);
    expect(ampPacket[54]).toBe(0x67);
    const orangePacket = sentPackets[2];
    expect(Array.from(orangePacket.slice(19, 22))).toEqual([0x00, 0x08, 0x01]);
    const diatonicPacket = sentPackets[4];
    expect(Array.from(diatonicPacket.slice(19, 22))).toEqual([0x00, 0x08, 0x01]);

    // Export XML must emit official Fender FUSE IDs, unshifted discrete amp params, and <FUSE><Info>
    const exported = api.exportPresetToXml('Real Bassman');
    expect(exported).toContain('<Module ID="100" POS="0"');
    expect(exported).toContain('<Param ControlIndex="17">2</Param>');
    expect(exported).toContain('<Param ControlIndex="15">5</Param>');
    expect(exported).toContain('<Param ControlIndex="19">1</Param>');
    expect(exported).toContain('<Param ControlIndex="20">1</Param>');
    expect(exported).toContain('<Module ID="272" POS="0" BypassState="0">');
    expect(exported).toContain('<Module ID="287" POS="4" BypassState="0">');
    expect(exported).toContain('<FUSE>');
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

  it('should reject arbitrary non-preset XML without wiping active effects or transmitting packets', async () => {
    await api.effects.setEffectById(0, EFFECT_MODELS.OVERDRIVE.id);
    protocol.sendPacket.mockClear();

    await expect(api.loadPresetFromXml('<svg><rect width="10" height="10" /></svg>')).rejects.toThrow(
      /Invalid preset XML/,
    );
    expect(store.getState().slots[0]?.modelId).toBe(EFFECT_MODELS.OVERDRIVE.id);
    expect(protocol.sendPacket).not.toHaveBeenCalled();
  });

  it('should roll back store state if transmitting imported preset packets fails', async () => {
    await api.effects.setEffectById(5, EFFECT_MODELS.TAPE_DELAY.id);
    protocol.sendPacket.mockRejectedValueOnce(new Error('HID write failed'));

    await expect(api.loadPresetFromXml(mockPresetXml)).rejects.toThrow('HID write failed');
    expect(store.getState().slots[5]?.modelId).toBe(EFFECT_MODELS.TAPE_DELAY.id);
    expect(store.getState().slots[0]).toBeNull();
    expect(store.getState().presetDetails.author).toBeUndefined();
  });
});
