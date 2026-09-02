# Settings Reference

Everything lives under **Settings → Loud Outline** — there's exactly one setting.

## Show tasks and lists

On by default. Controls whether task and list items appear as nested nodes in the tree, in addition
to headings:

- **On** — headings, tasks, and lists all appear, nested as described in
  [Headings in the Tree](reference/headings.md) and [Tasks and Lists](reference/tasks-and-lists.md).
- **Off** — the tree falls back to showing headings only, matching the behavior of the core Outline
  plugin and [Quiet Outline](https://github.com/guopenghui/obsidian-quiet-outline).

Toggling this rebuilds the tree for every open note immediately — no reload required. Existing
expand/collapse state for headings is kept where possible.

There's no separate toggle for headings themselves — they're always shown, since folding them into
the file explorer instead of a separate pane is the plugin's whole premise. If you want no outline
at all for a given note, just leave its row collapsed; the arrow only appears once there's something
under it, and nothing else about the file explorer changes.
