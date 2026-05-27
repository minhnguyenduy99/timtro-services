---
title: "fix: Set S3 Content-Disposition inline for mirrored attachments"
type: fix
status: completed
date: 2026-05-27
---

# fix: Set S3 Content-Disposition inline for mirrored attachments

## Summary

Set `Content-Disposition: inline` on attachment media objects uploaded by `DownloadAttachmentFunction` so AI clients and ChatGPT widgets can fetch and render rental photos in-browser instead of treating them as forced downloads.

---

## Problem Frame

Mirrored rental attachments are stored in the public S3 media bucket with `ContentType` only. Without an explicit inline disposition, some clients default to download behavior or fail to render images in embedded contexts (MCP widgets, agent `<img>` tags). MCP `search_rentals` already returns stable S3 HTTPS URLs; the missing piece is object metadata at upload time.

---

## Assumptions

*This plan was authored without synchronous user confirmation. The items below are agent inferences that fill gaps in the input — un-validated bets that should be reviewed before implementation proceeds.*

- `Content-Disposition: inline` (without a `filename` parameter) is sufficient for ChatGPT/MCP inline display; no `Cache-Control` changes are required in this pass.
- Photos and videos should both use `inline`; no per-type disposition split is needed.
- Existing S3 objects uploaded before this change are out of scope; only newly mirrored uploads (or re-mirror after URL change) pick up the header.

---

## Requirements

- R1. Every attachment object written by `DownloadAttachmentService` via `S3MediaStore.putObjectStream` must include S3 object metadata `ContentDisposition: inline`.
- R2. Preserve existing upload behavior: `ContentType`, key layout, size limits, and DynamoDB URL update flow remain unchanged.
- R3. Unit tests assert the S3 put command includes inline disposition.

---

## Scope Boundaries

- Does not change bucket policy, CloudFront, or SAM template resources.
- Does not backfill or re-upload objects already in S3 without a disposition header.
- Does not modify MCP server, widget CSP, or `search_rentals` response shape.
- Does not add `Content-Disposition` response headers at the API layer (S3 object metadata only).

### Deferred to Follow-Up Work

- S3 batch metadata update or lifecycle re-mirror for historical objects missing inline disposition.
- Optional `Cache-Control` tuning for CDN/browser caching once CloudFront is added.

---

## Context & Research

### Relevant Code and Patterns

- `apps/timtro-crawler/src/services/aws-clients.ts` — `S3AttachmentMediaStore.putObjectStream` sends `PutObjectCommand` with `ContentType` only today.
- `apps/timtro-crawler/src/services/download-attachment.service.ts` — sole caller of `putObjectStream` for mirrored media.
- `apps/timtro-crawler/test/services/download-attachment.service.test.ts` — uses in-memory `S3MediaStore` mock; good for integration-style tests but does not cover real S3 command shape.
- `apps/timtro-mcp/src/chatgpt/attachment-csp.ts` — widgets allow `*.s3.ap-southeast-1.amazonaws.com`; inline disposition complements CSP allowlisting for display.

### Institutional Learnings

- Attachment mirroring architecture documented in `docs/plans/2026-05-26-001-feat-attachment-mirror-s3-plan.md`; this change is a small metadata fix on the existing upload path.

---

## Key Technical Decisions

- **Set disposition in `S3AttachmentMediaStore`:** Centralize the header at the S3 adapter rather than threading through `DownloadAttachmentService`, keeping the service focused on download/mirror orchestration.
- **Value `inline` for all mirrored media:** Matches user intent for AI inline display; avoids `attachment` disposition that triggers download prompts.
- **Test at the S3 adapter layer:** Mock `S3Client.send` and assert `PutObjectCommand` input includes `ContentDisposition: "inline"`.

---

## Open Questions

### Resolved During Planning

- **Where to set the header?** On S3 `PutObject` in `S3AttachmentMediaStore` — single choke point for all mirrored uploads.

### Deferred to Implementation

- Whether to include `filename="..."` in the disposition string for edge-case browser behavior (default: plain `inline` unless tests suggest otherwise).

---

## Implementation Units

- U1. **Add inline Content-Disposition to S3 uploads**

**Goal:** Mirrored attachment objects are stored with inline disposition metadata.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `apps/timtro-crawler/src/services/aws-clients.ts`
- Test: `apps/timtro-crawler/test/services/aws-clients.test.ts`

**Approach:**
- Extend `PutObjectCommand` in `S3AttachmentMediaStore.putObjectStream` with `ContentDisposition: "inline"`.
- Keep `S3MediaStore` interface signature unchanged unless a testability hook is strictly needed.

**Patterns to follow:**
- Existing buffered upload pattern in `S3AttachmentMediaStore` (read stream → `PutObjectCommand`).

**Test scenarios:**
- Happy path: mock S3 client receives `PutObjectCommand` with `ContentType`, `ContentDisposition: "inline"`, and expected `Key`/`Body`.
- Edge case: verify disposition is set regardless of content type (e.g., `image/jpeg` vs `video/mp4`).

**Verification:**
- New unit test passes; existing crawler test suite unchanged except where mocks assert upload metadata.

---

- U2. **Confirm download-attachment path unchanged**

**Goal:** Ensure service-level mirror flow still completes without interface churn.

**Requirements:** R2, R3

**Dependencies:** U1

**Files:**
- Test: `apps/timtro-crawler/test/services/download-attachment.service.test.ts`

**Approach:**
- Run existing download-attachment service tests; optionally extend in-memory mock to record disposition if useful for regression signal (not required if U1 covers S3 command shape).

**Test scenarios:**
- Integration: existing "streams downloads into S3" test still passes after U1.

**Verification:**
- `download-attachment.service.test.ts` green; no behavioral regression in handler tests.

---

## System-Wide Impact

- **Interaction graph:** Only `DownloadAttachmentFunction` → S3 put path affected; `UpdateAttachmentMetadataFunction` and MCP consumers unchanged.
- **Error propagation:** Unchanged — failed puts still surface as retry outcomes.
- **Unchanged invariants:** Public URL format, key pattern, DynamoDB attachment shape, and skip-already-mirrored logic.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Historical objects lack inline disposition | Document as follow-up; new mirrors get correct metadata |
| Some clients ignore disposition | `ContentType` remains set; inline is standard for image display |

---

## Sources & References

- Related plan: `docs/plans/2026-05-26-001-feat-attachment-mirror-s3-plan.md`
- AWS PutObject ContentDisposition: https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html
