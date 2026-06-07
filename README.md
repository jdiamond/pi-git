# pi-git

**Review-gated git/GitHub tools for [pi](https://github.com/mariozechner/pi-coding-agent)**

Every action that publishes content shows a review overlay before executing: approve, edit, or cancel. No accidental commits or PRs.

## Tools

| Tool | Description |
|------|-------------|
| `git_commit` | Stage files and commit with a review step |
| (more coming) | |

All tools use a `git_` prefix to avoid conflicts.

## Install

```json
{
  "packages": ["npm:@jdiamond/pi-git"]
}
```

## Usage

The agent stages files and commits in one call:

```
git_commit(message: "Fix: resolve race condition in pool shutdown", files: ["src/pool.ts"])
```

A review overlay shows the commit message and lets you **[a]**pprove, **[e]**dit, or **[c]**ancel before the commit executes.
