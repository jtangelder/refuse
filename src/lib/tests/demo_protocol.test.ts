import { test, expect } from 'vitest';
import { DemoProtocol } from '../protocol/demo_protocol';
import { FuseAPI, AMP_MODELS, EFFECT_MODELS } from '../index';
import { Store } from '../store';
import { getModelDefault } from '../defaults';
import { OFFSETS } from '../protocol/constants';
import { setInterPacketDelay, resetInterPacketDelay } from '../protocol/write_queue';

test('DemoProtocol should connect and emit random configuration', async () => {
  const protocol = new DemoProtocol();
  expect(await protocol.connect()).toBe(true);
  expect(protocol.isConnected).toBe(true);

  // Set up event listener
  const packets: Uint8Array[] = [];
  protocol.addEventListener(data => {
    packets.push(data);
  });

  // Protocol specific: Request state should trigger emission
  // 0xff 0xc1
  const req = new Uint8Array([0xff, 0xc1]);
  await protocol.sendPacket(req);

  // Wait for async response simulation
  await new Promise(resolve => setTimeout(resolve, 100));

  expect(packets.length).toBeGreaterThan(2); // Preset + Amp + at least a few effects

  // Verify Preset Change
  const presetPacket = packets[0];
  expect(presetPacket[0]).toBe(0x1c);
  expect(presetPacket[2]).toBe(0x00); // Preset Change

  // Verify Amp Update
  const ampPacket = packets[1];
  expect(ampPacket[0]).toBe(0x1c);
  expect(ampPacket[2]).toBe(0x05); // AMP

  const ampModelId = (ampPacket[16] << 8) | ampPacket[17];
  const defaults = getModelDefault(ampModelId);
  const expectedCabId = defaults ? (defaults[OFFSETS.CABINET_ID] !== 0 ? defaults[OFFSETS.CABINET_ID] : 0x08) : 0x01;
  expect(ampPacket[OFFSETS.CABINET_ID]).toBe(expectedCabId);

  // Verify Effect Updates and Preset Info packets
  const effectPackets = packets.slice(2).filter(p => p[2] !== 0x04);
  expect(effectPackets.length).toBeGreaterThanOrEqual(2);
  effectPackets.forEach(p => {
    expect(p[0]).toBe(0x1c);
    // Type should be Stomp, Mod, Delay or Reverb
    expect(p[2]).toBeGreaterThanOrEqual(0x06);
    expect(p[2]).toBeLessThanOrEqual(0x09);
  });

  const presetInfoPackets = packets.slice(2).filter(p => p[2] === 0x04);
  expect(presetInfoPackets.length).toBe(24);

  await protocol.disconnect();
  expect(protocol.isConnected).toBe(false);
});

test('FuseAPI in demo mode should initialize', () => {
  const store = new Store();
  const protocol = new DemoProtocol();
  const api = new FuseAPI(store, protocol);
  expect(api).toBeDefined();
  // We can check internal state or properties if we want, but simple init check is good start
  expect(api.isSupported).toBe(true);
});

test('DemoProtocol should persist saved preset name and tone across preset switches', async () => {
  setInterPacketDelay(0);
  try {
    const store = new Store();
    const protocol = new DemoProtocol();
    const api = new FuseAPI(store, protocol);
    await api.connect();

    await api.amp.setAmpModelById(AMP_MODELS.SUPER_SONIC.id);
    await api.amp.setAmpKnob(0, 212);
    await api.effects.replaceAllEffects([{ slot: 0, modelId: EFFECT_MODELS.ORANGE_BOX.id, enabled: false }]);
    await api.presets.savePreset(5, 'Saved SuperSonic');

    // Switch away to slot 1
    await api.presets.loadPreset(1);
    expect(api.state.currentPresetSlot).toBe(1);

    // Reload saved slot 5 -> should restore Saved SuperSonic, Super-Sonic amp (Vol=212), and bypassed Orange Box
    await api.presets.loadPreset(5);
    expect(api.state.currentPresetSlot).toBe(5);
    expect(api.presets.getPreset(5)?.name).toBe('Saved SuperSonic');
    expect(api.amp.getAmpModel()?.id).toBe(AMP_MODELS.SUPER_SONIC.id);
    expect(api.amp.getAmpKnobs().find(k => k.name === 'Vol')?.value).toBe(212);
    expect(api.effects.getSettings(0)?.modelId).toBe(EFFECT_MODELS.ORANGE_BOX.id);
    expect(api.effects.getSettings(0)?.enabled).toBe(false);

    await api.disconnect();
  } finally {
    resetInterPacketDelay();
  }
});
