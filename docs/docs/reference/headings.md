# Headings in the Tree

Loud Outline reads a note's heading structure from Obsidian's own metadata cache — the same source
the core Outline plugin and [Quiet Outline](https://github.com/guopenghui/obsidian-quiet-outline)
use — so it always matches what Obsidian itself considers a heading.

## Nesting

Headings nest strictly by level, not by any numbering scheme in the text:

```markdown
# Overview          <- root
## Background        <- nests under Overview
### Details          <- nests under Background
## Next Steps         <- nests under Overview, not Background (a "##" always closes any deeper heading)
# Appendix            <- new root, sibling of Overview
```

produces:

```
Overview
├── Background
│   └── Details
└── Next Steps
Appendix
```

A heading always closes every currently-open heading at its level or deeper before it opens its own
row — so a `##` after an `### `always ends up a sibling of the last `##`, never a child of the
`###` above it, no matter how the file is otherwise organized.

## What counts as a heading

Anything Obsidian's own metadata cache recognizes as a heading (`#` through `######`, standard
ATX-style Markdown headings). Loud Outline doesn't add its own heuristics — a line your notes,
Obsidian's outline, and Quiet Outline all agree isn't a heading won't show up here either.

## Files with no headings

If a file has no headings at all, it gets no collapse arrow from headings alone — unless it has
tasks or lists at its root, which nest directly under the file itself. See
[Tasks and Lists](tasks-and-lists.md).
