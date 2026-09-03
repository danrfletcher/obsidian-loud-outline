import { App, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { buildOutlineTree, OutlineNode } from "./outlineTree";
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

const COLLAPSE_ICON_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
	'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
	'class="loud-outline-svg-icon"><path d="M3 8L12 17L21 8"></path></svg>';

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

	constructor(private app: App, private plugin: LoudOutlinePlugin) {}

	start(): void {
		this.attachToExplorer();

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
	 */
	private rowVisibility(item: ExplorerItem | undefined | null): RowVisibility {
		const root = item?.el;
		const self = item?.selfEl;
		if (!root || !root.isConnected || !self || !self.isConnected) return "unmounted";

		if (getComputedStyle(self).display === "none") {
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

			const state = this.rowVisibility(item);
			if (state === "visible") {
				addToHost(item, file);
				continue;
			}

			if (state === "singled-out-hidden") {
				// This file's own row is deliberately hidden (e.g. a folder-note
				// plugin excluding it from the listing) while its parent folder
				// is open. Since the parent folder is effectively standing in
				// for this file, its outline belongs under the folder instead.
				const parent = file.parent;
				if (parent && !parent.isRoot()) {
					const parentItem = view.fileItems[parent.path];
					if (parentItem && this.rowVisibility(parentItem) === "visible") {
						addToHost(parentItem, file);
					}
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

		let childrenEl = root.querySelector(":scope > .loud-outline-root-children") as HTMLElement | null;
		let icon = !isFolder
			? (item.selfEl?.querySelector(":scope > .loud-outline-collapse-icon") as HTMLElement | null)
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
			childrenEl = document.createElement("div");
			childrenEl.className = "loud-outline-root-children loud-outline-children";
			childrenEl.dataset.loSig = sig;
			for (const { file, outline } of entries) {
				for (const node of outline.nodes) {
					childrenEl.appendChild(this.renderNode(node, file, 1));
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

	private renderNode(node: OutlineNode, file: TFile, depth: number): HTMLElement {
		const wrapper = document.createElement("div");
		wrapper.className = "loud-outline-item";
		wrapper.dataset.loType = node.type;
		if (node.checked !== undefined) wrapper.dataset.loChecked = String(node.checked);
		wrapper.style.setProperty("--lo-depth", String(depth));

		const self = document.createElement("div");
		self.className = "loud-outline-item-self";
		wrapper.appendChild(self);

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
			const spacer = document.createElement("div");
			spacer.className = "loud-outline-collapse-icon loud-outline-collapse-icon-spacer";
			self.appendChild(spacer);
		}

		const inner = document.createElement("div");
		inner.className = "loud-outline-item-inner";

		if (node.type === "task") {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = !!node.checked;
			checkbox.disabled = true;
			checkbox.className = "loud-outline-task-checkbox";
			inner.appendChild(checkbox);
		}

		const label = document.createElement("span");
		label.className = "loud-outline-item-label";
		label.textContent = node.text;
		inner.appendChild(label);
		self.appendChild(inner);

		self.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.navigateTo(file, node.line);
		});

		if (hasChildren) {
			const childrenEl = document.createElement("div");
			childrenEl.className = "loud-outline-item-children loud-outline-children";
			for (const child of node.children) {
				childrenEl.appendChild(this.renderNode(child, file, depth + 1));
			}
			wrapper.appendChild(childrenEl);
			wrapper.classList.toggle("loud-outline-collapsed", !this.expandedKeys.has(nodeKey));
		}

		return wrapper;
	}

	private createCollapseIcon(collapsed: boolean): HTMLElement {
		const icon = document.createElement("div");
		icon.className = "loud-outline-collapse-icon";
		icon.innerHTML = COLLAPSE_ICON_SVG;
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
