# Prospect Intelligence Cockpit

Seller-side prospect intelligence for evidence-backed prioritization, research, and human-reviewed outreach preparation.

## Current milestone

Milestone 1 establishes the pnpm/TypeScript workspace, deployment topology, architecture overview, and six proposed desktop/mobile design concepts. The concepts are intentionally awaiting explicit approval before live UI implementation.

- [System overview](docs/architecture/system-overview.md)
- [Proposed design contract and approval checkpoint](docs/architecture/design-contract.md)
- [Design concepts](docs/design/concepts/)

## Local checks

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Node.js 20+ and pnpm 10+ are required. Copy `.env.example` to `.env` only when a runtime milestone needs local configuration; never commit credentials.
