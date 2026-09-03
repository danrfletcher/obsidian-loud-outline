import { CachedMetadata, HeadingCache } from "obsidian";

export type OutlineNodeType = "heading" | "list" | "task";

export interface OutlineNode {
	type: OutlineNodeType;
	text: string;
	/** 0-indexed line number to navigate to. */
	line: number;
	/** Heading level 1-6. Only set for type "heading". */
	level?: number;
	/** Checked state. Only set for type "task". */
	checked?: boolean;
	/**
	 * Raw checkbox marker character - the single character between `[` and
	 * `]` (`" "` for unchecked, `"x"`/`"X"` for checked, or any other single
	 * character a custom-checkbox theme/plugin assigns its own meaning to).
	 * Only set for type "task". Kept alongside `checked` (which collapses
	 * this down to a boolean) so the file-explorer renderer can match
	 * whatever custom status a theme or plugin - e.g. a checklist-status
	 * plugin - has rendered for this exact task in the note itself, instead
	 * of always falling back to a plain checked/unchecked checkbox.
	 */
	marker?: string;
	children: OutlineNode[];
}

/**
 * Builds the nested outline tree for a single file from its metadata cache.
 *
 * Headings nest under their preceding shallower heading (H2 under H1, etc.),
 * matching how Quiet Outline builds its tree. When `includeLists` is true,
 * root-level list/task items nest under whichever heading is "open" at that
 * point in the document (or directly under the file if none), and items
 * nested inside a list nest under their own parent item in turn.
 */
export function buildOutlineTree(
	cache: CachedMetadata | null | undefined,
	lines: string[],
	includeLists: boolean
): OutlineNode[] {
	const rootChildren: OutlineNode[] = [];
	if (!cache) return rootChildren;

	const headingStack: OutlineNode[] = [];
	const currentParentChildren = (): OutlineNode[] =>
		headingStack.length ? headingStack[headingStack.length - 1].children : rootChildren;

	const headings = (cache.headings ?? [])
		.slice()
		.sort((a, b) => a.position.start.line - b.position.start.line);

	function pushHeading(h: HeadingCache): void {
		while (
			headingStack.length &&
			(headingStack[headingStack.length - 1].level ?? 0) >= h.level
		) {
			headingStack.pop();
		}
		const node: OutlineNode = {
			type: "heading",
			text: h.heading,
			line: h.position.start.line,
			level: h.level,
			children: [],
		};
		currentParentChildren().push(node);
		headingStack.push(node);
	}

	if (!includeLists) {
		for (const h of headings) pushHeading(h);
		return rootChildren;
	}

	const listItems = (cache.listItems ?? [])
		.slice()
		.sort((a, b) => a.position.start.line - b.position.start.line);

	const nodeByLine = new Map<number, OutlineNode>();
	const rootListNodes: { line: number; node: OutlineNode }[] = [];

	for (const li of listItems) {
		const line = li.position.start.line;
		const raw = lines[line] ?? "";
		const text = extractListItemText(raw);
		const isTask = li.task !== undefined;
		// Only "x"/"X" is a genuinely *checked* task by Obsidian's own
		// markdown convention - any other non-space marker is a custom
		// status (e.g. a checklist-status plugin's "in progress"), not
		// necessarily "done". Conflating the two here previously made every
		// custom-status task render fully checked/struck-through regardless
		// of what it actually meant - see README, Compatibility.
		const node: OutlineNode = {
			type: isTask ? "task" : "list",
			text,
			line,
			checked: isTask ? li.task === "x" || li.task === "X" : undefined,
			marker: isTask ? li.task : undefined,
			children: [],
		};
		nodeByLine.set(line, node);

		if (li.parent < 0) {
			rootListNodes.push({ line, node });
		} else {
			const parentNode = nodeByLine.get(li.parent);
			if (parentNode) {
				parentNode.children.push(node);
			} else {
				// Defensive fallback: parent line not found (shouldn't normally
				// happen since listItems are processed in document order).
				rootListNodes.push({ line, node });
			}
		}
	}

	type Ev =
		| { line: number; kind: "heading"; heading: HeadingCache }
		| { line: number; kind: "list"; node: OutlineNode };

	const events: Ev[] = [
		...headings.map((h) => ({ line: h.position.start.line, kind: "heading" as const, heading: h })),
		...rootListNodes.map((n) => ({ line: n.line, kind: "list" as const, node: n.node })),
	].sort((a, b) => a.line - b.line);

	for (const ev of events) {
		if (ev.kind === "heading") {
			pushHeading(ev.heading);
		} else {
			currentParentChildren().push(ev.node);
		}
	}

	return rootChildren;
}

function extractListItemText(raw: string): string {
	let s = raw.replace(/^\s*/, "");
	s = s.replace(/^([-*+]|\d+[.)])\s+/, "");
	s = s.replace(/^\[.\]\s*/, "");
	s = s.trim();
	return s.length ? s : "(empty)";
}
