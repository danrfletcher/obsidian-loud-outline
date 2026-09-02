# Examples

## A project note with a checklist per section

```markdown
# Launch Plan

## Marketing

- [ ] Draft announcement post
- [x] Reserve social handles

## Engineering

- [ ] Cut release branch
  - [ ] Bump version
  - [ ] Update changelog
- [ ] Tag release
```

Expanding `Launch Plan` shows `Marketing` and `Engineering` as its two headings; expanding either
shows that section's own checklist, with `Cut release branch`'s two sub-tasks nested one level
deeper again. Nothing here needed a separate outline pane, and nothing needed opening the file to
see the shape of it.

## A note with no headings at all

```markdown
- [ ] Call the plumber
- [ ] Renew passport
- Buy birthday present
  - Check what she already has
```

There's no heading to nest under, so all three root items — two tasks and a bullet — nest directly
under the file itself, exactly as described in
[Tasks and Lists](reference/tasks-and-lists.md#where-a-list-ends-up). The file's own row gets a
collapse arrow even though it has zero headings.

## Headings-only mode

With [**Show tasks and lists**](settings.md) turned off, the same `Launch Plan` note from the first
example collapses down to just:

```
Launch Plan
├── Marketing
└── Engineering
```

— matching what the core Outline plugin or Quiet Outline would show for the same file, just
embedded in the file explorer instead of a separate pane.
