# Prospect Intelligence Cockpit — system overview

## Milestone status

This repository is intentionally at **Milestone 1: foundation and design approval**. The runtime UI, intelligence pipeline, connectors, and persistence layer are not represented as complete. UI implementation is blocked on explicit approval of the concept set in `docs/design/concepts/`.

## Product boundary

The cockpit converts imported seller records and permitted public evidence into an inspectable execution queue. Deterministic policy code—not a model and not a view—assigns authoritative prospect status. Outreach is preparation-only and always enters human review; there is no autonomous sending.

## Planned topology

```text
imports + permitted public sources
               │
               ▼
  PostgreSQL-backed worker queue
               │
   identity → evidence → reasoning
       → scoring → decision → outreach QA
               │
        immutable run artifacts
          ┌────┴────┐
          ▼         ▼
     Next.js web   offline dashboard.html
```

The web process and persistent worker share versioned contracts and PostgreSQL repositories. The offline exporter consumes the same validated external strategy artifacts. Views may render decisions but may not rescore or reinterpret them.

## Workspace boundaries

- `apps/web`: live cross-device seller cockpit and HTTP API.
- `apps/worker`: durable job orchestration and pipeline execution.
- `packages/contracts`: Zod, TypeScript, JSON Schema, and external serializers.
- `packages/db`: normalized schema, migrations, and transactional repositories.
- Domain packages isolate retrieval, research, reasoning, scoring, outreach, memory, UI, and offline export behavior.
- `tests`: cross-package integration, security, accessibility, and browser journeys.

## Runtime and deployment

Node.js 20 and pnpm 10 are the supported baseline. `render.yaml` declares one web service, one persistent background worker, and one managed PostgreSQL database. Secrets are injected by the host; `.env.example` contains names and explanations only.

## Non-negotiable trust boundaries

1. Public retrieval allows only validated HTTP(S) targets and revalidates DNS and redirects.
2. LinkedIn remains import- and user-context-only.
3. Source content is untrusted data, never pipeline instruction.
4. Every decision, draft-specific claim, and change explanation remains traceable.
5. Missing, stale, partial, blocked, and conflicted states remain explicit.
6. Historical artifacts and feedback events are append-only and policy-versioned.
