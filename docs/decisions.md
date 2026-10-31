# Design decisions

Log of the project's structural choices. Each decision has a stable identifier (`D1`, `D2`…).

**Process**: an open question is added under [To decide](#to-decide) with a `P<n>` identifier. Once decided, it moves to [Decided](#decided) with the next `D<n>` number. An identifier is never reused.

---

## Decided

### Sources

- **D1. Treize Mondial as the first source.** Its ["matchs du jour"](https://treizemondial.fr/matchs-du-jour-rugby-a-xiii/) page lists every rugby league match of the day on one page, with the final score added after the match. It has no API, so the page is parsed (HTML).
- **D2. One adapter per source.** Each source has its own adapter that returns the same normalised result (competition, date, teams, score). The rest of the pipeline never knows where a score comes from, so adding a source only adds an adapter.
- **D3. French amateur football (FFF) left out.** Its JSON API works from a browser but answers `403` to requests from AWS.

### Scheduling

- **D4. A morning planner instead of hourly polling.** One run each morning reads the day's kick-off times and creates one **one-time schedule** per match, about 2 hours after kick-off. Compared with polling every hour: far fewer runs, the source website is read only when a result is expected, and nothing runs on days without matches. Trade-off: a match added to the page after the planner has run is not scheduled.
- **D5. Reschedule when the score is late.** If the score is not published when the schedule fires, `fetch-results` creates a new schedule one hour later instead of failing.

### Events and delivery guarantees

- **D6. An event bus between detection and notification.** `fetch-results` publishes a `MatchFinished` event instead of calling `notify` directly. The producer does not know its consumers: a new one (history, website rebuild) is a new rule on the bus, with no change to the producer (fan-out). Each consumer handles its own failures. Cost: one more hop, and custom events are billed ($1 per million, a fraction of a cent here).
- **D7. At-least-once delivery: send, then record.** `notify` checks DynamoDB, sends to Telegram, then records the score. A crash between sending and recording means a duplicate message, never a lost score. A rare duplicate is accepted.
- **D8. Idempotence key**: the page date and both teams, e.g. `2026-10-30|Angleterre|Papouasie-Nouvelle-Guinée`. Team names are kept exactly as published.
- **D9. Failed events go to a DLQ.** After Lambda's retries, a failing event lands in an SQS dead-letter queue, watched by an alarm, instead of being lost silently.

### Data and secrets

- **D10. DynamoDB in provisioned mode (1 read / 1 write unit).** The Always Free quota covers provisioned capacity, not on-demand. The load is a few writes per match day.
- **D11. Telegram as the notification channel.** Free, a real push notification on the phone, and a simple HTTP API.
- **D12. Secrets in SSM Parameter Store** (SecureString, AWS-managed key), never in the code, the repo or the logs. Preferred to Secrets Manager, which is billed per secret. The token is read once at cold start and kept in memory.

### Infrastructure and delivery

- **D13. AWS CDK in TypeScript** rather than Terraform: the same language as the Lambdas, security rules checked with cdk-nag, and deployments through CloudFormation, which rolls back a failed change.
- **D14. Deployment from GitHub Actions through OIDC.** GitHub assumes a short-lived AWS role: no access key is stored anywhere.
- **D15. Safe deployment: versions, `prod` alias, smoke test, automatic rollback.** Each deployment publishes new Lambda versions; the alias moves only if the smoke test passes.
- **D16. Every change goes through a pull request.** `main` is protected, squash merge only, all required checks must pass.
- **D22. cdk-nag blocks the pull request.** Its AWS Solutions rules run during `cdk synth`, so a violation fails the check and blocks the merge. When a rule does not fit (often because it asks for a paid option, see D17), it is acknowledged on that resource with a written reason, never disabled for the whole app.
- **D23. GitHub OIDC trust lives in its own stack, deployed by hand.** CI cannot create the role it signs in with, so `FinalWhistleGithubOidc` (the provider and the two roles) is deployed manually with `cdk deploy`. A change to it shows up in the pull request diff and is deployed by hand again.
- **D24. Two GitHub roles: pull requests read, `main` deploys.** The pull request role trusts only `repo:TomSoulage/final-whistle:pull_request` and can only assume the read-only CDK lookup role, used by `cdk diff --method=template`. The deploy role trusts only `repo:TomSoulage/final-whistle:ref:refs/heads/main`; through the CDK deploy role it reaches the bootstrap CloudFormation execution role, which still has `AdministratorAccess` until it is restricted ([#13](https://github.com/TomSoulage/final-whistle/issues/13)). Fork and Dependabot pull requests get no OIDC token, so the diff job is skipped for them. The diff goes to the job summary rather than a PR comment, so CI needs no write access to pull requests.
- **D25. A standalone AWS account, not an AWS "project" account.** Project accounts (the new AWS sign-up, e.g. with GitHub) carry AWS-managed service control policies that deny `iam:*Provider*` on both the Free and the Paid plan, which rules out OIDC (D14). A standalone account has no such policy. Daily access goes through an IAM user with MFA and `aws login`; the root user has MFA; no access keys exist.

### Cost and repository

- **D17. €0 to run.** Every service stays within the AWS Always Free quotas. The cost of any new resource is checked before adding it.
- **D18. Public repository from the first commit.** It makes the free security features available (CodeQL, secret scanning with push protection). Consequence: no secret may ever be committed, which Gitleaks and push protection enforce.
- **D19. English** for code, docs, commits and pull requests. Team and competition names stay as published (French).

### Tooling and dependencies

- **D20. Toolchain: npm, TypeScript 6.0, ESLint, Vitest, commitlint, tsx.** tsx runs the CDK app, as `cdk init` sets it up. Node 24 (`.nvmrc`). TypeScript stays on 6.0 because typescript-eslint does not support 7.x yet. ESLint enforces the measurable code rules of `CLAUDE.md`. Commitlint checks the PR title, since it becomes the squash commit, as well as each commit. Actions are restricted to GitHub-owned ones plus an explicit allowlist in the repository settings (currently `gitleaks/gitleaks-action` and `aws-actions/configure-aws-credentials`), and must be pinned to a full commit SHA; Dependabot keeps them up to date. A new third-party action needs an allowlist entry first.
- **D21. Dependabot sorts updates by risk.** Minor and patch updates are grouped into one weekly pull request, which should stay green. Each major update gets its own pull request, so a breaking one never blocks the safe ones. New versions are proposed only after a 7-day cooldown, to avoid compromised releases that get pulled within days. Two majors are ignored because their version is a decision, not a default: `typescript` (revisit when typescript-eslint supports 7.x) and `@types/node` (revisit when the Lambda Node.js runtime changes).

---

## To decide

- **P1. Several recipients.** Sending to more than one person (a list of chat ids), with one failure not blocking the others.
- **P2. Kick-off times missing in the morning.** What to do when a match has no kick-off time yet when the planner runs.
- **P3. Retry limit.** When to stop rescheduling a match whose score never comes (postponed or abandoned match).
