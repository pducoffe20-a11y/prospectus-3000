import type { SourceAdapter } from "./source-adapter.js";
import type { SourceCapability } from "./source-request.js";

export class DuplicateSourceAdapterError extends Error {
  constructor(readonly adapterId: string) {
    super(`A source adapter with ID "${adapterId}" is already registered`);
    this.name = "DuplicateSourceAdapterError";
  }
}

/** In-memory catalog of the source adapters available to a process. */
export class SourceAdapterRegistry {
  readonly #adapters = new Map<string, SourceAdapter>();

  constructor(adapters: Iterable<SourceAdapter> = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: SourceAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new DuplicateSourceAdapterError(adapter.id);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  get(id: string): SourceAdapter | undefined {
    return this.#adapters.get(id);
  }

  getById(id: string): SourceAdapter | undefined {
    return this.get(id);
  }

  byCapability(capability: SourceCapability): readonly SourceAdapter[] {
    return [...this.#adapters.values()].filter((adapter) =>
      adapter.capabilities.includes(capability),
    );
  }

  getByCapability(capability: SourceCapability): readonly SourceAdapter[] {
    return this.byCapability(capability);
  }
}
