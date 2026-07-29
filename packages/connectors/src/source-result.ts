import type { SourceMetadata } from "./source-request.js";

export const policyDecisions = [
  "allowed",
  "blocked",
  "not_applicable",
] as const;
export type PolicyDecision = (typeof policyDecisions)[number];

export const robotsDecisions = [
  "allowed",
  "blocked",
  "not_applicable",
  "unknown",
] as const;
export type RobotsDecision = (typeof robotsDecisions)[number];

export const retrievalMethods = [
  "api",
  "authenticated_api",
  "file_import",
  "web_fetch",
  "search",
  "manual",
] as const;
export type RetrievalMethod = (typeof retrievalMethods)[number];

export interface RetrievalDecision {
  readonly policy: PolicyDecision;
  readonly robots: RobotsDecision;
  readonly reason?: string;
}

/**
 * A deliberately bounded representation of retrieved material.
 *
 * Adapters retain excerpts and descriptive metadata, never a complete republished page.
 */
export interface BoundedSourceDocument {
  readonly id: string;
  readonly normalizedSourceUrl: string;
  readonly title?: string;
  readonly decision: RetrievalDecision;
  readonly retrievalMethod: RetrievalMethod;
  readonly retrievedAt: string;
  readonly publishedAt?: string;
  readonly contentHash: string;
  readonly excerpts: readonly string[];
  readonly metadata: SourceMetadata;
}

interface SourceResultBase {
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SourceSuccessResult extends SourceResultBase {
  readonly status: "success";
  readonly documents: readonly BoundedSourceDocument[];
}

export interface SourceBlockedResult extends SourceResultBase {
  readonly status: "blocked";
  readonly reason: string;
  readonly decision: RetrievalDecision;
  readonly normalizedSourceUrl?: string;
}

export interface SourceEmptyResult extends SourceResultBase {
  readonly status: "empty";
  readonly reason?: string;
}

export interface SourceLimitedResult extends SourceResultBase {
  readonly status: "limited";
  readonly reason: string;
  readonly documents: readonly BoundedSourceDocument[];
  readonly retryAfter?: string;
}

export interface SourceFailedResult extends SourceResultBase {
  readonly status: "failed";
  readonly errorCode: string;
  readonly message: string;
  readonly retryable: boolean;
}

export type SourceResult =
  | SourceSuccessResult
  | SourceBlockedResult
  | SourceEmptyResult
  | SourceLimitedResult
  | SourceFailedResult;
