# Whole-project review findings

**Review scope:** Entire `pi-git` repository at `HEAD` (`348d425`), not only the latest commit's diff. Three fresh-context reviewers inspected the repository with distinct angles: runtime correctness, security/side-effect boundaries, and TypeScript/tests/maintainability. Findings below are consolidated and deduplicated. Line references point to the source reviewed; they may shift as files change.

**Overall verdict: BLOCK** — the review identified P1 findings affecting read-only guarantees, review integrity, cancellation, and publication targeting. No fixes were applied as part of the review.

## P1 — Fix before release

### 1. `git_diff` can write files despite being documented as read-only

**Evidence:** `src/tools/git-diff.ts:70-75` appends `commit` and `compareWith` directly to the `git diff` argument list. `src/git.ts:83-85` invokes Git with those arguments. Although this uses `execFile` rather than a shell, Git still parses option-shaped values as options.

**Example:** Supplying `commit: "--output=/tmp/target"` can invoke `git diff --output=/tmp/target`, writing the diff to that path without a review prompt. This contradicts the read-only tool contract in `README.md:35-41`.

**Suggested fix:** Validate and resolve user-provided refs to canonical commit IDs before passing them as revisions, or otherwise ensure they cannot be interpreted as options. Add a regression test with an option-shaped ref.

### 2. A reviewed PR-thread reply can send local file contents instead of the reviewed body

**Evidence:** `src/tools/reply-to-pr-thread.ts:65-68` constructs `gh api` arguments using `-F key=value`; `src/tools/reply-to-pr-thread.ts:119-122` passes both `threadId` and the reviewed body this way. `gh api -F` treats values beginning with `@` as file inputs. The review UI displays the literal body (`src/tools/reply-to-pr-thread.ts:85-88`), so a body such as `@/path/to/file` can cause file contents to be posted instead of the approved text.

**Suggested fix:** Send string variables using a literal-safe mechanism (for example, a raw field or JSON request body) so values beginning with `@` remain literal. Ensure the values actually sent are the ones shown in the review.

### 3. Aborting a tool call does not cancel a pending review or prevent later side effects

**Evidence:** Write-tool handlers accept an `AbortSignal` but do not use it (for example, `src/tools/commit.ts:67-70` and `src/tools/create-pr.ts:224-253`). Review UI calls do not receive a signal (`src/review.ts:52-55`), and subprocess helpers do not pass one to `execFile` (`src/git.ts:10-13`).

**Impact:** If a call is aborted while its approval prompt is open, accepting the still-open prompt can continue to staging or publishing (for example, `src/tools/commit.ts:96-108`). An already-started child process is not cancelled either.

**Suggested fix:** Propagate the abort signal to dialogs and subprocesses where supported, dismiss or guard pending prompts on abort, and check for abort immediately before every side effect.

### 4. Commit/amend approval can omit staged files that the operation includes

**Evidence:** In `src/tools/commit.ts:32-46, 88-108`, when `files` is omitted, `buildCommitSections` returns no staged-file section, but `runCommit` commits the existing index. In `src/tools/amend.ts:59-67, 143-161`, `stagedFiles` is set to an empty array when `files` is omitted, so the prompt omits staged paths even though `git commit --amend` includes the index.

**Impact:** A user can approve a commit or amend without seeing the full set of staged paths that will be included. This undermines the review gate's purpose and the README's description that amend shows what is changing (`README.md:49`).

**Suggested fix:** Always collect and display the staged paths that will be included, or prevent unlisted staged changes from being included. Add tests for both tools with staged changes and no explicit `files` argument.

### 5. Comment approval does not identify the publication target

**Evidence:** The issue-comment prompt receives only the body (`src/tools/add-issue-comment.ts:26, 75-76`); the number and resolved repository context are used after approval (`:69, 88-90`). The PR-comment tool follows the same pattern (`src/tools/add-pr-comment.ts:26, 75-76, 88-90`). `workingDir` can select another repository (`README.md:61`).

**Impact:** A user can approve text without seeing which repository and issue/PR will receive it. The existing `TODO.md` item already tracks this behavior.

**Suggested fix:** Include the resolved repository and target number in the review prompt, and use that same resolved target when posting.

## P2 — Report-only improvements

### 6. `git_pr_comments` can omit results while promising “all comments”

**Evidence:** `src/tools/read-pr-comments.ts:102-135` requests at most 100 conversation comments, 100 review threads, 20 comments per thread, and 100 reviews; it does not paginate using cursors. Formatting consumes only the returned nodes (`:402-406`). The README promises all PR comments (`README.md:41`).

**Suggested fix:** Paginate the GraphQL connections, or clearly report truncation and the configured limits. Tests should cover connections that exceed a page.

### 7. Edited PR/issue details cannot clear some existing optional values

**Evidence:** `parsePrEditedText` updates fields only when their header is present (`src/tools/create-pr.ts:142-158`); `parseIssueEditedText` behaves similarly (`src/tools/create-issue.ts:132-152`). If the user deletes all reviewer, label, assignee, milestone, or relevant optional-field lines, the old values remain in the mutable `current` object and can still be submitted.

**Suggested fix:** Parse the edit into a fresh parameter object with explicit clearing semantics, or otherwise reset omitted optional fields. Add tests that remove previously present values, not only round-trip and update tests.

### 8. Review-preview line limiting does not work for actual multiline text

**Evidence:** `src/review.ts:9-10` splits and joins on the literal characters `\\n`, not newline characters. Normal multiline text is treated as one line, so the 20-line limit is not enforced. The truncation suffix at `:19` likewise contains literal escape text.

**Suggested fix:** Split and join with actual newline characters (`"\n"`) and test input with more than 20 lines but fewer than 2,000 characters.

### 9. PR-comments GraphQL response is trusted via a cast rather than validated

**Evidence:** `QueryResult` declares a non-null `repository` (`src/tools/read-pr-comments.ts:176-178`), but parsed JSON is cast to that type (`:462-464`) before `parsed.data.repository.pullRequest` is dereferenced (`:469`). A null/partial GraphQL response can throw a generic `TypeError` before the existing not-found handling.

**Suggested fix:** Treat the response as untrusted data, validate the response shape, and handle GraphQL errors and null repository/PR results explicitly.

## Validation performed

`npm run verify` passed during the review: TypeScript typecheck, lint, formatting checks, and all 59 tests. The findings above were not covered by the existing checks/tests. The TODO follow-up list is in `TODO.md`.
