import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, LoudOutlineSettings } from "./settings";
import { ExplorerOutlineManager } from "./explorerIntegration";

export default class LoudOutlinePlugin extends Plugin {
	settings: LoudOutlineSettings = DEFAULT_SETTINGS;
	private manager: ExplorerOutlineManager | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new LoudOutlineSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.manager = new ExplorerOutlineManager(this.app, this);
			this.manager.start();
		});
	}

	onunload(): void {
		this.manager?.stop();
		this.manager = null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.manager?.refreshAll();
	}
}

class LoudOutlineSettingTab extends PluginSettingTab {
	plugin: LoudOutlinePlugin;

	constructor(app: App, plugin: LoudOutlinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Show tasks and lists")
			.setDesc(
				"Show task and list items as nested nodes in the file explorer, in addition to headings. " +
					"A list's own top-level item nests under the heading above it (or directly under the " +
					"file, if there's no heading), and items nested within that list nest the same way in " +
					"the tree. Turn this off to show headings only."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showListsAndTasks).onChange(async (value) => {
					this.plugin.settings.showListsAndTasks = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
