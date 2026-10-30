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
});
