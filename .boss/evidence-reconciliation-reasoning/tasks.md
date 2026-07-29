# Evidence Waves

## Repo Preflight

- Git：从 `origin/main` 的合并提交 `b1e2708` 创建 `codex/evidence-reconciliation-reasoning`；创建时工作树干净。
- CI：`.github/workflows/ci.yml` 执行冻结依赖安装、`pnpm check`、`pnpm analyze:unused`。
- 技术栈：Node 20、pnpm 10、TypeScript、Node test runner、tsx、ESLint、Prettier。
- 契约来源：`packages/contracts/src/evidence.ts` 与 `reasoning.ts`。
- 路由/迁移：不涉及。
- 未知：数据库对历史研究运行的不可变约束，本阶段不扩展。

## Wave 1 — 红测与契约

- 写集 owner（QA）：`tests/fixtures/conflicts/**`、`tests/integration/evidence-reasoning.test.ts`。
- 红测：独立来源、循环引用、陈旧/新官方来源、七类冲突、无证据解释、无决策行动、运行变化、未解决冲突。
- Stop Condition：测试因缺少核对/推理实现而失败，不因 fixture 或语法错误失败。
- 下一 Wave：生产 API 与红测契约明确。

## Wave 2 — 生产实现

- 写集 owner（Backend）：`packages/research/src/reconciliation/**`。
- 写集 owner（Reasoning）：`packages/reasoning/**`。
- 共享文件 owner（Orchestrator）：`packages/research/package.json`、`pnpm-lock.yaml`。
- Contract Matrix：规范化、来源独立性、佐证、冲突、推理、验证、变化解释。
- Stop Condition：focused test、typecheck、format、lint 通过且无评分实现。

## Wave 3 — 全门禁与交付

- 运行用户指定的完整验证矩阵和 CI parity unused-code 检查。
- 检查确定性重放、输入不可变性、评分/分配/UI 范围无意外 diff。
- 仅在全部门禁通过后提交、推送并创建草稿 PR。

## Blast Radius

- 预计新增或修改超过 10 个文件，并新增 workspace package/lockfile 条目。
- 用户已在任务中明确要求这些文件、完整验证、分支、提交、推送及草稿 PR，因此风险确认已由原始授权满足。
