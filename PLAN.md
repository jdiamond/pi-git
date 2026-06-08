# pi-git

A pi extension that provides review-gated git/GitHub tools. Every action that
creates or publishes content shows a review UI before executing, giving the user
a chance to approve, edit, or cancel.

## Naming

All tools use a `git_` prefix to avoid conflicts with other extensions:
`git_commit`, `git_create_pr`, `git_pr_comments`, etc.

## Current Scope

### `git_commit(message, files?)`

- Commits with `git commit -m`
- Optionally stages files inline via `files` parameter
- If nothing is staged and no files provided, returns an error

### `git_amend(message?, files?)`

- Amends the most recent commit
- Optionally provide a new message and/or files to stage
- Shows current commit info and pending changes in the review step

### `git_create_pr(title, body?, base?, draft?, dryRun?, reviewers?)`

- Creates a PR via `gh pr create`
- Supports reviewers (including copilot bot), draft flag, target branch
- `dryRun` prints details without creating the PR

### `git_pr_comments(number, repo?)`

- Reads comments on a GitHub pull request
- Returns conversation comments, inline review threads (with resolved/outdated
  status), and review body summaries — including Copilot feedback
- Uses the GitHub GraphQL API via `gh api graphql`
- Auto-detects the repo from the current directory, or accepts `owner/name`

### `git_reply_to_pr_thread(threadId, body)`

- Reply to an inline review thread (GraphQL mutation via `gh api graphql`)
- The agent passes a thread node ID from a prior `git_pr_comments` call
- Review step shows the body with two approve options:
  **Approve & resolve** or **Approve** (reply only), plus Edit and Cancel
  — the human picks, no second prompt, escape is always cancel

## Review UX

When the agent calls a tool that publishes content, the extension shows an
inline review step at the bottom of the TUI:

```
📝 Commit Message:

  Fix: resolve race condition in connection pool shutdown

  The pool's close() method could return before all in-flight
  connections were drained, causing tests to fail with
  ECONNRESET. This adds an explicit drain step before closing
  the server.

  > Approve
    Edit
    Cancel
```

- **Approve** — execute the action, return result to agent
- **Edit** — open `ctx.ui.editor()` with the text, then loop back to review
  (ctrl+g opens the text in neovim for a full editing experience)
- **Cancel** / **esc** — cancel, return blocked to agent

## Future Tools

### `git_resolve_pr_thread(threadId)`

- Resolve a review thread without replying (GraphQL mutation)
- Simple confirm, no body to review
- Standalone for cases where you just want to mark something resolved

### `git_add_pr_comment(number, body)`

- Add a top-level conversation comment on a PR via `gh pr comment`
- Review step for the body, same flow as the other publishing tools

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
│   ├── git.ts            # Shared git helpers
│   ├── review.ts         # Shared review helpers
│   └── tools/
│       ├── amend.ts
│       ├── commit.ts
│       ├── create-pr.ts
│       ├── read-pr-comments.ts
│       └── reply-to-pr-thread.ts
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
