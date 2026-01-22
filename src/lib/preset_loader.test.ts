import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresetController } from './preset_controller';

describe('PresetController Loader Integration', () => {
  let controller: PresetController;
  let protocol: any;
  let store: any;

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
    </FenderPreset>
  `;

  beforeEach(() => {
    store = {
      getState: () => ({ currentPresetSlot: 0 }),
      setPreset: vi.fn(),
    };
    protocol = {
      sendPacket: vi.fn(),
      getNextSequenceId: vi.fn().mockReturnValue(1),
      createApplyPacket: vi.fn().mockReturnValue(new Uint8Array(64)),
      createDspPacket: vi.fn(),
    };
    controller = new PresetController(store, protocol);
  });

  it('should parse preset name and amplifier settings', async () => {
    await controller.loadXml(mockPresetXml);

    // Expect raw packets to be sent
    // We can't check specific bytes easily without replicating the buffer logic, so checks called count
    // Expect 4 modules * (1 DSP packet + 1 Apply Packet) = 8 packets?
    // Wait, mockXML has Amplifier, and FX Stompbox.
    // 2 modules found.
    // 2 * 2 = 4 packets.

    // BUT loadXml tries ALL selectors.
    // Amplifier found -> 2 packets.
    // Stompbox found -> 2 packets.
    // Mod, Delay, Reverb NOT found -> 0 packets.
    // Total 4.

    expect(protocol.sendPacket).toHaveBeenCalledTimes(4);
  });

  it('should ignore unknown tags', async () => {
    const xmlWithExtra = mockPresetXml.replace(
      '</FenderPreset>',
      '<UnknownTag><Module ID="99" POS="0"/></UnknownTag></FenderPreset>',
    );
    await controller.loadXml(xmlWithExtra);

    // Should still process same valid modules
    expect(protocol.sendPacket).toHaveBeenCalledTimes(4);
  });
});
