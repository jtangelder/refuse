import { test, expect } from 'vitest';
import { DemoProtocol } from '../protocol/demo_protocol';
import { FuseAPI, AMP_MODELS, EFFECT_MODELS } from '../index';
import { Store } from '../store';
import { getModelDefault } from '../defaults';
import { OFFSETS } from '../protocol/constants';
import { setInterPacketDelay, resetInterPacketDelay } from '../protocol/write_queue';

test('DemoProtocol should connect and emit hardware-accurate startup dump ending with 0xff 0x01', async () => {
  const protocol = new DemoProtocol();
  expect(await protocol.connect()).toBe(true);
  expect(protocol.isConnected).toBe(true);

  // Set up event listener
  const packets: Uint8Array[] = [];
  protocol.addEventListener(data => {
    packets.push(data);
  });

  // Request state (0xff 0xc1)
  const req = new Uint8Array([0xff, 0xc1]);
  await protocol.sendPacket(req);

  // Wait for async response simulation
  await new Promise(resolve => setTimeout(resolve, 100));

  // 24 preset name pairs (48) + active preset (0x04 + AMP + 4x FX + 0x00 ACK = 7) + DUMP_COMPLETE (1) = 56
  expect(packets.length).toBe(56);

  // First 48 packets are 24 (PRESET_INFO 0x04 + PRESET_ACK 0x00) pairs
  const listPackets = packets.slice(0, 48);
  expect(listPackets.filter(p => p[0] === 0x1c && p[2] === 0x04).length).toBe(24);
  expect(listPackets.filter(p => p[0] === 0x1c && p[2] === 0x00).length).toBe(24);

  // Active preset header (0x1c 0x01 0x04)
  const activeHeader = packets[48];
  expect(activeHeader[0]).toBe(0x1c);
  expect(activeHeader[2]).toBe(0x04);
  expect(activeHeader[4]).toBe(0);

  // Active Amp Update (0x1c 0x01 0x05)
  const ampPacket = packets[49];
  expect(ampPacket[0]).toBe(0x1c);
  expect(ampPacket[2]).toBe(0x05); // AMP

  const ampModelId = (ampPacket[16] << 8) | ampPacket[17];
  const defaults = getModelDefault(ampModelId);
  const expectedCabId = defaults ? (defaults[OFFSETS.CABINET_ID] !== 0 ? defaults[OFFSETS.CABINET_ID] : 0x08) : 0x01;
  expect(ampPacket[OFFSETS.CABINET_ID]).toBe(expectedCabId);
  // Discrete amp parameters must stay in valid Mustang hardware bounds
  expect(ampPacket[32 + 15]).toBeLessThanOrEqual(5); // noiseGate
  expect(ampPacket[32 + 16]).toBeLessThanOrEqual(9); // threshold
  expect(ampPacket[32 + 19]).toBeLessThanOrEqual(2); // sag
  expect(ampPacket[32 + 20]).toBeLessThanOrEqual(1); // brightness

  // 4 Effect Updates (STOMP, MOD, DELAY, REVERB)
  const effectPackets = packets.slice(50, 54);
  expect(effectPackets.length).toBe(4);
  effectPackets.forEach(p => {
    expect(p[0]).toBe(0x1c);
    expect(p[2]).toBeGreaterThanOrEqual(0x06);
    expect(p[2]).toBeLessThanOrEqual(0x09);
  });

  // End-of-preset ACK (0x1c 0x01 0x00) + End-of-dump terminator (0xff 0x01)
  expect(packets[54][0]).toBe(0x1c);
  expect(packets[54][2]).toBe(0x00);
  expect(packets[55][0]).toBe(0xff);
  expect(packets[55][1]).toBe(0x01);

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
