import { App, setIcon, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { buildOutlineTree, OutlineNode } from "./outlineTree";
import { ChecklistStatusIntegration, ChecklistTaskStatusDecoration } from "./checklistStatusIntegration";
import type LoudOutlinePlugin from "./main";

/**
 * Minimal shape of Obsidian's internal file-explorer "FileItem"/"FolderItem"
 * objects that we rely on. These are undocumented internals (confirmed live
 * against Obsidian 1.13.7), not part of the public API, hence the manual
 * typing here instead of an import from "obsidian". FolderItem's `.file` is
 * a TFolder, FileItem's is a TFile - both share this same shape.
 */
interface ExplorerItem {
	file: TAbstractFile;
	el: HTMLElement;
	selfEl: HTMLElement;
	innerEl: HTMLElement;
}

interface ExplorerView {
	containerEl: HTMLElement;
	fileItems: Record<string, ExplorerItem>;
}

/** Lucide icon name for the collapse arrow (rotated via CSS when collapsed). */
const COLLAPSE_ICON_NAME = "chevron-down";

/**
 * Icon width (see .loud-outline-collapse-icon in styles.css) plus a small
 * gap before the text - how much of a row's own padding-inline-start the
 * injected file icon needs to tuck itself into.
 */
const FILE_ICON_RESERVED_WIDTH = 18;

interface CachedOutline {
	/** Monotonic id, used as a cheap "has this changed" signature for re-renders. */
	id: number;
	nodes: OutlineNode[];
}

type RowVisibility = "visible" | "singled-out-hidden" | "unmounted";

/**
 * Owns injecting the heading/list outline into the native file explorer,
 * keeping it in sync with vault/metadata changes, and handling click
 * navigation. There is deliberately no separate view/pane — the file
 * explorer's own tree is extended in place.
 */
export class ExplorerOutlineManager {
	private view: ExplorerView | null = null;
	private observer: MutationObserver | null = null;
	private readonly outlineCache = new Map<string, CachedOutline>();
	private readonly pendingReads = new Set<string>();
	/** Keys of currently-expanded nodes (file/folder hosts and inner nodes alike). Empty = everything collapsed. */
	private readonly expandedKeys = new Set<string>();
	private idCounter = 0;
	private syncScheduled = false;
	private readonly checklistIntegration: ChecklistStatusIntegration;
	private subscribedToChecklistStatus = false;

	constructor(private app: App, private plugin: LoudOutlinePlugin) {
		this.checklistIntegration = new ChecklistStatusIntegration(app);
	}

	start(): void {
		this.attachToExplorer();

		// Checklist Status Sets may load after this plugin, or the user may
		// edit an assignment / toggle Glow while the tree is showing that
		// task - re-render live either way, same pattern this integration
		// itself uses for Status Sets (see that repo's main.ts).
		this.plugin.registerInterval(
			window.setInterval(() => {
				const api = this.checklistIntegration.getApi();
				if (api && !this.subscribedToChecklistStatus) {
					this.subscribedToChecklistStatus = true;
					api.onChange(() => this.refreshAll());
				}
			}, 1000)
		);

		this.plugin.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.outlineCache.delete(file.path);
					this.scheduleSync();
				}
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.outlineCache.delete(file.path);
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on("rename", (_file, oldPath) => {
				this.outlineCache.delete(oldPath);
				this.scheduleSync();
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on("create", () => {
				this.scheduleSync();
			})
		);

		this.plugin.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.attachToExplorer();
			})
		);
	}

	/**
	 * Disconnects from the explorer and strips every DOM node/class this
	 * plugin ever injected, so disabling the plugin leaves the file explorer
	 * exactly as it would look had the plugin never run - no leftover icons,
	 * outline rows, or marker classes.
	 */
	stop(): void {
		this.observer?.disconnect();
		this.observer = null;

		const view = (this.view ?? (this.findFileExplorerLeaf()?.view as unknown as ExplorerView)) || null;
		if (view?.fileItems) {
			for (const path of Object.keys(view.fileItems)) {
				this.clearHostInjection(view.fileItems[path]);
			}
		}
		this.view = null;
	}

	/** Called after a settings change that affects tree shape: everything must be rebuilt. */
	refreshAll(): void {
		this.outlineCache.clear();
		this.scheduleSync();
	}

	private attachToExplorer(): void {
		const leaf = this.findFileExplorerLeaf();
		if (!leaf) return;
		const view = leaf.view as unknown as ExplorerView;
		if (view === this.view) {
			this.scheduleSync();
			return;
		}
		this.view = view;
		this.observer?.disconnect();
		// The explorer re-renders rows (scroll virtualization, folder expand/
		// collapse, sort changes, vault mutations) far more often than there
		// are dedicated events for. A subtree observer + idempotent re-sync
		// is what makes injected nodes survive all of that reliably.
		this.observer = new MutationObserver(() => this.scheduleSync());
		this.observer.observe(view.containerEl, { childList: true, subtree: true });
		this.scheduleSync();
	}

	private findFileExplorerLeaf(): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found) return;
			const v = leaf.view as unknown as ExplorerView;
			if (v && v.fileItems) found = leaf;
		});
		return found;
	}

	private scheduleSync(): void {
		if (this.syncScheduled) return;
		this.syncScheduled = true;
		window.setTimeout(() => {
			this.syncScheduled = false;
			this.syncAll();
		}, 60);
	}

	/**
	 * Whether a row is genuinely visible, deliberately hidden on its own
	 * (its containing folder is open, but *this* row specifically is
	 * display:none - e.g. a folder-note plugin hiding an excluded note),
	 * or simply not mounted/visible because an ancestor folder is collapsed.
	 * The distinction matters: only the "singled-out" case should redirect
	 * its outline to the parent folder - a plain collapsed folder must not.
	 *
	 * Hiding a specific row is applied to its *selfEl* (confirmed live
	 * against the "Folder notes" plugin, which hides an excluded note via
	 * `.hide-folder-note .is-folder-note { display: none }` where
	 * `is-folder-note` sits on selfEl, not the row's own root element) -
	 * checking the root alone would miss it, since the root stays
	 * display:block even though it renders at zero height.
	 *
	 * `parentItem`, when supplied, is the immediate containing folder's own
	 * explorer item. Its `is-collapsed` class is the authoritative signal for
	 * "an ancestor folder is collapsed" - falling back to the *container's*
	 * own computed display (as done when no parentItem is available, e.g. a
	 * root-level file) is not reliable on its own: "Folder notes" also hides
	 * a folder's native children wrapper outright when that folder's only
	 * child is its own (hidden) folder note, i.e. `.only-has-folder-note`,
	 * even while the folder itself is fully expanded. Without checking the
	 * parent's actual collapse state, that case is indistinguishable from a
	 * genuinely collapsed ancestor and was wrongly treated as "unmounted",
	 * silently dropping the redirect and hiding the note's outline entirely.
	 */
	private rowVisibility(
		item: ExplorerItem | undefined | null,
		parentItem?: ExplorerItem | undefined | null
	): RowVisibility {
		const root = item?.el;
		const self = item?.selfEl;
		if (!root || !root.isConnected || !self || !self.isConnected) return "unmounted";

		if (getComputedStyle(self).display === "none") {
			if (parentItem) {
				return parentItem.el?.classList.contains("is-collapsed") ? "unmounted" : "singled-out-hidden";
			}
			const container = root.parentElement;
			const containerHidden = !container || getComputedStyle(container).display === "none";
			return containerHidden ? "unmounted" : "singled-out-hidden";
		}
		return "visible";
	}

	private syncAll(): void {
		const view = this.view;
		if (!view || !view.fileItems) return;

		const hosts = new Map<string, { item: ExplorerItem; files: TFile[] }>();
		const addToHost = (item: ExplorerItem, file: TFile) => {
			const key = item.file.path;
			let entry = hosts.get(key);
			if (!entry) {
				entry = { item, files: [] };
				hosts.set(key, entry);
			}
			entry.files.push(file);
		};

		for (const path of Object.keys(view.fileItems)) {
			const item = view.fileItems[path];
			const file = item?.file;
			if (!file || !(file instanceof TFile) || file.extension !== "md") continue;

			const parent = file.parent;
			const parentItem = parent && !parent.isRoot() ? view.fileItems[parent.path] : undefined;

			const state = this.rowVisibility(item, parentItem);
			if (state === "visible") {
				addToHost(item, file);
				continue;
			}

			if (state === "singled-out-hidden") {
				// This file's own row is deliberately hidden (e.g. a folder-note
				// plugin excluding it from the listing) while its parent folder
				// is open. Since the parent folder is effectively standing in
				// for this file, its outline belongs under the folder instead.
				if (parentItem && this.rowVisibility(parentItem) === "visible") {
					addToHost(parentItem, file);
				}
				// Nothing should remain injected on the hidden row itself.
				this.clearHostInjection(item);
			}
			// 'unmounted' (an ancestor is collapsed): leave alone, a future
			// sync picks it up once it (or its host) actually mounts.
		}

		const handled = new Set<string>();
		for (const { item, files } of hosts.values()) {
			handled.add(item.file.path);
			this.syncHost(item, files);
		}

		// A folder that used to host a redirected folder-note outline but no
		// longer does (note deleted, un-excluded, etc.) needs it cleared.
		for (const path of Object.keys(view.fileItems)) {
			const item = view.fileItems[path];
			if (item?.file instanceof TFolder && !handled.has(item.file.path)) {
				this.clearHostInjection(item);
			}
		}
	}

	private getOutline(file: TFile): CachedOutline {
		const cached = this.outlineCache.get(file.path);
		if (cached) return cached;

		const metadata = this.app.metadataCache.getFileCache(file);
		const includeLists = this.plugin.settings.showListsAndTasks;
		const needsLines = includeLists && !!metadata?.listItems?.length;

		if (!needsLines) {
			const nodes = buildOutlineTree(metadata, [], includeLists);
			const entry: CachedOutline = { id: ++this.idCounter, nodes };
			this.outlineCache.set(file.path, entry);
			return entry;
		}

		// List item text isn't in the metadata cache, only its position - the
		// raw line has to be read to know what to display. Kick off an async
		// read and render headings-only in the meantime; a fresh sync is
		// scheduled once the read resolves.
		if (!this.pendingReads.has(file.path)) {
			this.pendingReads.add(file.path);
			this.app.vault
				.cachedRead(file)
				.then((content) => {
					this.pendingReads.delete(file.path);
					const freshMeta = this.app.metadataCache.getFileCache(file);
					const nodes = buildOutlineTree(freshMeta, content.split(/\r?\n/), includeLists);
					this.outlineCache.set(file.path, { id: ++this.idCounter, nodes });
					this.scheduleSync();
				})
				.catch(() => this.pendingReads.delete(file.path));
		}

		return { id: -1, nodes: buildOutlineTree(metadata, [], false) };
	}

	/**
	 * Removes every trace of our injection from a single explorer item
	 * (icon, children container, marker classes) - used both when a host no
	 * longer has any outline content, and wholesale on unload.
	 */
	private clearHostInjection(item: ExplorerItem | undefined): void {
		const root = item?.el;
		if (!root) return;
		root.querySelector(":scope > .loud-outline-root-children")?.remove();
		item?.selfEl?.querySelector(":scope > .loud-outline-collapse-icon")?.remove();
		item?.selfEl?.classList.remove("loud-outline-file-title-host");
		root.classList.remove("loud-outline-has-note-content", "loud-outline-collapsed");
	}

	/**
	 * Renders (or updates) the outline for one "host" row - normally a
	 * file's own row, but a folder's row when it's standing in for a hidden
	 * folder note. Folders already have their own native collapse arrow, so
	 * for a folder host we don't add a second one: the injected content is
	 * simply placed among the folder's own children and shown/hidden by CSS
	 * keyed off Obsidian's own `.is-collapsed` class on the folder row.
	 */
	private syncHost(item: ExplorerItem, files: TFile[]): void {
		const root = item.el;
		if (!root || !root.isConnected) return;
		const isFolder = item.file instanceof TFolder;

		const entries = files
			.slice()
			.sort((a, b) => a.path.localeCompare(b.path))
			.map((file) => ({ file, outline: this.getOutline(file) }));
		const totalNodes = entries.reduce((n, e) => n + e.outline.nodes.length, 0);

		let childrenEl = root.querySelector<HTMLElement>(":scope > .loud-outline-root-children");
		let icon = !isFolder
			? item.selfEl?.querySelector<HTMLElement>(":scope > .loud-outline-collapse-icon")
			: null;

		if (!totalNodes) {
			this.clearHostInjection(item);
			return;
		}

		root.classList.add("loud-outline-has-note-content");

		if (!isFolder) {
			const hostKey = `h:${item.file.path}`;
			if (!icon) {
				icon = this.createCollapseIcon(!this.expandedKeys.has(hostKey));
				icon.addClass("loud-outline-file-icon");
				item.selfEl.addClass("loud-outline-file-title-host");
				// Absolutely positioned (see styles.css), so DOM order here is
				// only for logical/reading order, not layout.
				item.selfEl.appendChild(icon);
				icon.addEventListener("click", (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					this.toggleExpanded(hostKey, root, icon!);
				});
			}
			// Every explorer row - file or folder, at any depth - starts at the
			// same left edge; Obsidian indents purely via each row's own
			// padding-inline-start (confirmed live: a root-level folder and a
			// deeply-nested file both report the same selfEl.left). A fixed
			// icon offset therefore only happens to look right at one specific
			// depth - it has to be computed from *this* row's own padding each
			// time, the same way Obsidian positions its native folder icon
			// just inside that row's own reserved gutter.
			const nativePadding = parseFloat(getComputedStyle(item.selfEl).paddingInlineStart) || 0;
			const iconInset = Math.max(2, nativePadding - FILE_ICON_RESERVED_WIDTH);
			icon.style.insetInlineStart = `${iconInset}px`;

			const expanded = this.expandedKeys.has(hostKey);
			root.classList.toggle("loud-outline-collapsed", !expanded);
			icon.classList.toggle("is-collapsed", !expanded);
		}

		const sig = entries.map((e) => `${e.file.path}#${e.outline.id}`).join("|");
		if (!childrenEl || childrenEl.dataset.loSig !== sig) {
			childrenEl?.remove();
			childrenEl = createDiv({
				cls: "loud-outline-root-children loud-outline-children",
				attr: { "data-lo-sig": sig },
			});
			for (const { file, outline } of entries) {
				for (const node of outline.nodes) {
					const el = this.renderNode(node, file, 1);
					if (el) childrenEl.appendChild(el);
				}
			}
			if (isFolder) {
				// Read as "this folder's own note content first, then whatever
				// it actually contains" rather than appended after everything.
				const nativeChildren = root.querySelector(
					":scope > .tree-item-children:not(.loud-outline-children)"
				);
				if (nativeChildren) root.insertBefore(childrenEl, nativeChildren);
				else root.appendChild(childrenEl);
			} else {
				root.appendChild(childrenEl);
			}
		}
	}

	/**
	 * Returns null (renders nothing, for this node or its children) only when
	 * a task is actively hidden by the Checklist Status Sets integration -
	 * mirroring "hide completed" removing the task from the note's own
	 * render entirely, not just visually. Every other node always renders.
	 */
	private renderNode(node: OutlineNode, file: TFile, depth: number): HTMLElement | null {
		let decoration: ChecklistTaskStatusDecoration | undefined;
		if (node.type === "task" && node.marker !== undefined) {
			decoration = this.checklistIntegration.getApi()?.getStatusDecoration(file.path, node.line, node.marker);
			if (decoration?.hidden) return null;
		}

		const wrapper = createDiv({
			cls: "loud-outline-item",
			attr: {
				"data-lo-type": node.type,
				// A checklist-status decoration's own isCompleted (when present)
				// takes precedence over the raw x/X checked state - a custom
				// status might mean "done" via a marker that isn't x/X at all
				// (or vice versa, a status explicitly not marked completed).
				...(node.checked !== undefined
					? { "data-lo-checked": String(decoration?.isCompleted ?? node.checked) }
					: {}),
			},
		});
		wrapper.style.setProperty("--lo-depth", String(depth));

		const self = wrapper.createDiv({ cls: "loud-outline-item-self" });

		const hasChildren = node.children.length > 0;
		const nodeKey = `n:${file.path}:${node.line}:${node.type}`;

		if (hasChildren) {
			const collapsed = !this.expandedKeys.has(nodeKey);
			const icon = this.createCollapseIcon(collapsed);
			self.appendChild(icon);
			icon.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				this.toggleExpanded(nodeKey, wrapper, icon);
			});
		} else {
			self.createDiv({ cls: "loud-outline-collapse-icon loud-outline-collapse-icon-spacer" });
		}

		const inner = self.createDiv({ cls: "loud-outline-item-inner" });

		if (node.type === "task") {
			const label = this.renderTaskCheckbox(inner, node, decoration);
			label.setText(node.text);
		} else {
			inner.createSpan({ cls: "loud-outline-item-label", text: node.text });
		}

		self.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.navigateTo(file, node.line);
		});

		if (hasChildren) {
			const childrenEl = wrapper.createDiv({ cls: "loud-outline-item-children loud-outline-children" });
			for (const child of node.children) {
				const childEl = this.renderNode(child, file, depth + 1);
				if (childEl) childrenEl.appendChild(childEl);
			}
			wrapper.classList.toggle("loud-outline-collapsed", !this.expandedKeys.has(nodeKey));
		}

		return wrapper;
	}

	/**
	 * Renders a task's checkbox, matching whatever custom checkbox styling
	 * the note itself would show for this exact task where possible, rather
	 * than always a plain native checkbox - see README, Compatibility.
	 *
	 * - If Checklist Status Sets governs this task, its status dot is
	 *   reproduced exactly (color, label, Glow) - shape kept in sync by hand
	 *   with that plugin's own `.csi-dot` (see styles.css).
	 * - Otherwise, a real `<li class="task-list-item" data-task="…">` /
	 *   `<input data-task="…">` pair is used - the same DOM shape and
	 *   attribute Obsidian's own Reading View renders - so a CSS-only
	 *   "alternate checkbox" snippet or theme keyed off `data-task` (common
	 *   convention across the community, not scoped to this plugin) styles
	 *   this row too, for free.
	 *
	 * Returns the label element so the caller can fill in its text - kept
	 * here rather than inside this method so every node type still creates
	 * its label through one call site in renderNode.
	 */
	private renderTaskCheckbox(
		inner: HTMLElement,
		node: OutlineNode,
		decoration: ChecklistTaskStatusDecoration | undefined
	): HTMLElement {
		const marker = node.marker ?? (node.checked ? "x" : " ");
		const isNativeChecked = marker === "x" || marker === "X";

		const li = inner.createEl("li", { cls: "task-list-item loud-outline-task-list-item" });
		li.setAttribute("data-task", marker);
		li.classList.toggle("is-checked", isNativeChecked);

		if (decoration) {
			const dot = li.createSpan({ cls: "loud-outline-status-dot" });
			dot.setCssStyles({ backgroundColor: decoration.color, color: decoration.color });
			dot.setAttribute("aria-label", decoration.label);
			li.classList.toggle("loud-outline-glow", this.checklistIntegration.getApi()?.isGlowEnabled() ?? false);
		} else {
			const checkbox = li.createEl("input", {
				cls: "task-list-item-checkbox loud-outline-task-checkbox",
				type: "checkbox",
				attr: { "data-task": marker },
			});
			checkbox.checked = isNativeChecked;
			checkbox.disabled = true;
		}

		return li.createSpan({ cls: "loud-outline-item-label" });
	}

	private createCollapseIcon(collapsed: boolean): HTMLElement {
		const icon = createDiv({ cls: "loud-outline-collapse-icon" });
		setIcon(icon, COLLAPSE_ICON_NAME);
		icon.classList.toggle("is-collapsed", collapsed);
		return icon;
	}

	private toggleExpanded(key: string, contentHost: HTMLElement, icon: HTMLElement): void {
		const nowExpanded = !this.expandedKeys.has(key);
		if (nowExpanded) this.expandedKeys.add(key);
		else this.expandedKeys.delete(key);
		contentHost.classList.toggle("loud-outline-collapsed", !nowExpanded);
		icon.classList.toggle("is-collapsed", !nowExpanded);
	}

	private navigateTo(file: TFile, line: number): void {
		this.app.workspace
			.openLinkText("", file.path, false, {
				active: true,
				eState: { line },
			})
			.catch(() => {
				/* best-effort navigation */
			});
	}
}
