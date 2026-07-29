export class ImportStructureError extends Error {
  readonly code = "INVALID_IMPORT_STRUCTURE";
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImportStructureError";
  }
}
