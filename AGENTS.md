pi-git is a pi extension that provides review-gated git/GitHub tools. Every action that creates or publishes content shows a review UI before executing, giving the user a chance to approve, edit, or cancel.

**Tool naming:** All tools use a `git_` prefix: `git_commit`, `git_create_pr`, etc.

**Review pattern:** Tools that create/publish show an inline review step where the user can approve, edit, or cancel before the action executes.

**Testing:** `node --test test/<file>.ts` for a single test file, `npm test` for the full suite

**Type checking:** `npm run typecheck`

**Linting:** `npm run lint` to check, `npm run lint:fix` to auto-fix

**Formatting:** `npm run format:check` to check, `npm run format` to auto-fix

**Check (static only):** `npm run check` (typecheck + lint + format:check)

**Verify (everything):** `npm run verify` (check + test)

**No `npx` or `tsx`.** This project uses Node's built-in type stripping.

**No non-null assertions (`!`).** Use early returns, `assert.ok` guards, or explicit `undefined` checks instead.
