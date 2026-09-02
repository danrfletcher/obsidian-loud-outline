export interface LoudOutlineSettings {
	/**
	 * When enabled, task and list items are shown as nested tree nodes
	 * alongside headings. When disabled, the tree falls back to
	 * headings-only (Quiet-Outline-equivalent) behaviour.
	 */
	showListsAndTasks: boolean;
}

export const DEFAULT_SETTINGS: LoudOutlineSettings = {
	showListsAndTasks: true,
};
