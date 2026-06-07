# pi-git

**Review-gated git/GitHub tools for [pi](https://github.com/mariozechner/pi-coding-agent)**

Every action that publishes content shows a review overlay before executing: approve, edit, or cancel. No accidental commits or PRs.

## Tools

| Tool | Description |
|------|-------------|
| `git_commit` | Stage files and commit with a review step |
| `git_create_pr` | Create a pull request with a review step |
| `git_amend` | Amend the most recent commit with a review step |

All tools use a `git_` prefix to avoid conflicts.

## Install

```json
{
  "packages": ["npm:@jdiamond/pi-git"]
}
```

## Usage

### Commit

The agent stages files and commits in one call:

```
git_commit(message: "Fix: resolve race condition in pool shutdown", files: ["src/pool.ts"])
```

A review overlay shows the commit message and lets you **[a]**pprove, **[e]**dit, or **[c]**ancel before the commit executes.

### Create PR

The agent creates a pull request with optional reviewers:

```
git_create_pr(
  title: "Fix connection pool shutdown",
  body: "The pool's close() could return before draining...",
  base: "main",
  draft: true,
  reviewers: ["copilot-pull-request-reviewer[bot]"]
)
```

Same review flow — approve, edit, or cancel before the PR is created.

### Amend

The agent amends the most recent commit (message and/or files):

```
git_amend(
  message: "Better commit message",
  files: ["src/forgot-to-add.ts"]
)
```

The review overlay shows the current commit message and files, plus any new message and files to stage.
