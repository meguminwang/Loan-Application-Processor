# Loan Application Processor

Backend scoring engine, state machine, and disbursement layer for an AI-powered loan processing system.

## Quick Start

```bash
npm install && npm start
# Database auto-migrates on startup. Server runs on http://localhost:3000
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/applications` | Submit a loan application |
| GET | `/applications/:id` | Get application details |
| POST | `/webhook/disbursement` | Receive disbursement webhook |
| GET | `/admin/applications?status=` | List/filter applications (Basic Auth) |
| GET | `/admin/applications/:id` | Full application detail (Basic Auth) |
| POST | `/admin/applications/:id/review` | Manual review decision (Basic Auth) |

Admin credentials: `admin` / `admin123`

## Architecture

```
src/
├── scoring/        # 5-factor weighted scoring engine
├── state-machine/  # Transition-table-driven state machine
├── webhook/        # Disbursement webhook processing
├── admin/          # Admin review endpoints + basic auth
├── applications/   # Application submission + duplicate detection
├── errors/         # Typed error classes
└── config/         # Centralized scoring weights, thresholds, and settings
```

### State Machine

```
submitted → processing → approved → disbursement_queued → disbursed
                       → denied                        → disbursement_failed → disbursement_queued (retry)
                       → flagged_for_review → approved / denied / partially_approved
                                              partially_approved → disbursement_queued
                                              disbursement_failed → disbursed (late success)
```

Every transition is validated against a transition table. Invalid transitions throw `InvalidStateTransitionError` (422). The `partially_approved` state was designed into the table from the start — adding it required zero changes to existing transitions. The `disbursement_failed → disbursed` transition handles late success webhooks that arrive after a failure was recorded.

### Scoring Engine

Five factors, weighted and configurable via `src/config/index.ts`:

| Factor | Weight | Scoring Logic |
|--------|--------|---------------|
| Income Verification | 30% | Documented vs stated income within 10% tolerance |
| Income Level | 25% | Binary: income ≥ 3× loan amount |
| Account Stability | 20% | Three sub-factors (proportional to known data): positive balance, no overdrafts, consistent deposits |
| Employment Status | 15% | employed (100) > self-employed (60) > unemployed (0) |
| Debt-to-Income | 10% | Withdrawal/deposit ratio, linear 20%-80% range |

## Design Decisions

### Income Verification Tolerance (Deliberate Ambiguity)

**Interpretation: 10% below stated income is the threshold.**

`documented_monthly_income >= stated_monthly_income × 0.9` → passes.

Rationale: The lender's risk is that an applicant **overstates** their income. If someone says they earn $5,000/mo but documents show $4,800 (4% below), that's within normal variance. But if documents show $1,400 against a stated $10,000 (Dave Liar scenario), that's fraud.

Documented income **above** stated income always passes — being conservative is not a risk.

### Null Data = 50 (Unknown Score)

When bank data or documented income is `null` (Carol Tester scenario), the factor scores 50 instead of 0. This pushes the application into the manual review range (50-74) rather than auto-deny. Business logic: "we don't have enough information" is not the same as "the information is bad."

When bank data is **partially** null (e.g., balance provided but overdraft status unknown), Account Stability scores proportionally based on only the known factors. Unknown fields are labeled "unknown" in the breakdown rather than assumed negative — a `null` overdraft field means "overdraft status unknown", not "has overdrafts."

### Income Level: Binary Scoring

Income ≥ 3× loan amount scores 100; below scores 0. Loan affordability is a hard gate — there's no meaningful middle ground between "can afford" and "can't afford."

### Retry Idempotency vs. Audit Trail (Conflicting Requirement)

**Solution: Separate the concerns into two tables.**

- `WebhookEvent` table: `transaction_id` has a unique index. Same `transaction_id` replayed → idempotent no-op (returns 200). This satisfies the product team.
- `AuditLog` table: Every webhook arrival, every state transition, every retry gets a new row with a unique `retry_id`. This satisfies the finance team.

The key insight: each **retry attempt** from the payment system sends a **new** `transaction_id` (because it's a new attempt). Only **replays** (same `transaction_id` due to network issues) are idempotent. So retry idempotency and audit trails don't actually conflict — they operate on different keys.

Concurrent duplicate webhooks (same `transaction_id` arriving simultaneously) are handled via the unique constraint on `WebhookEvent.transactionId` — if two requests race past the `findUnique` check, the second `create` fails with a P2002 constraint violation, which is caught and treated as an idempotent replay.

### Disbursement Timeout

Configurable at `config.disbursement.webhookTimeoutMinutes` (default: 30 min). In production, a background job would check for applications stuck in `disbursement_queued` past this timeout and flag them for manual review. Not implemented as a running cron in this take-home, but the data model supports it (`disbursementQueuedAt` timestamp).

### Transactional Atomicity

Application creation (duplicate check → create → score → transition → queue) runs inside a single Prisma transaction. If any step fails, the entire operation rolls back — no partial records left in the database. Similarly, webhook failure handling (transition → retry count update → re-queue) is atomic. The `transitionTo` function accepts an optional transaction client (`tx`) so it can participate in outer transactions while still being usable standalone.

## Running Tests

```bash
# Reset database and run all 8 test scenarios
npx prisma migrate reset --force
npm start &
bash test_all.sh
```

## Webhook Simulator

```bash
npm start &
bash simulate_disbursement.sh                    # Full demo (creates its own application)
bash simulate_disbursement.sh <application_id>   # Test against existing application
```

## Tech Stack

- **TypeScript** + **Express** — typed, explicit, no magic
- **Prisma** + **SQLite** — type-safe ORM, zero-config database
- **Typed Error Classes** — `InvalidStateTransitionError`, `DuplicateApplicationError`, `WebhookReplayError`
