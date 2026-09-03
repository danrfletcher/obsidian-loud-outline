# Changelog

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
