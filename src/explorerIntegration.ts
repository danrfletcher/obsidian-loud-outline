import { App, TFile, WorkspaceLeaf } from "obsidian";
import { buildOutlineTree, OutlineNode } from "./outlineTree";
import type LoudOutlinePlugin from "./main";

/**
 * Minimal shape of Obsidian's internal file-explorer "FileItem"/"FolderItem"
 * objects that we rely on. These are undocumented internals (confirmed live
 * against Obsidian 1.13.7), not part of the public API, hence the manual
 * typing here instead of an import from "obsidian".
 */
interface ExplorerItem {
	file: TFile;
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

interface CachedOutline {
	/** Monotonic id, used as a cheap "has this changed" signature for re-renders. */
	id: number;
	nodes: OutlineNode[];
}

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
	/** Keys of currently-expanded nodes (file roots and inner nodes alike). Empty = everything collapsed. */
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

	stop(): void {
		this.observer?.disconnect();
		this.observer = null;
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

	private syncAll(): void {
		const view = this.view;
		if (!view || !view.fileItems) return;
		for (const path of Object.keys(view.fileItems)) {
			const item = view.fileItems[path];
			const file = item?.file;
			if (!file || !(file instanceof TFile) || file.extension !== "md") continue;
			this.syncFileItem(item, file);
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

	private syncFileItem(item: ExplorerItem, file: TFile): void {
		const root = item.el;
		if (!root || !root.isConnected) return;

		const outline = this.getOutline(file);
		let childrenEl = root.querySelector(":scope > .loud-outline-root-children") as HTMLElement | null;
		let icon = item.selfEl?.querySelector(":scope > .loud-outline-collapse-icon") as HTMLElement | null;

		if (!outline.nodes.length) {
			childrenEl?.remove();
			icon?.remove();
			root.classList.remove("loud-outline-has-children", "loud-outline-collapsed");
			return;
		}

		const fileKey = `f:${file.path}`;

		if (!icon) {
			icon = this.createCollapseIcon(!this.expandedKeys.has(fileKey));
			icon.addClass("loud-outline-file-icon");
			item.selfEl.insertBefore(icon, item.selfEl.firstChild);
			icon.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				this.toggleExpanded(fileKey, root, icon!);
			});
		}

		root.classList.add("loud-outline-has-children");
		const expanded = this.expandedKeys.has(fileKey);
		root.classList.toggle("loud-outline-collapsed", !expanded);
		icon.classList.toggle("is-collapsed", !expanded);

		if (!childrenEl || childrenEl.dataset.loSig !== String(outline.id)) {
			childrenEl?.remove();
			childrenEl = document.createElement("div");
			childrenEl.className = "loud-outline-root-children loud-outline-children";
			childrenEl.dataset.loSig = String(outline.id);
			for (const node of outline.nodes) {
				childrenEl.appendChild(this.renderNode(node, file, 1));
			}
			root.appendChild(childrenEl);
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
