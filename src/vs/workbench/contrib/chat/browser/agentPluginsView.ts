/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListContextMenuEvent } from '../../../../base/browser/ui/list/list.js';
import { IPagedRenderer } from '../../../../base/browser/ui/list/listPaging.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, isDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IPagedModel, PagedModel } from '../../../../base/common/paging.js';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchPagedList } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewDescriptorService, IViewsRegistry, Extensions as ViewExtensions } from '../../../common/views.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { AbstractExtensionsListView } from '../../extensions/browser/extensionsViews.js';
import { DefaultViewsContext, extensionsFilterSubMenu, IExtensionsWorkbenchService, SearchAgentPluginsContext } from '../../extensions/common/extensions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IAgentPlugin, IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IMarketplaceReference, IPluginMarketplaceService, MarketplaceType } from '../common/plugins/pluginMarketplaceService.js';

export const HasInstalledAgentPluginsContext = new RawContextKey<boolean>('hasInstalledAgentPlugins', false);
export const InstalledAgentPluginsViewId = 'workbench.views.agentPlugins.installed';

//#region Item model

const enum AgentPluginItemKind {
	Installed = 'installed',
	Marketplace = 'marketplace',
}

interface IInstalledPluginItem {
	readonly kind: AgentPluginItemKind.Installed;
	readonly name: string;
	readonly description: string;
	readonly marketplace?: string;
	readonly plugin: IAgentPlugin;
}

interface IMarketplacePluginItem {
	readonly kind: AgentPluginItemKind.Marketplace;
	readonly name: string;
	readonly description: string;
	readonly source: string;
	readonly marketplace: string;
	readonly marketplaceReference: IMarketplaceReference;
	readonly marketplaceType: MarketplaceType;
	readonly readmeUri?: URI;
}

type IAgentPluginItem = IInstalledPluginItem | IMarketplacePluginItem;

function installedPluginToItem(plugin: IAgentPlugin, labelService: ILabelService): IInstalledPluginItem {
	const name = basename(plugin.uri);
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
		marketplace: plugin.marketplace,
		marketplaceReference: plugin.marketplaceReference,
		marketplaceType: plugin.marketplaceType,
		readmeUri: plugin.readmeUri,
	};
}

//#endregion

//#region Actions

class InstallPluginAction extends Action {
	static readonly ID = 'agentPlugin.install';

	constructor(
		private readonly item: IMarketplacePluginItem,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
	) {
		super(InstallPluginAction.ID, localize('install', "Install"), 'extension-action label prominent install');
	}

	override async run(): Promise<void> {
		await this.pluginInstallService.installPlugin({
			name: this.item.name,
			description: this.item.description,
			version: '',
			source: this.item.source,
			marketplace: this.item.marketplace,
			marketplaceReference: this.item.marketplaceReference,
			marketplaceType: this.item.marketplaceType,
			readmeUri: this.item.readmeUri,
		});
	}
}

class EnablePluginAction extends Action {
	static readonly ID = 'agentPlugin.enable';

	constructor(
		private readonly plugin: IAgentPlugin,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
	) {
		super(EnablePluginAction.ID, localize('enable', "Enable"));
	}

	override async run(): Promise<void> {
		this.agentPluginService.setPluginEnabled(this.plugin.uri, true);
	}
}

class DisablePluginAction extends Action {
	static readonly ID = 'agentPlugin.disable';

	constructor(
		private readonly plugin: IAgentPlugin,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
	) {
		super(DisablePluginAction.ID, localize('disable', "Disable"));
	}

	override async run(): Promise<void> {
		this.agentPluginService.setPluginEnabled(this.plugin.uri, false);
	}
}

class UninstallPluginAction extends Action {
	static readonly ID = 'agentPlugin.uninstall';

	constructor(
		private readonly plugin: IAgentPlugin,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
	) {
		super(UninstallPluginAction.ID, localize('uninstall', "Uninstall"));
	}

	override async run(): Promise<void> {
		this.pluginInstallService.uninstallPlugin(this.plugin.uri);
	}
}

class OpenPluginFolderAction extends Action {
	static readonly ID = 'agentPlugin.openFolder';

	constructor(
		private readonly plugin: IAgentPlugin,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super(OpenPluginFolderAction.ID, localize('openPluginFolder', "Open Plugin Folder"));
	}

	override async run(): Promise<void> {
		try {
			await this.commandService.executeCommand('revealFileInOS', this.plugin.uri);
		} catch {
			// Fallback for web where 'revealFileInOS' is not available
			await this.openerService.open(dirname(this.plugin.uri));
		}
	}
}

class OpenPluginReadmeAction extends Action {
	static readonly ID = 'agentPlugin.openReadme';

	constructor(
		private readonly readmeUri: URI,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super(OpenPluginReadmeAction.ID, localize('openReadme', "Open README"));
	}

	override async run(): Promise<void> {
		await this.openerService.open(this.readmeUri);
	}
}

//#endregion

//#region Renderer

interface IAgentPluginTemplateData {
	root: HTMLElement;
	name: HTMLElement;
	description: HTMLElement;
	detail: HTMLElement;
	actionbar: ActionBar;
	disposables: IDisposable[];
	elementDisposables: IDisposable[];
}

class AgentPluginRenderer implements IPagedRenderer<IAgentPluginItem, IAgentPluginTemplateData> {

	static readonly templateId = 'agentPlugin';
	readonly templateId = AgentPluginRenderer.templateId;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(root: HTMLElement): IAgentPluginTemplateData {
		const element = dom.append(root, dom.$('.agent-plugin-item.extension-list-item'));
		const details = dom.append(element, dom.$('.details'));
		const headerContainer = dom.append(details, dom.$('.header-container'));
		const header = dom.append(headerContainer, dom.$('.header'));
		const name = dom.append(header, dom.$('span.name'));
		const description = dom.append(details, dom.$('.description.ellipsis'));
		const footer = dom.append(details, dom.$('.footer'));
		const detailContainer = dom.append(footer, dom.$('.publisher-container'));
		const detail = dom.append(detailContainer, dom.$('span.publisher-name'));
		const actionbar = new ActionBar(footer, { focusOnlyEnabledItems: true });
		actionbar.setFocusable(false);
		return { root, name, description, detail, actionbar, disposables: [actionbar], elementDisposables: [] };
	}

	renderPlaceholder(_index: number, data: IAgentPluginTemplateData): void {
		data.name.textContent = '';
		data.description.textContent = '';
		data.detail.textContent = '';
		data.actionbar.clear();
		this.disposeElement(undefined, 0, data);
	}

	renderElement(element: IAgentPluginItem, _index: number, data: IAgentPluginTemplateData): void {
		this.disposeElement(undefined, 0, data);

		data.name.textContent = element.name;
		data.description.textContent = element.description;

		data.elementDisposables.push(autorun(reader => {
			data.root.classList.toggle('disabled', element.kind === AgentPluginItemKind.Installed && !element.plugin.enabled.read(reader));
		}));

		data.actionbar.clear();
		if (element.kind === AgentPluginItemKind.Marketplace) {
			data.detail.textContent = element.marketplace;
			const installAction = this.instantiationService.createInstance(InstallPluginAction, element);
			data.elementDisposables.push(installAction);
			data.actionbar.push([installAction], { icon: true, label: true });
		} else {
			data.detail.textContent = element.marketplace ?? '';
		}
	}

	disposeElement(_element: IAgentPluginItem | undefined, _index: number, data: IAgentPluginTemplateData): void {
		for (const d of data.elementDisposables) {
			d.dispose();
		}
		data.elementDisposables = [];
	}

	disposeTemplate(data: IAgentPluginTemplateData): void {
		for (const d of data.disposables) {
			d.dispose();
		}
		this.disposeElement(undefined, 0, data);
	}
}

//#endregion

//#region List View

interface IAgentPluginsListViewOptions {
	installedOnly?: boolean;
}

export class AgentPluginsListView extends AbstractExtensionsListView<IAgentPluginItem> {

	private readonly actionStore = this._register(new DisposableStore());
	private readonly queryCts = new MutableDisposable<CancellationTokenSource>();
	private list: WorkbenchPagedList<IAgentPluginItem> | null = null;
	private listContainer: HTMLElement | null = null;
	private currentQuery = '@agentPlugins';
	private readonly refreshOnPluginsChangedScheduler = this._register(new RunOnceScheduler(() => {
		if (this.list) {
			void this.show(this.currentQuery);
		}
	}, 0));
	private bodyTemplate: {
		messageContainer: HTMLElement;
		messageBox: HTMLElement;
		pluginsList: HTMLElement;
	} | undefined;

	constructor(
		private readonly listOptions: IAgentPluginsListViewOptions,
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(autorun(reader => {
			this.agentPluginService.plugins.read(reader);
			if (this.list && this.isBodyVisible()) {
				this.refreshOnPluginsChangedScheduler.schedule();
			}
		}));

		this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
			if (this.list && this.isBodyVisible()) {
				this.refreshOnPluginsChangedScheduler.schedule();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const messageContainer = dom.append(container, dom.$('.message-container'));
		const messageBox = dom.append(messageContainer, dom.$('.message'));
		const pluginsList = dom.$('.agent-plugins-list');

		this.bodyTemplate = { pluginsList, messageBox, messageContainer };

		this.listContainer = dom.append(container, pluginsList);
		this.list = this._register(this.instantiationService.createInstance(WorkbenchPagedList,
			`${this.id}-Agent-Plugins`,
			this.listContainer,
			{
				getHeight() { return 72; },
				getTemplateId: () => AgentPluginRenderer.templateId,
			},
			[this.instantiationService.createInstance(AgentPluginRenderer)],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(item: IAgentPluginItem | null): string {
						return item?.name ?? '';
					},
					getWidgetAriaLabel(): string {
						return localize('agentPlugins', "Agent Plugins");
					}
				},
				overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles,
			}) as WorkbenchPagedList<IAgentPluginItem>);

		this._register(this.list.onContextMenu(e => this.onContextMenu(e), this));
	}

	private onContextMenu(e: IListContextMenuEvent<IAgentPluginItem>): void {
		if (!e.element) {
			return;
		}

		const actions = this.getContextMenuActions(e.element);
		if (actions.length === 0) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
		});
	}

	private getContextMenuActions(item: IAgentPluginItem): IAction[] {
		const actions: IAction[] = [];
		if (item.kind === AgentPluginItemKind.Installed) {
			if (item.plugin.enabled.get()) {
				actions.push(this.instantiationService.createInstance(DisablePluginAction, item.plugin));
			} else {
				actions.push(this.instantiationService.createInstance(EnablePluginAction, item.plugin));
			}

			actions.push(new Separator());
			actions.push(this.instantiationService.createInstance(OpenPluginFolderAction, item.plugin));
			actions.push(this.instantiationService.createInstance(OpenPluginReadmeAction, joinPath(item.plugin.uri, 'README.md')));
			actions.push(new Separator());
			actions.push(this.instantiationService.createInstance(UninstallPluginAction, item.plugin));
		} else {
			if (item.readmeUri) {
				actions.push(this.instantiationService.createInstance(OpenPluginReadmeAction, item.readmeUri));
			}
			actions.push(this.instantiationService.createInstance(InstallPluginAction, item));
		}

		this.actionStore.clear();
		for (const action of actions) {
			if (isDisposable(action)) {
				this.actionStore.add(action);
			}
		}

		return actions;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.list?.layout(height, width);
	}

	async show(query: string): Promise<IPagedModel<IAgentPluginItem>> {
		this.currentQuery = query;
		const text = query.replace(/@agentPlugins/i, '').trim().toLowerCase();

		let installed = this.queryInstalled();
		if (text) {
			installed = installed.filter(p =>
				p.name.toLowerCase().includes(text) ||
				p.description.toLowerCase().includes(text)
			);
		}

		let items: IAgentPluginItem[] = installed;

		if (!this.listOptions.installedOnly) {
			const marketplace = await this.queryMarketplace(text);

			// Filter out marketplace items that are already installed
			const installedPaths = new Set(installed.map(i => i.plugin.uri.toString()));
			const filteredMarketplace = marketplace.filter(m => {
				const expectedUri = this.pluginInstallService.getPluginInstallUri({
					name: m.name,
					description: m.description,
					version: '',
					source: m.source,
					marketplace: m.marketplace,
					marketplaceReference: m.marketplaceReference,
					marketplaceType: m.marketplaceType,
				});
				return !installedPaths.has(expectedUri.toString());
			});

			items = [...installed, ...filteredMarketplace];
		}

		const model = new PagedModel(items);
		if (this.list) {
			this.list.model = model;
		}
		this.updateBody(model.length);
		return model;
	}

	private queryInstalled(): IInstalledPluginItem[] {
		const allPlugins = this.agentPluginService.allPlugins.get();
		return allPlugins.map(p => installedPluginToItem(p, this.labelService));
	}

	private async queryMarketplace(text: string): Promise<IMarketplacePluginItem[]> {
		this.queryCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this.queryCts.value = cts;

		try {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
			const lowerText = text.toLowerCase();
			return plugins
				.filter(p => p.name.toLowerCase().includes(lowerText) || p.description.toLowerCase().includes(lowerText))
				.map(marketplacePluginToItem);
		} catch {
			return [];
		}
	}

	private updateBody(count: number): void {
		if (this.bodyTemplate) {
			this.bodyTemplate.pluginsList.classList.toggle('hidden', count === 0);
			this.bodyTemplate.messageContainer.classList.toggle('hidden', count > 0);
			if (count === 0 && this.isBodyVisible()) {
				this.bodyTemplate.messageBox.textContent = localize('noAgentPlugins', "No agent plugins found.");
			}
		}
	}
}

//#endregion

//#region Browse command

class AgentPluginsBrowseCommand extends Action2 {
	constructor() {
		super({
			id: 'workbench.agentPlugins.browse',
			title: localize2('agentPlugins.browse', "Agent Plugins"),
			tooltip: localize2('agentPlugins.browse.tooltip', "Browse Agent Plugins"),
			icon: Codicon.search,
			precondition: ChatContextKeys.Setup.hidden.negate(),
			menu: [{
				id: extensionsFilterSubMenu,
				group: '1_predefined',
				order: 2,
				when: ChatContextKeys.Setup.hidden.negate(),
			}, {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', InstalledAgentPluginsViewId), ChatContextKeys.Setup.hidden.negate()),
				group: 'navigation',
			}],
		});
	}

	async run(accessor: ServicesAccessor) {
		accessor.get(IExtensionsWorkbenchService).openSearch('@agentPlugins ');
	}
}

//#endregion
//#region Views contribution

export class AgentPluginsViewsContribution extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.chat.agentPlugins.views.contribution';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAgentPluginService agentPluginService: IAgentPluginService,
	) {
		super();

		const hasInstalledKey = HasInstalledAgentPluginsContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			hasInstalledKey.set(agentPluginService.allPlugins.read(reader).length > 0);
		}));

		registerAction2(AgentPluginsBrowseCommand);

		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
			{
				id: InstalledAgentPluginsViewId,
				name: localize2('agent-plugins-installed', "Agent Plugins - Installed"),
				ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{ installedOnly: true }]),
				when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledAgentPluginsContext, ChatContextKeys.Setup.hidden.negate()),
				weight: 30,
				order: 5,
				canToggleVisibility: true,
			},
			{
				id: 'workbench.views.agentPlugins.default.marketplace',
				name: localize2('agent-plugins', "Agent Plugins"),
				ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{}]),
				when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledAgentPluginsContext.toNegated(), ChatContextKeys.Setup.hidden.negate()),
				weight: 30,
				order: 5,
				canToggleVisibility: true,
				hideByDefault: true,
			},
			{
				id: 'workbench.views.agentPlugins.marketplace',
				name: localize2('agent-plugins', "Agent Plugins"),
				ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{}]),
				when: ContextKeyExpr.and(SearchAgentPluginsContext, ChatContextKeys.Setup.hidden.negate()),
			},
		], VIEW_CONTAINER);
	}
}

//#endregion
