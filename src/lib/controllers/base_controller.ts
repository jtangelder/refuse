import { Store } from '../store';
import { FuseProtocol } from '../protocol';
import { EventEmitter } from '../event_emitter';

// Define generic events or leave it loose for now
export abstract class BaseController<Events extends Record<string, any> = {}> extends EventEmitter<Events> {
  protected store: Store;
  protected protocol: FuseProtocol;

  constructor(store: Store, protocol: FuseProtocol) {
    super();
    this.store = store;
    this.protocol = protocol;
  }

  abstract process(data: Uint8Array): boolean;
}
