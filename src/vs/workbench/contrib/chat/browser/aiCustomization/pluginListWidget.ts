/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, isDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { IAction, Action, Separator } from '../../../../../base/common/actions.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { AgentPluginItemKind, IAgentPluginItem, IInstalledPluginItem, IMarketplacePluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { pluginIcon } from './aiCustomizationIcons.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';

const $ = DOM.$;

const PLUGIN_ITEM_HEIGHT = 36;
const PLUGIN_GROUP_HEADER_HEIGHT = 36;
const PLUGIN_GROUP_HEADER_HEIGHT_WITH_SEPARATOR = 40;

//#region Entry types

/**
 * Represents a collapsible group header in the plugin list.
 */
interface IPluginGroupHeaderEntry {
	readonly type: 'group-header';
	readonly id: string;
	readonly group: 'enabled' | 'disabled';
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly count: number;
	readonly isFirst: boolean;
	readonly description: string;
	collapsed: boolean;
}

/**
 * Represents an installed plugin item in the list.
 */
interface IPluginInstalledItemEntry {
	readonly type: 'plugin-item';
	readonly item: IInstalledPluginItem;
}

/**
 * Represents a marketplace plugin item in the list (browse mode).
 */
interface IPluginMarketplaceItemEntry {
	readonly type: 'marketplace-item';
	readonly item: IMarketplacePluginItem;
}

type IPluginListEntry = IPluginGroupHeaderEntry | IPluginInstalledItemEntry | IPluginMarketplaceItemEntry;

//#endregion

//#region Delegate

class PluginItemDelegate implements IListVirtualDelegate<IPluginListEntry> {
	getHeight(element: IPluginListEntry): number {
		if (element.type === 'group-header') {
			return element.isFirst ? PLUGIN_GROUP_HEADER_HEIGHT : PLUGIN_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		return PLUGIN_ITEM_HEIGHT;
	}

	getTemplateId(element: IPluginListEntry): string {
		if (element.type === 'group-header') {
			return 'pluginGroupHeader';
		}
		if (element.type === 'marketplace-item') {
			return 'pluginMarketplaceItem';
		}
		return 'pluginInstalledItem';
	}
}

//#endregion

//#region Group Header Renderer (reuses .ai-customization-group-header CSS)

interface IPluginGroupHeaderTemplateData {
	readonly container: HTMLElement;
	readonly chevron: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
	readonly infoIcon: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class PluginGroupHeaderRenderer implements IListRenderer<IPluginGroupHeaderEntry, IPluginGroupHeaderTemplateData> {
	readonly templateId = 'pluginGroupHeader';

	constructor(
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IPluginGroupHeaderTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('ai-customization-group-header');

		const chevron = DOM.append(container, $('.group-chevron'));
		const icon = DOM.append(container, $('.group-icon'));
		const labelGroup = DOM.append(container, $('.group-label-group'));
		const label = DOM.append(labelGroup, $('.group-label'));
		const infoIcon = DOM.append(labelGroup, $('.group-info'));
		infoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
		const count = DOM.append(container, $('.group-count'));

		return { container, chevron, icon, label, count, infoIcon, disposables, elementDisposables };
	}

	renderElement(element: IPluginGroupHeaderEntry, _index: number, templateData: IPluginGroupHeaderTemplateData): void {
		templateData.elementDisposables.clear();

		templateData.chevron.className = 'group-chevron';
		templateData.chevron.classList.add(...ThemeIcon.asClassNameArray(element.collapsed ? Codicon.chevronRight : Codicon.chevronDown));

		templateData.icon.className = 'group-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));

		templateData.label.textContent = element.label;
		templateData.count.textContent = `${element.count}`;

		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.infoIcon, () => ({
			content: element.description,
			appearance: {
				compact: true,
				skipFadeInAnimation: true,
			}
		})));

		templateData.container.classList.toggle('collapsed', element.collapsed);
		templateData.container.classList.toggle('has-previous-group', !element.isFirst);
	}

	disposeTemplate(templateData: IPluginGroupHeaderTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.disposables.dispose();
	}
}

//#endregion

//#region Installed Plugin Renderer (reuses .mcp-server-item CSS)

interface IPluginInstalledItemTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly description: HTMLElement;
	readonly status: HTMLElement;
	readonly disposables: DisposableStore;
}

class PluginInstalledItemRenderer implements IListRenderer<IPluginInstalledItemEntry, IPluginInstalledItemTemplateData> {
	readonly templateId = 'pluginInstalledItem';

	renderTemplate(container: HTMLElement): IPluginInstalledItemTemplateData {
		container.classList.add('mcp-server-item');

		const details = DOM.append(container, $('.mcp-server-details'));
		const name = DOM.append(details, $('.mcp-server-name'));
		const description = DOM.append(details, $('.mcp-server-description'));
		const status = DOM.append(container, $('.mcp-server-status'));

		return { container, name, description, status, disposables: new DisposableStore() };
	}

	renderElement(element: IPluginInstalledItemEntry, _index: number, templateData: IPluginInstalledItemTemplateData): void {
		templateData.disposables.clear();

		templateData.name.textContent = element.item.name;

		if (element.item.description) {
			templateData.description.textContent = element.item.description;
			templateData.description.style.display = '';
		} else {
			templateData.description.style.display = 'none';
		}

		// Show enabled/disabled status
		templateData.disposables.add(autorun(reader => {
			const enabled = element.item.plugin.enabled.read(reader);
			templateData.status.className = 'mcp-server-status';
			if (enabled) {
				templateData.status.textContent = localize('enabled', "Enabled");
				templateData.status.classList.add('running');
			} else {
				templateData.status.textContent = localize('disabled', "Disabled");
				templateData.status.classList.add('stopped');
			}
		}));
	}

	disposeTemplate(templateData: IPluginInstalledItemTemplateData): void {
		templateData.disposables.dispose();
	}
}

//#endregion

//#region Marketplace Plugin Renderer (reuses .mcp-gallery-item CSS)

interface IPluginMarketplaceItemTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly publisher: HTMLElement;
	readonly description: HTMLElement;
	readonly installButton: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

class PluginMarketplaceItemRenderer implements IListRenderer<IPluginMarketplaceItemEntry, IPluginMarketplaceItemTemplateData> {
	readonly templateId = 'pluginMarketplaceItem';

	constructor(
		private readonly pluginInstallService: IPluginInstallService,
	) { }

	renderTemplate(container: HTMLElement): IPluginMarketplaceItemTemplateData {
		container.classList.add('mcp-server-item', 'mcp-gallery-item');

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-gallery-name-row'));
		const name = DOM.append(nameRow, $('.mcp-server-name'));
		const publisher = DOM.append(nameRow, $('.mcp-gallery-publisher'));
		const description = DOM.append(details, $('.mcp-server-description'));

		const actionContainer = DOM.append(container, $('.mcp-gallery-action'));
		const installButton = new Button(actionContainer, { ...defaultButtonStyles, supportIcons: true });
		installButton.element.classList.add('mcp-gallery-install-button');

		const templateDisposables = new DisposableStore();
		templateDisposables.add(installButton);

		return { container, name, publisher, description, installButton, elementDisposables: new DisposableStore(), templateDisposables };
	}

	renderElement(element: IPluginMarketplaceItemEntry, _index: number, templateData: IPluginMarketplaceItemTemplateData): void {
		templateData.elementDisposables.clear();

		templateData.name.textContent = element.item.name;
		templateData.publisher.textContent = element.item.marketplace ? localize('byPublisher', "by {0}", element.item.marketplace) : '';
		templateData.description.textContent = element.item.description || '';

		templateData.installButton.label = localize('install', "Install");
		templateData.installButton.enabled = true;

		templateData.elementDisposables.add(templateData.installButton.onDidClick(async () => {
			templateData.installButton.label = localize('installing', "Installing...");
			templateData.installButton.enabled = false;
			try {
				await this.pluginInstallService.installPlugin({
					name: element.item.name,
					description: element.item.description,
					version: '',
					sourceDescriptor: element.item.sourceDescriptor,
					source: element.item.source,
					marketplace: element.item.marketplace,
					marketplaceReference: element.item.marketplaceReference,
					marketplaceType: element.item.marketplaceType,
					readmeUri: element.item.readmeUri,
				});
				templateData.installButton.label = localize('installed', "Installed");
			} catch (_e) {
				templateData.installButton.label = localize('install', "Install");
				templateData.installButton.enabled = true;
			}
		}));
	}

	disposeTemplate(templateData: IPluginMarketplaceItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

//#endregion

//#region Plugin context menu actions

function getInstalledPluginContextMenuActions(plugin: IAgentPlugin, instantiationService: IInstantiationService): IAction[][] {
	const groups: IAction[][] = [];
	if (plugin.enabled.get()) {
		groups.push([instantiationService.createInstance(DisablePluginAction, plugin)]);
	} else {
		groups.push([instantiationService.createInstance(EnablePluginAction, plugin)]);
	}
	groups.push([
		instantiationService.createInstance(OpenPluginFolderAction, plugin),
	]);
	if (plugin.fromMarketplace) {
		groups.push([new UninstallPluginAction(plugin)]);
	}
	return groups;
}

class EnablePluginAction extends Action {
	constructor(
		private readonly plugin: IAgentPlugin,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
	) {
		super('pluginListWidget.enable', localize('enable', "Enable"));
	}

	override async run(): Promise<void> {
		this.agentPluginService.setPluginEnabled(this.plugin.uri, true);
	}
}

class DisablePluginAction extends Action {
	constructor(
		private readonly plugin: IAgentPlugin,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
	) {
		super('pluginListWidget.disable', localize('disable', "Disable"));
	}

	override async run(): Promise<void> {
		this.agentPluginService.setPluginEnabled(this.plugin.uri, false);
	}
}

class OpenPluginFolderAction extends Action {
	constructor(
		private readonly plugin: IAgentPlugin,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super('pluginListWidget.openFolder', localize('openPluginFolder', "Open Plugin Folder"));
	}

	override async run(): Promise<void> {
		try {
			await this.commandService.executeCommand('revealFileInOS', this.plugin.uri);
		} catch {
			await this.openerService.open(dirname(this.plugin.uri));
		}
	}
}

class UninstallPluginAction extends Action {
	constructor(
		private readonly plugin: IAgentPlugin,
	) {
		super('pluginListWidget.uninstall', localize('uninstall', "Uninstall"));
	}

	override async run(): Promise<void> {
		this.plugin.remove();
	}
}

//#endregion

//#region Helpers

function installedPluginToItem(plugin: IAgentPlugin, labelService: ILabelService): IInstalledPluginItem {
	const name = plugin.label ?? basename(plugin.uri);
	const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
	const marketplace = plugin.fromMarketplace?.marketplace;
	return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin };
}

function marketplacePluginToItem(plugin: IMarketplacePlugin): IMarketplacePluginItem {
	return {
		kind: AgentPluginItemKind.Marketplace,
		name: plugin.name,
		description: plugin.description,
		source: plugin.source,
		sourceDescriptor: plugin.sourceDescriptor,
		marketplace: plugin.marketplace,
		marketplaceReference: plugin.marketplaceReference,
		marketplaceType: plugin.marketplaceType,
		readmeUri: plugin.readmeUri,
	};
}

//#endregion

/**
 * Widget that displays a list of agent plugins with marketplace browsing.
 * Follows the same patterns as {@link McpListWidget}.
 */
export class PluginListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidSelectPlugin = this._register(new Emitter<IAgentPluginItem>());
	readonly onDidSelectPlugin = this._onDidSelectPlugin.event;

	private sectionHeader!: HTMLElement;
	private sectionDescription!: HTMLElement;
	private sectionLink!: HTMLAnchorElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchInput!: InputBox;
	private listContainer!: HTMLElement;
	private list!: WorkbenchList<IPluginListEntry>;
	private emptyContainer!: HTMLElement;
	private emptyText!: HTMLElement;
	private emptySubtext!: HTMLElement;
	private browseButton!: Button;
	private backLink!: HTMLElement;

	private installedItems: IInstalledPluginItem[] = [];
	private displayEntries: IPluginListEntry[] = [];
	private marketplaceItems: IMarketplacePluginItem[] = [];
	private searchQuery: string = '';
	private browseMode: boolean = false;
	private readonly collapsedGroups = new Set<string>();
	private marketplaceCts: CancellationTokenSource | undefined;
	private readonly delayedFilter = new Delayer<void>(200);
	private readonly delayedMarketplaceSearch = new Delayer<void>(400);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();
		this.element = $('.mcp-list-widget'); // reuse MCP list widget CSS
		this.create();
		this._register({
			dispose: () => {
				this.marketplaceCts?.dispose();
			}
		});
	}

	private create(): void {
		// Search and button container
		this.searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));

		// Search container
		const searchContainer = DOM.append(this.searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
			placeholder: localize('searchPluginsPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this._register(this.searchInput.onDidChange(() => {
			this.searchQuery = this.searchInput.value;
			if (this.browseMode) {
				this.delayedMarketplaceSearch.trigger(() => this.queryMarketplace());
			} else {
				this.delayedFilter.trigger(() => this.filterPlugins());
			}
		}));

		// Button container (Browse Marketplace)
		const buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));

		const browseButtonContainer = DOM.append(buttonContainer, $('.list-add-button-container'));
		this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
		this.browseButton.element.classList.add('list-add-button');
		this._register(this.browseButton.onDidClick(() => {
			this.toggleBrowseMode(!this.browseMode);
		}));

		// Back to installed link (shown only in browse mode)
		this.backLink = DOM.append(this.element, $('.mcp-back-link'));
		this.backLink.setAttribute('role', 'button');
		this.backLink.tabIndex = 0;
		this.backLink.setAttribute('aria-label', localize('backToInstalledPluginsAriaLabel', "Back to installed plugins"));
		const backIcon = DOM.append(this.backLink, $('span'));
		backIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowLeft));
		const backText = DOM.append(this.backLink, $('span'));
		backText.textContent = localize('backToInstalledPlugins', "Back to installed plugins");
		this._register(DOM.addDisposableListener(this.backLink, 'click', () => {
			this.toggleBrowseMode(false);
		}));
		this._register(DOM.addDisposableListener(this.backLink, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleBrowseMode(false);
			}
		}));
		this.backLink.style.display = 'none';

		// Empty state
		this.emptyContainer = DOM.append(this.element, $('.mcp-empty-state'));
		const emptyIcon = DOM.append(this.emptyContainer, $('.empty-icon'));
		emptyIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
		this.emptyText = DOM.append(this.emptyContainer, $('.empty-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));

		// List container
		this.listContainer = DOM.append(this.element, $('.mcp-list-container'));

		// Section footer
		this.sectionHeader = DOM.append(this.element, $('.section-footer'));
		this.sectionDescription = DOM.append(this.sectionHeader, $('p.section-footer-description'));
		this.sectionDescription.textContent = localize('pluginsDescription', "Extend your AI agent with plugins that add commands, skills, agents, hooks, and MCP servers from reusable packages.");
		this.sectionLink = DOM.append(this.sectionHeader, $('a.section-footer-link')) as HTMLAnchorElement;
		this.sectionLink.textContent = localize('learnMorePlugins', "Learn more about agent plugins");
		this.sectionLink.href = 'https://code.visualstudio.com/docs/copilot/chat/agent-plugins';
		this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
			e.preventDefault();
			const href = this.sectionLink.href;
			if (href) {
				this.openerService.open(URI.parse(href));
			}
		}));

		// Create list
		const delegate = new PluginItemDelegate();
		const groupHeaderRenderer = new PluginGroupHeaderRenderer(this.hoverService);
		const installedRenderer = new PluginInstalledItemRenderer();
		const marketplaceRenderer = new PluginMarketplaceItemRenderer(this.pluginInstallService);

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IPluginListEntry>,
			'PluginManagementList',
			this.listContainer,
			delegate,
			[groupHeaderRenderer, installedRenderer, marketplaceRenderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(element: IPluginListEntry) {
						if (element.type === 'group-header') {
							return localize('pluginGroupAriaLabel', "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
						}
						if (element.type === 'marketplace-item') {
							return element.item.name;
						}
						return element.item.name;
					},
					getWidgetAriaLabel() {
						return localize('pluginsListAriaLabel', "Plugins");
					}
				},
				openOnSingleClick: true,
				identityProvider: {
					getId(element: IPluginListEntry) {
						if (element.type === 'group-header') {
							return element.id;
						}
						if (element.type === 'marketplace-item') {
							return `marketplace-${element.item.marketplaceReference.canonicalId}/${element.item.source}`;
						}
						return element.item.plugin.uri.toString();
					}
				}
			}
		));

		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				if (e.element.type === 'group-header') {
					this.toggleGroup(e.element);
				} else if (e.element.type === 'plugin-item') {
					this._onDidSelectPlugin.fire(e.element.item);
				} else if (e.element.type === 'marketplace-item') {
					this._onDidSelectPlugin.fire(e.element.item);
				}
			}
		}));

		// Handle context menu
		this._register(this.list.onContextMenu(e => this.onContextMenu(e as IListContextMenuEvent<IPluginListEntry>)));

		// Listen to plugin service changes
		this._register(autorun(reader => {
			this.agentPluginService.allPlugins.read(reader);
			if (!this.browseMode) {
				this.refresh();
			}
		}));
		this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
			if (!this.browseMode) {
				this.refresh();
			}
		}));

		// Initial refresh
		void this.refresh();
	}

	private async refresh(): Promise<void> {
		if (this.browseMode) {
			await this.queryMarketplace();
		} else {
			this.filterPlugins();
		}
	}

	private toggleBrowseMode(browse: boolean): void {
		this.browseMode = browse;
		this.searchInput.value = '';
		this.searchQuery = '';

		this.backLink.style.display = browse ? '' : 'none';
		this.browseButton.element.parentElement!.style.display = browse ? 'none' : '';

		this.searchInput.setPlaceHolder(browse
			? localize('searchMarketplacePlaceholder', "Search plugin marketplace...")
			: localize('searchPluginsPlaceholder', "Type to search...")
		);

		if (browse) {
			void this.queryMarketplace();
		} else {
			this.marketplaceCts?.dispose(true);
			this.marketplaceItems = [];
			this.filterPlugins();
		}
	}

	private async queryMarketplace(): Promise<void> {
		this.marketplaceCts?.dispose(true);
		const cts = this.marketplaceCts = new CancellationTokenSource();

		// Show loading state
		this.emptyContainer.style.display = 'flex';
		this.listContainer.style.display = 'none';
		this.emptyText.textContent = localize('loadingMarketplace', "Loading marketplace...");
		this.emptySubtext.textContent = '';

		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);

			if (cts.token.isCancellationRequested) {
				return;
			}

			const query = this.searchQuery.toLowerCase().trim();
			const filtered = query
				? plugins.filter(p => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query))
				: plugins;

			// Filter out already-installed plugins
			const installedUris = new Set(this.agentPluginService.allPlugins.get().map(p => p.uri.toString()));
			this.marketplaceItems = filtered
				.filter(p => {
					const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
					return !installedUris.has(expectedUri.toString());
				})
				.map(marketplacePluginToItem);

			this.updateMarketplaceList();
		} catch {
			if (!cts.token.isCancellationRequested) {
				this.marketplaceItems = [];
				this.emptyContainer.style.display = 'flex';
				this.listContainer.style.display = 'none';
				this.emptyText.textContent = localize('marketplaceError', "Unable to load marketplace");
				this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
			}
		}
	}

	private updateMarketplaceList(): void {
		if (this.marketplaceItems.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';
			if (this.searchQuery.trim()) {
				this.emptyText.textContent = localize('noMarketplaceResults', "No plugins match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				this.emptyText.textContent = localize('emptyMarketplace', "No plugins available");
				this.emptySubtext.textContent = '';
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		const entries: IPluginListEntry[] = this.marketplaceItems.map(item => ({ type: 'marketplace-item' as const, item }));
		this.list.splice(0, this.list.length, entries);
	}

	private filterPlugins(): void {
		const query = this.searchQuery.toLowerCase().trim();
		const allPlugins = this.agentPluginService.allPlugins.get();

		this.installedItems = allPlugins
			.map(p => installedPluginToItem(p, this.labelService))
			.filter(item => !query ||
				item.name.toLowerCase().includes(query) ||
				item.description.toLowerCase().includes(query)
			);

		if (this.installedItems.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';

			if (this.searchQuery.trim()) {
				this.emptyText.textContent = localize('noMatchingPlugins', "No plugins match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				this.emptyText.textContent = localize('noPlugins', "No plugins installed");
				this.emptySubtext.textContent = localize('browseToAdd', "Browse the marketplace to discover and install plugins");
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		// Group plugins: enabled vs disabled
		const enabledPlugins = this.installedItems.filter(item => item.plugin.enabled.get());
		const disabledPlugins = this.installedItems.filter(item => !item.plugin.enabled.get());

		const entries: IPluginListEntry[] = [];
		let isFirst = true;

		if (enabledPlugins.length > 0) {
			const collapsed = this.collapsedGroups.has('enabled');
			entries.push({
				type: 'group-header',
				id: 'plugin-group-enabled',
				group: 'enabled',
				label: localize('enabledGroup', "Enabled"),
				icon: pluginIcon,
				count: enabledPlugins.length,
				isFirst,
				description: localize('enabledGroupDescription', "Plugins that are currently active and providing commands, skills, agents, and other capabilities."),
				collapsed,
			});
			if (!collapsed) {
				for (const item of enabledPlugins) {
					entries.push({ type: 'plugin-item', item });
				}
			}
			isFirst = false;
		}

		if (disabledPlugins.length > 0) {
			const collapsed = this.collapsedGroups.has('disabled');
			entries.push({
				type: 'group-header',
				id: 'plugin-group-disabled',
				group: 'disabled',
				label: localize('disabledGroup', "Disabled"),
				icon: pluginIcon,
				count: disabledPlugins.length,
				isFirst,
				description: localize('disabledGroupDescription', "Plugins that are installed but currently disabled. Enable them to use their capabilities."),
				collapsed,
			});
			if (!collapsed) {
				for (const item of disabledPlugins) {
					entries.push({ type: 'plugin-item', item });
				}
			}
		}

		this.displayEntries = entries;
		this.list.splice(0, this.list.length, this.displayEntries);
	}

	private toggleGroup(entry: IPluginGroupHeaderEntry): void {
		if (this.collapsedGroups.has(entry.group)) {
			this.collapsedGroups.delete(entry.group);
		} else {
			this.collapsedGroups.add(entry.group);
		}
		this.filterPlugins();
	}

	layout(height: number, width: number): void {
		const sectionFooterHeight = this.sectionHeader.offsetHeight || 0;
		const searchBarHeight = this.searchAndButtonContainer.offsetHeight || 40;
		const backLinkHeight = this.browseMode ? (this.backLink.offsetHeight || 28) : 0;
		const listHeight = height - sectionFooterHeight - searchBarHeight - backLinkHeight;

		this.listContainer.style.height = `${Math.max(0, listHeight)}px`;
		this.list.layout(Math.max(0, listHeight), width);

		if (sectionFooterHeight === 0) {
			DOM.getWindow(this.listContainer).requestAnimationFrame(() => {
				if (this._store.isDisposed) {
					return;
				}
				const actualFooterHeight = this.sectionHeader.offsetHeight;
				if (actualFooterHeight > 0) {
					const correctedHeight = height - actualFooterHeight - searchBarHeight - backLinkHeight;
					this.listContainer.style.height = `${Math.max(0, correctedHeight)}px`;
					this.list.layout(Math.max(0, correctedHeight), width);
				}
			});
		}
	}

	focusSearch(): void {
		this.searchInput.focus();
	}

	focus(): void {
		this.list.domFocus();
		if (this.list.length > 0) {
			this.list.setFocus([0]);
		}
	}

	private onContextMenu(e: IListContextMenuEvent<IPluginListEntry>): void {
		if (!e.element || e.element.type !== 'plugin-item') {
			return;
		}

		const entry = e.element;
		const disposables = new DisposableStore();
		const groups: IAction[][] = getInstalledPluginContextMenuActions(entry.item.plugin, this.instantiationService);
		const actions: IAction[] = [];
		for (const menuActions of groups) {
			for (const menuAction of menuActions) {
				actions.push(menuAction);
				if (isDisposable(menuAction)) {
					disposables.add(menuAction);
				}
			}
			actions.push(new Separator());
		}
		if (actions.length > 0 && actions[actions.length - 1] instanceof Separator) {
			actions.pop();
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose()
		});
	}
}
