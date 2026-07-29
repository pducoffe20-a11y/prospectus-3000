import type { SourceCapability } from "./source-request.js";
import type { SourceRequest } from "./source-request.js";
import type { SourceResult } from "./source-result.js";

export const sourceAuthorities = [
  "system_of_record",
  "first_party",
  "third_party",
  "public",
] as const;
export type SourceAuthority = (typeof sourceAuthorities)[number];

export type SourceHealthStatus = "healthy" | "degraded" | "unavailable";

export interface SourceHealth {
  readonly status: SourceHealthStatus;
  readonly checkedAt: string;
  readonly message?: string;
}

/** Contract implemented by every bounded source integration. */
export interface SourceAdapter {
  readonly id: string;
  readonly capabilities: readonly SourceCapability[];
  readonly authority: SourceAuthority;
  health(): Promise<SourceHealth>;
  retrieve(request: SourceRequest): Promise<SourceResult>;
}
