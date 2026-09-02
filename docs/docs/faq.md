# FAQ and Troubleshooting

## A note has headings but no collapse arrow shows up

Give it a moment — the outline for a note is built the first time the file explorer needs to draw
its row, and (when **Show tasks and lists** is on) list-derived rows specifically wait on an async
read of the file's content before they appear. If it still isn't there after a few seconds, try
collapsing and re-expanding the note's parent folder, or reload the app
(**Settings → Community plugins → Reload plugins**).

## I clicked a row and nothing happened / the wrong line opened

Loud Outline reads heading and list positions from Obsidian's own metadata cache. If you just made
a large edit, the cache can take a moment to catch up — the tree also rebuilds on the next
metadata-cache update, so a stale row should self-correct within a second or two of the edit
settling.

## The tree looks fine but the sidebar scrolls oddly / rows briefly overlap

This can happen right after a very large note's outline first renders, since the file explorer
needs to notice the row grew taller. It corrects itself on the next scroll or interaction. If it
persists, please open an issue with the note's rough structure (headings/lists count and nesting
depth) so it can be reproduced.

## Does this write anything to my notes?

No. Loud Outline only reads — Obsidian's metadata cache for heading/list positions, and (when tasks
and lists are enabled) the raw file content to know what a list item's text says. It never edits or
creates files, and makes no network requests at all.

## Does it work on Obsidian Mobile?

Not currently — the plugin is marked `isDesktopOnly: true`. It works by patching the native file
explorer's DOM directly, which hasn't been verified on mobile yet.

## How is this different from the core Outline plugin or Quiet Outline?

Both of those show a note's heading structure in their own dedicated sidebar pane, separate from the
file tree, and neither shows tasks or lists. Loud Outline folds the same kind of outline directly
into the file explorer instead of adding another pane, and extends it to tasks and nested lists. See
[the overview](index.md#how-it-works) for the full comparison.

## Still stuck?

Open an issue on [GitHub](https://github.com/danrfletcher/obsidian-loud-outline/issues) with what
you tried and what happened.
