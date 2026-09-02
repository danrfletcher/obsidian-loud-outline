# Tasks and Lists

This is the part Quiet Outline and the core Outline plugin don't do: task lists (`- [ ]` / `- [x]`)
and ordinary bullet/numbered lists show up as tree nodes too, when
[**Show tasks and lists**](../settings.md) is on.

## Where a list ends up

- **A list under a heading** — its root (top-level) item becomes a child of that heading, and any
  items nested inside that list, in the note itself, nest the same way inside the tree. An item
  three bullets deep in the note is three levels deep in the tree.
- **A list at the top of a file** — above any heading, or in a file with no headings at all — its
  root item nests directly under the file itself, exactly as if the file were standing in for a
  heading.

```markdown
# Project

- [ ] Kick off meeting
  - [ ] Book the room

## Backlog

- Nice to have
  - Not urgent
```

produces:

```
Project
├── ☐ Kick off meeting
│   └── ☐ Book the room
└── Backlog
    └── Nice to have
        └── Not urgent
```

Both `Kick off meeting` (a task, nested under the file's root heading `Project`) and `Nice to have`
(a plain bullet, nested under `Backlog`) land exactly where they visually sit in the note.

## Tasks vs. plain list items

An item is treated as a task if it uses the `- [ ]` / `- [x]` checkbox syntax; anything else is a
plain list item. Tasks show a checkbox reflecting their checked state (any character other than a
blank space between the brackets counts as checked, matching Obsidian's own task parsing) — checked
items are shown struck-through. Both render the same way otherwise, and both nest and navigate
identically.

## What text is shown

The list item's own text, with its bullet/number marker and (for tasks) its checkbox syntax
stripped. Only the item's first line is used as its label — the tree isn't a full rendering of the
note, just enough to identify and jump to the right line.

## Turning this off

If you only want headings, turn **Show tasks and lists** off in
[Settings](../settings.md) — the tree falls back to headings-only, matching the behavior of the
core Outline plugin and Quiet Outline.
