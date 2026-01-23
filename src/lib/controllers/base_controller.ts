import { Store } from '../store';
import { Protocol } from '../protocol/protocol';

// Define generic events or leave it loose for now
export abstract class BaseController {
  protected store: Store;
  protected protocol: Protocol;

  constructor(store: Store, protocol: Protocol) {
    this.store = store;
    this.protocol = protocol;
  }
}
