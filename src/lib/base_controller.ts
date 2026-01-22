import { Store } from './store';
import { FuseProtocol } from './protocol';

import type { Command } from './protocol_decoder';

// Define generic events or leave it loose for now
export abstract class BaseController {
  protected store: Store;
  protected protocol: FuseProtocol;

  constructor(store: Store, protocol: FuseProtocol) {
    this.store = store;
    this.protocol = protocol;
  }

  abstract process(command: Command): boolean;
}
