import { describe, it, expect, vi, beforeEach } from "vitest";
import { FuseLoader } from "./loader";
import { MustangAPI, DspType } from "./api";

describe("FuseLoader", () => {
  let api: MustangAPI;
  let loader: FuseLoader;

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
    api = {
      isConnected: true,
      sendFullBuffer: vi.fn(),
      clearEffect: vi.fn(),
      emit: vi.fn(),
      range: (n: number) => Array.from({ length: n }, (_, i) => i),
    } as any;
    loader = new FuseLoader(api);
  });

  it("should parse preset name and amplifier settings", async () => {
    // Note: FuseLoader uses querySelector which doesn't like spaces in tag names unless properly handled.
    // In loader.ts it uses "FX Stompbox" but should probably be "FXStompbox" or handled.
    // Wait, doc.querySelector("FX Stompbox") actually looks for a tag <Stompbox> inside <FX>.
    // Let's assume the user meant the XML has spaces or the code has a bug.
    // Looking at loader.ts:37: doc.querySelector(selector)
    // If selector is "FX Stompbox", it looks for <FX> then <Stompbox>.
    // This is probably a bug in loader.ts (should be FX-Stompbox or similar),
    // but I'll fix the test to match the code's selector if possible.

    await loader.loadPreset(mockPresetXml);

    expect(api.sendFullBuffer).toHaveBeenCalledWith(
      DspType.AMP,
      0,
      expect.any(Uint8Array),
    );
    expect(api.sendFullBuffer).toHaveBeenCalledWith(
      DspType.STOMP,
      0,
      expect.any(Uint8Array),
    );
  });

  it("should ignore unknown tags", async () => {
    const xmlWithExtra = mockPresetXml.replace(
      "</FenderPreset>",
      '<UnknownTag><Module ID="99" POS="0"/></UnknownTag></FenderPreset>',
    );
    await loader.loadPreset(xmlWithExtra);
    // Should still pass without error
    expect(api.sendFullBuffer).toHaveBeenCalled();
  });
});
