# Compatibility with Custom Checkboxes

Plenty of themes, snippets and plugins change what a checkbox looks like in the note itself —
colored dots for custom statuses, alternate glyphs for `- [/]`/`- [>]`/etc. Loud Outline tries to
show the same thing in the file tree, rather than always falling back to a plain checked/unchecked
box, in two ways:

## 1. CSS-only "alternate checkbox" snippets and themes

A lot of the community snippets and theme options for custom checkboxes work by styling Obsidian's
own `data-task` attribute — the raw character between `[` and `]` — with CSS, usually via
`content` on a pseudo-element or `background`/`appearance` overrides on the checkbox itself. Loud
Outline's own injected checkbox in the tree carries that same attribute, on the same kind of
element (`<li class="task-list-item" data-task="…">` wrapping an
`<input class="task-list-item-checkbox" data-task="…">`) that Obsidian's Reading View renders. If a
snippet or theme's rule isn't scoped to the note's own view container (`.markdown-preview-view` /
`.markdown-source-view`) — many aren't, precisely so they also reach things like the Tasks plugin's
query results — it picks up the tree's checkboxes too, automatically, with no configuration needed.

Snippets that *are* scoped tightly to the note's own view container can't reach the file tree by
CSS alone; there's no general fix for that short of the snippet's own author loosening the scope.

## 2. Checklist Status Sets

[Checklist Status Sets](https://danrfletcher.github.io/obsidian-checklist-status-icons/) replaces
task checkboxes with colored status dots that aren't pure CSS — the color and label for a given
task come from that plugin's own assignment data, not from anything visible in the note's markdown
alone. Loud Outline detects it (if installed and enabled) via a small public API it exposes, and
reproduces the exact same dot — color, label, and Glow — for governed tasks in the tree, instead of
a checkbox.

This also means:

- A task whose status isn't "completed" (e.g. an "In Progress" status) is **not** shown
  struck-through in the tree, even though its checkbox marker isn't `- [ ]` — only the task's actual
  resolved status decides that, not the raw marker character.
- A task hidden by that plugin's own "hide completed" setting is removed from the tree entirely,
  not just shown struck-through — matching it disappearing from the note's own render.
- **The dot is interactive.** Left-click cycles the task to its next status; right-click opens
  Checklist Status Sets' own status picker — the exact same actions its dots perform in the note
  itself, reused via its public API rather than reimplemented. A task's status can be changed
  entirely from the tree, without opening the note. This only applies to tasks actually governed by
  an assignment.

If Checklist Status Sets isn't installed, none of this applies and tasks render exactly as they
always have.

## Plain checkboxes are interactive too

A task with no governing status plugin still gets a real, clickable checkbox in the tree — clicking
it (either mouse button) toggles the task's marker the same way clicking that same checkbox does in
Reading View/Live Preview, written straight back to the file. This is independent of Checklist
Status Sets entirely: it's the same behavior for a plain `- [ ]` task whether or not that plugin is
installed.

## What this doesn't cover

Any other plugin that changes checkbox *rendering* would need the same kind of small public API
Checklist Status Sets exposes for Loud Outline to mirror it exactly — there's no way to reliably
infer custom, plugin-specific meaning from the note's markdown alone. If you maintain such a plugin
and want this kind of integration,
[open an issue](https://github.com/danrfletcher/obsidian-loud-outline/issues) — the API surface
Checklist Status Sets exposes is small and reusable as a reference.
