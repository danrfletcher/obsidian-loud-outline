import { App, TFile } from "obsidian";

/**
 * Toggling a plain task's checkbox from the tree - i.e. a task with no
 * governing status plugin (see renderTaskCheckbox's no-decoration branch in
 * explorerIntegration.ts). Mirrors exactly what a real click on the same
 * checkbox does in Reading View/Live Preview (verified live against
 * Obsidian 1.13.7): any non-space marker is "checked" and toggles to a
 * plain space, a space toggles to a lowercase "x" - regardless of what the
 * prior non-space marker actually was (a checked "X" or a custom single
 * character like "/" both simply clear to " ").
 *
 * Matching rule for locating the marker: it must be the first thing on the
 * line, aside from leading whitespace/indentation - same as Obsidian's own
 * task syntax, and the same convention the "Checklist Status Sets" companion
 * plugin's own statusMarker.ts uses (kept in sync by hand, no shared
 * package between the two repos).
 *
 * Always writes via vault.process rather than preferring an open editor -
 * verified live that going through a MarkdownView's editor (editor.setLine
 * + view.save()) leaves a Reading-mode pane's rendered DOM *and* the file on
 * disk both stuck on the old marker indefinitely (the edit only ever lands
 * in that view's in-memory CodeMirror buffer - view.save() resolves without
 * error but doesn't actually flush it out). A click from the tree isn't a
 * keystroke inside a focused editor to begin with, so there's no cursor
 * position to preserve by going through one; vault.process is what actually
 * matches a real checkbox click's own immediate, on-disk behavior.
 */
const TASK_LINE_RE = /^(\s*)([-*+])(\s\[)(.)(\]\s?)(.*)$/;

interface ParsedTaskLine {
	indent: string;
	bullet: string;
	marker: string;
	rest: string;
}

function parseTaskLine(line: string): ParsedTaskLine | null {
	const m = TASK_LINE_RE.exec(line);
	if (!m) return null;
	return { indent: m[1], bullet: m[2], marker: m[4], rest: m[6] };
}

/** Rewrites a task line's marker character, preserving everything else about the line. */
function withMarker(line: string, marker: string): string {
	const parsed = parseTaskLine(line);
	if (!parsed) return line;
	return `${parsed.indent}${parsed.bullet} [${marker}] ${parsed.rest}`;
}

/**
 * Toggles the task at `file`:`lineNumber` the same way a real click on its
 * checkbox does in Reading View. No-op if the line no longer parses as a
 * task (e.g. it changed out from under a stale line number).
 */
export async function toggleTaskChecked(app: App, file: TFile, lineNumber: number): Promise<void> {
	await app.vault.process(file, (content) => {
		const lines = content.split("\n");
		const line = lines[lineNumber];
		if (line == null) return content;
		const parsed = parseTaskLine(line);
		if (!parsed) return content;
		const nextMarker = parsed.marker === " " ? "x" : " ";
		lines[lineNumber] = withMarker(line, nextMarker);
		return lines.join("\n");
	});
}
