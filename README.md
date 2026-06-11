# pi-git

**Tools for git and GitHub for [pi](https://pi.dev)**

Every action that publishes content shows a review step before executing: accept, edit, or cancel. No accidental commits or PRs.

## Why

When your agent needs to commit, create a PR, or read review comments, the natural path is a bash tool call. But that gets painful fast:

**Long messages are hard to read.** A commit message or PR body shoved into a bash command is unreadable — all on one line or with inline `\n` escapes. You end up squinting at the raw tool call in your terminal just to figure out what the agent is about to do.

**Escaping is brittle.** The agent will get shell escaping wrong. Quotes, backticks, dollar signs — something breaks, the command fails, and the agent burns a turn retrying.

**Review costs extra.** With [pi-guard](https://github.com/jdiamond/pi-guard), you can intercept and cancel a bash tool call before it runs. But that sends the agent back to the drawing board for another full turn. With pi-git, you edit the message inline right there in the review step — accept, edit, or cancel in one step. No extra round trip to the model.

**Complex GitHub operations get wrapped.** When the agent wants to read PR review threads, it constructs a `gh api graphql` command with a multi-line query escaped for the shell. As a human, you have to parse that command to be sure it's safe before approving. pi-git encapsulates that in a focused `git_pr_comments` tool — no shell escaping to audit, no GraphQL to verify. You know by the tool name alone that it's a read-only operation.

**The editor is right there.** pi's built-in editor component powers the edit step. Press ctrl+g to open the text in neovim (or whatever `$EDITOR` you've wired up), make your changes, save, and you're back in the review flow. No context switching.

## Install

```json
{
  "packages": ["npm:@jdiamond/pi-git"]
}
```

## How it works

Install the extension and your agent gets a set of tools for common git and GitHub operations:

- **`git_commit`** — stage files and commit, with a review step that lets you edit the message in an editor before it runs.

- **`git_amend`** — amend the last commit. Shows the current message and files, plus what's changing. Same review flow.

- **`git_create_pr`** — create a pull request with optional reviewers, draft flag, and target branch. Review the title and body before it goes out.

- **`git_pr_comments`** — read all comments on a PR: conversation comments, inline review threads (with resolved/outdated status), and review summaries — including Copilot feedback. Auto-detects the repo, or pass `owner/name`.

- **`git_add_pr_comment`** — add a top-level conversation comment to a pull request. Review the body before it's posted.

- **`git_reply_to_pr_thread`** — reply to an inline review thread. The review step lets you accept the reply body, with an "Accept & resolve" option that posts the reply and resolves the thread in one go. Thread IDs come from `git_pr_comments`.

Every tool that creates or publishes content uses the same review step: you see exactly what will happen, then accept, edit, or cancel.

All tools accept an optional `workingDir` parameter. It defaults to pi's current working directory; relative paths are resolved from that directory. Use it when the agent is operating from one repository but needs to commit, create a PR, or inspect reviews in another.
