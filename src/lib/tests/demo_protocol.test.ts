import { test, expect } from 'vitest';
import { DemoProtocol } from '../protocol/demo_protocol';
import { FuseAPI } from '../index';
import { Store } from '../store';
import { getModelDefault } from '../defaults';
import { OFFSETS } from '../protocol/constants';

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
