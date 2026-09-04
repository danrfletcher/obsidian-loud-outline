# Changelog

## 1.1.2

- **Fixed:** a task/heading/list row nested under a file or folder several levels deep (e.g. a task
  in a folder-noted file two or more folders in) rendered under-indented in the tree - its checkbox
  and text sat noticeably left of true sibling files/folders at that same depth, with the status
  dot's glow visibly clipped on the left. The tree previously indented injected rows purely by
  counting levels *within that file's own outline*, with no awareness of how deep the file/folder
  itself actually sits in the vault - correct only by coincidence for root-level files. Indentation
  is now anchored to the host row's own real, measured position (the same approach already used for
  the host's own collapse arrow), so it lines up correctly at any depth.

## 1.1.1

Code-quality fix in response to Obsidian's automated plugin review - no user-visible behavior
changes.

- Dropped a redundant explicit `| undefined` from an already-optional parameter's type
  (`rowVisibility`'s `parentItem?: ExplorerItem | undefined | null` -> `ExplorerItem | null`).

## 1.1.0

- **Added:** the file tree's checkboxes now match custom checkbox styling from the note itself,
  instead of always showing a plain checked/unchecked box - see
  [Compatibility](reference/compatibility.md).
  - CSS-only "alternate checkbox" snippets/themes that key off Obsidian's own `data-task` attribute
    are picked up automatically, with no configuration.
  - [Checklist Status Sets](https://danrfletcher.github.io/obsidian-checklist-status-icons/), if
    installed, is detected via its public API - the tree shows the exact same status dot (color,
    label, Glow) as the note, and correctly treats "completed" vs. any other custom status rather
    than assuming every non-default checkbox marker means "done".
- **Added:** for tasks governed by Checklist Status Sets, the tree's status dot is now interactive -
  left-click cycles to the next status, right-click opens its real status picker, the same as the
  note's own dots. A task's status can be changed without opening the note. Requires Checklist
  Status Sets 0.2.1+ for this to work correctly with a note open in Reading view (an earlier version
  silently no-ops left-click and can mis-highlight the current status on right-click there - fixed
  upstream, not something this plugin works around).
- **Fixed:** a task governed by a custom (non-`x`/`X`) checkbox marker was previously always shown
  fully checked and struck-through in the tree, regardless of what that marker actually meant -
  only a genuine `- [x]`/`- [X]` (or, with Checklist Status Sets installed, a status actually marked
  completed) is struck-through now.

## 1.0.4

- **Fixed:** a folder note's outline (headings, tasks and lists) failed to appear under its folder
  when that note was the *only* file in the folder — e.g. a "To Do" folder containing nothing but
  its own `To Do.md`. [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes) hides the
  now-empty-looking native children area for such a folder even while it's expanded, which this
  plugin was mistaking for "an ancestor folder is collapsed" and silently skipping. The folder's
  own expand/collapse state is now checked directly instead of inferred from that area's
  visibility, so the outline shows up correctly whether the folder has other files alongside its
  note or not.

## 1.0.3

Code-quality pass in response to Obsidian's automated plugin review — no user-visible behavior
changes.

- Replaced the collapse-arrow icon's raw `innerHTML` assignment with Obsidian's `setIcon()` (a
  Lucide `chevron-down`), and switched all manual `document.createElement` DOM construction over to
  Obsidian's `createEl`/`createDiv`/`createSpan` helpers.
- Added `getSettingDefinitions()` to the settings tab so **Show tasks and lists** is discoverable
  from Obsidian's core settings search (added in Obsidian 1.13.0).
- Dropped the `builtin-modules` dev dependency in favor of Node's own `node:module` built-in list.
- Minor type-safety cleanups (an unnecessary type assertion, an untyped `loadData()` result).

## 1.0.2

- **Fixed:** the collapse arrow added to a file's row sat at a fixed position that only looked
  right for one specific nesting depth — a file one level deep would show its arrow lined up with
  its *parent* folder's arrow instead of its own, and the gap grew with each further level of
  nesting. The arrow is now positioned from that row's own indentation, the same way Obsidian
  positions a folder's native arrow, so it lines up correctly no matter how deeply the file is
  nested.

## 1.0.1

- **Fixed:** compatibility with folder-note plugins (e.g. [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes))
  that hide a folder's note from the listing — its headings, tasks and lists now show up nested
  under the *folder* itself, the same as they would if the note were shown normally.
- **Fixed:** the outline's font size was subtly smaller than regular file/folder rows — it now
  matches exactly.
- **Fixed:** turning the plugin on shifted a file with an outline one extra indent level to the
  right compared to its siblings, so nested headings/tasks/lists appeared at the same depth as the
  file itself. The added collapse arrow no longer affects a row's own indentation.
- **Added:** a file or folder that gained a collapse arrow from this plugin now has its title
  underlined, so it can't be mistaken for an actual folder at a glance — the same convention
  folder-note plugins use for the same reason.
- **Fixed:** disabling the plugin could leave the file explorer in a visually broken state until
  Obsidian was reloaded. Disabling now fully removes everything this plugin ever injected.

## 1.0.0

- Initial release.
- Headings (H1–H6) shown as nested, expandable/collapsible rows directly under each file in the
  native file explorer.
- Click a heading to open its note (if needed) and jump the cursor to that line.
- Task lists and nested bullet/numbered lists shown as tree rows too, nested under their heading (or
  directly under the file, if there's no heading), preserving their own nesting depth.
- **Show tasks and lists** setting to fall back to headings-only.
