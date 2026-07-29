import type {
  ImportProvenance,
  RawRecord,
} from "@prospect-cockpit/connectors/import";

export interface NormalizedIdentity {
  sourceId?: string;
  organization?: string;
  domain?: string;
  personName?: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  date?: string;
}
export interface NormalizedProspect {
  raw: RawRecord;
  normalized: NormalizedIdentity;
}
export interface IdentityRecord extends NormalizedProspect {
  recordId: string;
  provenance: ImportProvenance[];
}
export type ResolutionKind =
  "stable-source-id" | "email" | "domain-organization" | "organization-person";
export interface ResolvedIdentity {
  record: IdentityRecord;
  sourceRecordIds: string[];
  resolution: {
    kind: ResolutionKind;
    reason: string;
    confidence: 1;
    comparedFields: string[];
  };
}
export interface CandidateMatch {
  leftRecordId: string;
  rightRecordId: string;
  reason: string;
  confidence: number;
  comparedFields: string[];
}
export interface DedupeResult {
  resolved: ResolvedIdentity[];
  candidates: CandidateMatch[];
  unresolved: IdentityRecord[];
}
