# TODO

- [ ] Replace long review prompts with a custom pi TUI component that shows the full message in a scrollable view, keeping the Accept/Edit/Cancel actions visible.
- [ ] Adding a comment to an issue or PR should show the repo and issue number in the prompt.
- [ ] Add GitHub-only tools to list repository files and download files from a repository, similar to `ghgrab`.
- [ ] Report pi-git review prompts to Herdr by emitting `herdr:blocked` with `{ active: true, label }` while an approval/edit prompt is open and `{ active: false }` in `finally` when it closes, so Pi appears blocked instead of working.

## Review findings

- [ ] [P1] Keep `git_diff` read-only by validating/canonicalizing revision inputs so option-like refs cannot pass Git write options such as `--output`; add a regression test.
- [ ] [P1] Pass PR-thread reply bodies to `gh api` literally so values beginning with `@` cannot be expanded as local file contents.
- [ ] [P1] Propagate tool abort signals through review prompts and subprocesses, and prevent side effects after abort.
- [ ] [P1] Show every staged file that `git_commit` or `git_amend` will include in its approval prompt, or prevent unlisted staged changes from being committed.
- [ ] [P2] Paginate `git_pr_comments` results or clearly report when comments/threads/reviews are truncated.
- [ ] [P2] Let edited issue and PR details clear optional values such as reviewers, labels, assignees, and milestones.
- [ ] [P2] Fix review-preview line limiting to split/join on actual newline characters, and test multiline input.
- [ ] [P2] Validate GitHub GraphQL response shapes at runtime and report null/partial repository or PR responses clearly.
