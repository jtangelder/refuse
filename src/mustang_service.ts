import { Injectable } from "@angular/core";
import { MustangAPI } from "./lib/api";
import { FuseLoader } from "./lib/loader";

@Injectable({ providedIn: "root" })
export class MustangService extends MustangAPI {
  private readonly loader = new FuseLoader(this);

  loadPresetFile(xmlString: string) {
    return this.loader.loadPreset(xmlString);
  }
}
