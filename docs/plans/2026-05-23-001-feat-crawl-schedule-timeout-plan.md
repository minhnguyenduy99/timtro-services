---
title: "feat: Daily crawl schedule (UTC+7) and 15-minute Lambda timeout"
type: feat
status: completed
date: 2026-05-23
---

# feat: Daily crawl schedule (UTC+7) and 15-minute Lambda timeout

## Summary

Change `CrawlFunction` from a 30-minute rate schedule to a once-daily run at midnight in UTC+7, and raise its Lambda timeout to 15 minutes (900s) so long Apify actor runs can complete within a single invocation.

---

## Problem Frame

The crawler currently fires every 30 minutes with a 2-minute Lambda timeout. That cadence is heavier than needed for ingestion, and the timeout is too short if Apify runs approach or exceed two minutes. Operations want a single daily batch at local midnight (UTC+7) and headroom up to Lambda’s maximum timeout.

---

## Requirements

- R1. Replace `rate(30 minutes)` with a daily schedule at **00:00 UTC+7** (Indochina Time).
- R2. Set `CrawlFunction` timeout to **15 minutes** (900 seconds).
- R3. Keep existing `ScheduleV2` + `FlexibleTimeWindow: OFF` pattern; do not change sanitizer, queues, or crawl handler logic.
- R4. Update infra shape tests so CI catches schedule/timeout regressions.
- R5. Deploy via existing `sam deploy` path (no new parameters for schedule).

---

## Scope Boundaries

- Changing `SanitizeFunction` timeout or `SanitizationQueue.VisibilityTimeout` (already 900s; unrelated to crawl trigger).
- Apify actor input tuning (`resultsLimit`, date window) or async/polling architecture for runs longer than 15 minutes.
- CloudWatch alarms, Slack notifications, or manual “run now” triggers.
- Restoring or rewriting `.github/workflows/timtro-crawler.yml` unless needed only to fix a broken test read (out of scope unless the workflow file is missing in the branch being merged).

### Deferred to Follow-Up Work

- Capture a `docs/solutions/` learning after first production run under the new schedule (observed Apify duration vs. 900s ceiling).
- Optional doc sync for `docs/plans/2026-05-19-001-feat-timtro-crawler-service-plan.md` (historical R3 still says 30 minutes).

---

## Context & Research

### Relevant Code and Patterns

- `apps/timtro-crawler/template.yaml` — sole source of truth for `CrawlFunction` schedule and timeout (`ScheduleExpression: rate(30 minutes)`, `Timeout: 120`).
- `apps/timtro-crawler/test/infra/template-shape.test.ts` — asserts `ScheduleExpression: rate(30 minutes)`; must be updated.
- `apps/timtro-crawler/events/crawl-schedule.json` — local invoke fixture; event **shape** only (`aws.scheduler`); no schedule expression embedded.
- Apify crawl blocks on `actor.call()` in `apps/timtro-crawler/src/providers/apify-client.provider.ts` — Lambda timeout is the hard ceiling for a run.

### Institutional Learnings

- No `docs/solutions/` corpus yet. Prior plan (`docs/plans/2026-05-19-001-feat-timtro-crawler-service-plan.md`) chose `ScheduleV2` + `rate(30 minutes)` and sanitizer SQS visibility 900s > sanitizer Lambda 120s.

### External References

- [EventBridge Scheduler cron expressions](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-scheduled-rule-pattern.html) — 6-field `cron(minute hour day-of-month month day-of-week year)`.
- [SAM ScheduleV2 event](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-schedulev2.html) — supports `ScheduleExpressionTimezone`.
- IANA `Asia/Ho_Chi_Minh` — UTC+7, no DST (matches “UTC+7” intent).

---

## Key Technical Decisions

- **Timezone-aware cron over UTC offset math:** Use `ScheduleExpression: cron(0 0 * * ? *)` with `ScheduleExpressionTimezone: Asia/Ho_Chi_Minh` so midnight stays correct without manual UTC conversion (`17:00 UTC` would drift if policy ever changes). Alternative `Asia/Bangkok` is equivalent (UTC+7).
- **Keep `FlexibleTimeWindow: OFF`:** Daily job should fire at the configured instant, not in a flexible window.
- **Timeout 900 seconds:** 15 minutes = AWS Lambda maximum; satisfies R2 without further template changes. No SQS visibility change — crawl is EventBridge-triggered, not queue-consumed.
- **Sanitizer stack unchanged:** `SanitizationQueue.VisibilityTimeout: 900` still exceeds `SanitizeFunction.Timeout: 120`.

---

## Open Questions

### Resolved During Planning

- **Which timezone identifier?** `Asia/Ho_Chi_Minh` (standard for Vietnam UTC+7). Use `Asia/Bangkok` only if the team standardizes on that name elsewhere.
- **Does 15 minutes require SQS changes?** No — only `CrawlFunction` timeout changes.

### Deferred to Implementation

- **Production Apify duration:** If runs often exceed 900s, implementation may need actor limits or async design (out of scope here).

---

## Implementation Units

- U1. **Update SAM crawl schedule and timeout**

**Goal:** Infrastructure reflects daily midnight UTC+7 and 15-minute crawl timeout.

**Requirements:** R1, R2, R3, R5

**Dependencies:** None

**Files:**
- Modify: `apps/timtro-crawler/template.yaml`

**Approach:**
- Under `CrawlFunction.Events.CrawlSchedule.Properties`:
  - Set `ScheduleExpression: cron(0 0 * * ? *)`
  - Add `ScheduleExpressionTimezone: Asia/Ho_Chi_Minh`
  - Update `Description` to state daily midnight ICT (UTC+7)
  - Keep `FlexibleTimeWindow.Mode: "OFF"`
- Set `CrawlFunction.Properties.Timeout: 900`

**Patterns to follow:**
- Existing `ScheduleV2` block in `apps/timtro-crawler/template.yaml` (lines 125–131)

**Test scenarios:**
- Test expectation: none — behavior verified via U2 template assertions and deploy validation

**Verification:**
- `pnpm nx run timtro-crawler:sam:validate` succeeds (or project’s SAM validate target)
- Deployed stack shows EventBridge schedule with daily cron and `CrawlFunction` timeout 900s

---

- U2. **Align infra shape tests**

**Goal:** CI fails if schedule or crawl timeout regresses.

**Requirements:** R4

**Dependencies:** U1

**Files:**
- Modify: `apps/timtro-crawler/test/infra/template-shape.test.ts`

**Approach:**
- Replace `ScheduleExpression: rate(30 minutes)` assertion with cron + timezone (substring or dedicated `it` block)
- Add assertion that `CrawlFunction` section includes `Timeout: 900` (avoid matching unrelated `VisibilityTimeout: 900` on the queue — scope the check to crawl function context or use a focused regex)

**Patterns to follow:**
- Existing `template-shape.test.ts` string containment style

**Test scenarios:**
- **Happy path:** Template contains `ScheduleExpression: cron(0 0 * * ? *)` and `ScheduleExpressionTimezone: Asia/Ho_Chi_Minh`
- **Happy path:** Template contains crawl timeout 900 in `CrawlFunction` context
- **Regression:** Template still contains `Type: ScheduleV2` and does not contain `rate(30 minutes)`

**Verification:**
- `pnpm nx test timtro-crawler` passes, including infra tests

---

- U3. **Post-deploy smoke check (manual)**

**Goal:** Confirm scheduler and timeout in AWS after deploy.

**Requirements:** R1, R2, R5

**Dependencies:** U1, U2

**Files:**
- None (operational verification)

**Approach:**
- After `sam deploy` to target env, inspect EventBridge Scheduler rule for `CrawlFunction` and Lambda configuration timeout in console or CLI
- Optionally run `pnpm nx run timtro-crawler:crawl:invoke` locally (unchanged event shape) to confirm handler still runs

**Test scenarios:**
- Test expectation: none — manual ops verification

**Verification:**
- Scheduler shows daily cron with timezone `Asia/Ho_Chi_Minh`
- Lambda `CrawlFunction` timeout = 900 seconds in the deployed stack

---

## System-Wide Impact

- **Interaction graph:** Only EventBridge Scheduler → `CrawlFunction` timing changes; DynamoDB writes and SQS enqueue behavior unchanged.
- **Error propagation:** Unchanged — Apify failures still fail the scheduled invocation.
- **State lifecycle risks:** Lower crawl frequency means at most one ingestion wave per day; stale data window may widen until next run (accepted trade-off).
- **API surface parity:** N/A
- **Integration coverage:** No code path changes; schedule is infra-only.
- **Unchanged invariants:** `SanitizeFunction`, SQS batching, handler contracts, and `events/crawl-schedule.json` shape remain the same.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Apify run exceeds 900s | Monitor first runs; tune actor input or design async follow-up if needed |
| Missed day if Lambda fails at midnight | Rely on EventBridge retry / ops alarms (alarms out of scope) |
| Wrong timezone ID | Use `Asia/Ho_Chi_Minh`; verify in AWS console after deploy |
| SAM ScheduleV2 timezone unsupported in old CLI | Use SAM CLI version already used in CI; validate with `sam validate` |

---

## Documentation / Operational Notes

- Communicate schedule change to anyone expecting 30-minute freshness.
- First midnight run after deploy may not occur until the next calendar day in ICT unless manually invoked.
- No `env.*.json` parameter changes required — schedule is not parameterized.

---

## Sources & References

- Related code: `apps/timtro-crawler/template.yaml`, `apps/timtro-crawler/test/infra/template-shape.test.ts`
- Prior plan: `docs/plans/2026-05-19-001-feat-timtro-crawler-service-plan.md` (R3, schedule design)
- AWS EventBridge cron and SAM ScheduleV2 docs (see Context)
