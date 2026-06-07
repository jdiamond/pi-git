# pi-git

A pi extension that provides review-gated git/GitHub tools. Every action that
creates or publishes content shows a review UI before executing, giving the user
a chance to approve, edit, or cancel.

## Naming

All tools use a `git_` prefix to avoid conflicts with other extensions:
`git_commit`, `git_create_pr`, `git_reply_to_comment`, etc.

## PoC Scope (this milestone)

One tool: `git_commit(message)`

- Commits whatever is currently staged (`git commit -m`)
- Agent stages files beforehand via `bash: git add ...` (keeps this tool simple)
- If nothing is staged, returns an error (agent should stage first)

### Review UX

When the agent calls `git_commit`, the extension shows a custom TUI overlay:

```
┌─ Commit Message ──────────────────────────────────────────────┐
│                                                                │
│  Fix: resolve race condition in connection pool shutdown       │
│                                                                │
│  The pool's close() method could return before all in-flight   │
│  connections were drained, causing tests to fail with          │
│  ECONNRESET. This adds an explicit drain step before closing   │
│  the server.                                                   │
│                                                                │
│────────────────────────────────────────────────────────────────│
│  [a] approve    [e] edit    [c] cancel                         │
└────────────────────────────────────────────────────────────────┘
```

- **a** — execute the commit, return result to agent
- **e** — open `ctx.ui.editor()` with the message text, then loop back to review
- **c** / **esc** — cancel, return blocked to agent

### Notes

- Uses the built-in `ctx.ui.editor()` for editing (TUI editor, not $EDITOR)
- $EDITOR integration can be explored later if the built-in editor isn't sufficient
- No config files yet — hardcoded behavior for the PoC

## Future Tools (not in PoC)

These are noted for later implementation. The review UX pattern established
by `git_commit` will be reused.

- `git_amend_commit(message)` — like `git_commit` but amends
- `git_create_pr(title, body, base?, head?, draft?)` — review then `gh pr create`
- `git_get_pr_comments(pr_number)` — fetch copilot + human comments
- `git_reply_to_comment(comment_id, body)` — review then reply
- `git_resolve_thread(thread_id)` — mark resolved (no review needed, just confirm)

## Project Structure

Follows pi-guard conventions:

```
pi-git/
├── AGENTS.md
├── biome.json
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Extension entry point
│   └── ...               # extracted modules as the codebase grows
├── test/
│   └── ...
└── README.md
```

## Publishing

- npm package name: `pi-git`
- Extension source: `src/index.ts` (wired via `package.json` `pi.extensions`)
- GitHub repo: `github.com/jdiamond/pi-git`
- Same tooling as pi-guard: biome for lint/format, Node test runner, tsconfig
  for type checking with `noEmit`
