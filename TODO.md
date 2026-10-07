# TODO

- [ ] Replace long review prompts with a custom pi TUI component that shows the full message in a scrollable view, keeping the Accept/Edit/Cancel actions visible.
- [ ] Adding a comment to an issue or PR should show the repo and issue number in the prompt.
- [ ] Add GitHub-only tools to list repository files and download files from a repository, similar to `ghgrab`.
- [ ] Report pi-git review prompts to Herdr by emitting `herdr:blocked` with `{ active: true, label }` while an approval/edit prompt is open and `{ active: false }` in `finally` when it closes, so Pi appears blocked instead of working.
