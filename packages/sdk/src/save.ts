import { RetroEngine } from './engine';

export class SaveManager {
  private lastAutosave = 0;

  constructor(private engine: RetroEngine) { }

  set(key: string, value: unknown, slot = 0): void {
    if (this.engine.raw) {
      this.engine.raw.save_set(slot, key, JSON.stringify(value));
    }
  }

  get<T = unknown>(key: string, slot = 0): T | undefined {
    if (!this.engine.raw) return undefined;
    const val = this.engine.raw.save_get(slot, key);
    if (val === null || val === undefined) return undefined;
    return val as T;
  }

  remove(key: string, slot = 0): void {
    if (this.engine.raw) {
      this.engine.raw.save_remove(slot, key);
    }
  }

  export(slot = 0): string {
    if (!this.engine.raw) return '{}';
    return this.engine.raw.save_export(slot);
  }

  import(json: string, slot = 0): void {
    if (this.engine.raw) {
      this.engine.raw.save_import(slot, json);
    }
  }

  autosave(key: string, slot = 0): void {
    const now = Date.now();
    if (now - this.lastAutosave < 1000) return; // debounce 1 second
    this.lastAutosave = now;

    const json = this.export(slot);
    try {
      localStorage.setItem(key, json);
    } catch {
      // localStorage may be unavailable
    }
  }

  autoload(key: string, slot = 0): boolean {
    try {
      const json = localStorage.getItem(key);
      if (json) {
        this.import(json, slot);
        return true;
      }
    } catch {
      // localStorage may be unavailable
    }
    return false;
  }
}
