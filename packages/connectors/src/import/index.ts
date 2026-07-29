export * from "./csv.js";
export * from "./excel.js";
export * from "./json.js";
export * from "./errors.js";
export * from "./types.js";

/** Neutralizes spreadsheet formula prefixes without altering the source value during import. */
export function sanitizeExportCell<T>(value: T): T | string {
  return typeof value === "string" && /^[=+\-@]/.test(value)
    ? `'${value}`
    : value;
}
