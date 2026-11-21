import type { MustangDeviceSpec } from './constants';

export type ProtocolEventListenerFn = (data: Uint8Array) => void;

export interface IProtocol {
  isConnected: boolean;
  isSupported: boolean;
  readonly deviceName?: string;
  readonly productId?: number;
  readonly deviceSpec?: MustangDeviceSpec;
  readonly lastError?: string | null;
  onDisconnect?: () => void;

  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  addEventListener(callback: ProtocolEventListenerFn): void;
  removeEventListener(callback: ProtocolEventListenerFn): void;
  sendPacket(data: Uint8Array): Promise<void>;
  getNextSequenceId(): number;
}
