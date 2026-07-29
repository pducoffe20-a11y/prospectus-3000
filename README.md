# Prospect Intelligence Cockpit

Seller-side prospect intelligence for evidence-backed prioritization, research, and human-reviewed outreach preparation.

## Foundation status

Milestones 1 and 2 are merged. The repository now contains the pnpm/TypeScript workspace, the approved design contract, versioned Zod and JSON Schema contracts, external serializers, the initial PostgreSQL migration, transactional repositories, and foundation, contract, schema, integration, and end-to-end tests.

The next feature milestone is import, normalization, and identity resolution. That behavior is not part of the current foundation.

- [System overview](docs/architecture/system-overview.md)
- [Approved design contract](docs/architecture/design-contract.md)
- [Design concepts](docs/design/concepts/)
- [Local public research services](docs/operations/public-research.md)

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
