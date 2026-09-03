# Changelog

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
