# CLAUDE.md

Event-driven serverless pipeline on AWS that detects sports results and pushes them to Telegram. Context: [README.md](./README.md), choices: [docs/decisions.md](./docs/decisions.md).

## Workflow

- **Built step by step**: never present something as built before it is. The README "Status" section and the v1 milestone are the source of truth.
- **One branch per task**, created from an up-to-date `main`, named `type/slug` (`feat/…`, `fix/…`, `docs/…`, `ci/…`…). Never commit or push to `main`.
- **Pull request for every change**, squash merge only, after approval. No automatic merge.
- **Decisions**: a new structural choice = a `Dxx` entry in `docs/decisions.md`, following the process at the top of the file.

## Commits (Conventional Commits)

Format checked against `@commitlint/config-conventional`:

```
type(scope): subject
```

- **type**: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `build`, `chore`, `perf`, `style`, `revert`.
- **scope** (optional, lowercase): `planner`, `fetch-results`, `notify`, `infra`, `ci`, `docs`…
- **subject**: imperative, lowercase, no final period, header ≤ 72 characters.
- Small commits, one intent each. A breaking change is marked with `!` (`feat(notify)!: …`).

## Language

- Code, docs, commits, pull requests: **English**.
- Team and competition names: kept exactly as published (French).

## Architecture rules

- **One adapter per source**, all returning the same normalised result. The rest of the pipeline never depends on a source.
- **Lambdas only orchestrate**: parsing, formatting and decisions live in modules covered by unit tests.
- **`notify` order is fixed: check → send → remember.** Never record a score before it is sent: this order is what guarantees that no score is lost (at-least-once).
- **Logs are structured JSON** and always carry the match id.

## Code rules

- **KISS / YAGNI**: the simplest solution that works. No abstraction for a hypothetical need, no dependency without a reason.
- **DRY**: look for existing code before writing new code; extract shared logic instead of copying it.
- **One responsibility** per function and per file.
- **Explicit names** that state intent: `isAlreadySent`, `parseScores()`, not `data` or `handle()`.
- **Immutability**: never mutate a parameter; prefer `const` and return new values.
- **Errors are handled, never swallowed**: no empty `catch`, error messages say what failed and for which match.
- Functions < 30 lines, nesting ≤ 3 levels (early returns), named `UPPER_SNAKE_CASE` constants instead of magic values, no dead or commented-out code, no stray `console.log`.

The measurable rules will be enforced by ESLint in CI (`max-lines-per-function`, `max-depth`, `no-magic-numbers`, `no-param-reassign`, `prefer-const`, `no-unused-vars`, `no-console`, `no-empty`).

## Security and cost

- **No secret in the code, the repo or the logs.** Secrets live in SSM Parameter Store. Never create AWS access keys: deployments use OIDC.
- **Least privilege**: one IAM role per Lambda, scoped to the exact resources it uses.
- **€0 to run**: stay within AWS Always Free quotas. No customer-managed KMS keys, no VPC or NAT gateway, a retention period on every log group. Check the cost impact of any new resource before adding it.
- Do not work around a source's anti-bot protection.
