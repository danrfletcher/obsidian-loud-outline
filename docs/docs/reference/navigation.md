# Navigating

Clicking any row in the injected tree — a heading, a task, or a plain list item — does two things:

1. **Opens the note**, if it isn't already the active file, in the most recently active editor pane.
2. **Jumps the cursor** to that row's line and scrolls it into view, the same navigation mechanic
   Quiet Outline and the core Outline plugin use.

Clicking the filename itself still behaves exactly as it always has (opens the file, no change in
behavior) — only the injected rows underneath it, and the small collapse arrow, are new.

## Expanding vs. navigating

The collapse arrow and the row's text/checkbox are separate click targets:

- Clicking the **arrow** only expands or collapses that row's children — it never navigates.
- Clicking anywhere else on the row **navigates** — it never toggles that row's own children.

This matches how folders already work in the file explorer: clicking a folder's arrow expands it
without opening anything, clicking its name does something else entirely (in a folder's case,
nothing; in a heading/task/list row's case, navigating).

## Expand state

Which rows are currently expanded is kept in memory for the session — collapsing a note and
re-expanding it later remembers what you had open. It isn't written to disk, so it resets the next
time Obsidian restarts (every file starts fully collapsed again, the same as a vault you're opening
for the first time).
