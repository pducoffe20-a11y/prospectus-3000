import { candidateMatch, resolveExact } from "./resolve.js";
import type {
  DedupeResult,
  IdentityRecord,
  ResolvedIdentity,
} from "./types.js";

export function dedupeProspects(input: IdentityRecord[]): DedupeResult {
  const records = [...input].sort((a, b) =>
    a.recordId.localeCompare(b.recordId),
  );
  const consumed = new Set<string>();
  const resolved: ResolvedIdentity[] = [];
  const candidates: DedupeResult["candidates"] = [];
  for (let index = 0; index < records.length; index += 1) {
    const left = records[index];
    if (!left || consumed.has(left.recordId)) continue;
    for (let other = index + 1; other < records.length; other += 1) {
      const right = records[other];
      if (!right || consumed.has(right.recordId)) continue;
      const resolution = resolveExact(left, right);
      if (resolution) {
        const merged: IdentityRecord = {
          ...left,
          raw: structuredClone(left.raw),
          normalized: { ...right.normalized, ...left.normalized },
          provenance: [...left.provenance, ...right.provenance],
        };
        resolved.push({
          record: merged,
          sourceRecordIds: [left.recordId, right.recordId],
          resolution,
        });
        consumed.add(left.recordId);
        consumed.add(right.recordId);
        break;
      }
      const candidate = candidateMatch(left, right);
      if (candidate) candidates.push(candidate);
    }
  }
  const candidateIds = new Set(
    candidates.flatMap((candidate) => [
      candidate.leftRecordId,
      candidate.rightRecordId,
    ]),
  );
  return {
    resolved,
    candidates,
    unresolved: records.filter(
      (record) =>
        !consumed.has(record.recordId) && !candidateIds.has(record.recordId),
    ),
  };
}
