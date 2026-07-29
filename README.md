# Prospect Intelligence Cockpit

Seller-side prospect intelligence for evidence-backed prioritization, research, and human-reviewed outreach preparation.

## Foundation status

Milestones 1 through 3 are implemented. The repository now contains the pnpm/TypeScript workspace, the approved design contract, versioned Zod and JSON Schema contracts, external serializers, the initial PostgreSQL migration, transactional repositories, a compliant public-research retrieval boundary, and foundation, contract, schema, integration, and end-to-end tests.

Public retrieval permits bounded HTTP(S) text, HTML, and JSON from DNS-verified public hosts only. It does not retrieve LinkedIn, local or private network targets, or use scraping as a fallback when a search provider is unavailable.

- [System overview](docs/architecture/system-overview.md)
- [Approved design contract](docs/architecture/design-contract.md)
- [Design concepts](docs/design/concepts/)

## Local checks

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Node.js 20+ and pnpm 10+ are required. Copy `.env.example` to `.env` only when a runtime milestone needs local configuration; never commit credentials.
