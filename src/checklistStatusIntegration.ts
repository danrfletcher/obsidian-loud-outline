import { App } from "obsidian";

/**
 * Local copy of the companion "Checklist Status Sets" plugin's public API
 * contract (`TaskStatusDecoration` / `ChecklistStatusIconsPublicApi`).
 * There's no shared npm package between the two plugins, so this is kept in
 * sync by hand against obsidian-checklist-status-icons's src/publicApi.ts -
 * see that repo's docs/docs/reference/public-api.md.
 */
export interface ChecklistTaskStatusDecoration {
	color: string;
	label: string;
	isCompleted: boolean;
	/** True when the task is hidden entirely in the note (an active "hide completed" rule) - the tree should skip it too, not show a decoration the note itself doesn't. */
	hidden: boolean;
}

export interface ChecklistStatusIconsPublicApi {
	readonly apiVersion: number;
	getStatusDecoration(path: string, lineNumber: number, marker: string): ChecklistTaskStatusDecoration | undefined;
	isGlowEnabled(): boolean;
	onChange(callback: () => void): () => void;
	/** Cycles the task at `path`:`lineNumber` to the next status in its governing set's order. No-op if no assignment covers it. */
	cycleTaskStatus(path: string, lineNumber: number): Promise<void>;
	/** Opens Status Sets' own status-change popup for the task at `path`:`lineNumber`, anchored to `anchor`. No-op if no assignment covers it. */
	openTaskStatusPopup(anchor: HTMLElement, path: string, lineNumber: number): Promise<void>;
}

const PLUGIN_ID = "checklist-status-icons";
const MIN_API_VERSION = 1;

/**
 * `app.plugins` isn't part of Obsidian's public typings, but reading another
 * plugin's instance through it is the documented-in-practice way every
 * cross-plugin integration in the ecosystem works. Narrowly typed here
 * rather than reaching for `any` everywhere this is used.
 */
interface PluginsInternal {
	plugins: Record<string, { api?: ChecklistStatusIconsPublicApi }>;
}

/**
 * Optional integration with the "Checklist Status Sets" companion plugin
 * (https://github.com/danrfletcher/obsidian-checklist-status-icons). When
 * it's installed, enabled, and its API is new enough, task nodes in the tree
 * are decorated with the exact same status dot (color, label, Glow) it
 * renders for that task in the note itself - see explorerIntegration.ts's
 * renderTaskCheckbox. Entirely absent (falls back to a plain checkbox) when
 * the plugin isn't present, so this has no effect for anyone who doesn't
 * use it.
 */
export class ChecklistStatusIntegration {
	constructor(private app: App) {}

	getApi(): ChecklistStatusIconsPublicApi | undefined {
		const plugins = (this.app as unknown as { plugins?: PluginsInternal }).plugins;
		const api = plugins?.plugins?.[PLUGIN_ID]?.api;
		if (!api || api.apiVersion < MIN_API_VERSION) return undefined;
		return api;
	}
}

/**
 * cycleTaskStatus/openTaskStatusPopup shipped in a follow-up to the initial
 * getStatusDecoration addition without a corresponding apiVersion bump, so
 * apiVersion alone can't distinguish "has decoration only" from "has
 * decoration + interaction" - checked by actual presence instead. A user on
 * an older cached copy of that plugin still gets read-only status dots
 * (getApi() above still succeeds), just not click/right-click.
 */
export function supportsTaskInteraction(
	api: ChecklistStatusIconsPublicApi
): api is ChecklistStatusIconsPublicApi & Required<Pick<ChecklistStatusIconsPublicApi, "cycleTaskStatus" | "openTaskStatusPopup">> {
	return typeof api.cycleTaskStatus === "function" && typeof api.openTaskStatusPopup === "function";
}
