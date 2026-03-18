/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IListContextMenuEvent } from '../../../../base/browser/ui/list/list.js';
import { IPagedRenderer } from '../../../../base/browser/ui/list/listPaging.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, disposeIfDisposable, IDisposable, isDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { autorun, derived, IObservable, IReaderWithStore } from '../../../../base/common/observable.js';
import { IPagedModel, PagedModel } from '../../../../base/common/paging.js';
import { dirname } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchPagedList } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewDescriptorService, IViewsRegistry, Extensions as ViewExtensions } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { manageExtensionIcon } from '../../extensions/browser/extensionsIcons.js';
import { AbstractExtensionsListView } from '../../extensions/browser/extensionsViews.js';
import { DefaultViewsContext, extensionsFilterSubMenu, IExtensionsWorkbenchService, SearchAgentPluginsContext } from '../../extensions/common/extensions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IAgentPlugin, IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../common/enablement.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { hasSourceChanged, IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';
import { AgentPluginEditorInput } from './agentPluginEditor/agentPluginEditorInput.js';
import { AgentPluginItemKind, IAgentPluginItem, IInstalledPluginItem, IMarketplacePluginItem } from './agentPluginEditor/agentPluginItems.js';
import { getInstalledPluginContextMenuActions, InstallPluginAction, OpenPluginReadmeAction } from './agentPluginActions.js';

export const HasInstalledAgentPluginsContext = new RawContextKey<boolean>('hasInstalledAgentPlugins', false);
export const InstalledAgentPluginsViewId = 'workbench.views.agentPlugins.installed';

//#region Item model

function installedPluginToItem(plugin: IAgentPlugin, labelService: ILabelService, outdated?: IObservable<IMarketplacePlugin | undefined>): IInstalledPluginItem {
	const name = plugin.label;
	const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
	const marketplace = plugin.fromMarketplace?.marketplace;
	return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin, outdated };
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

//#region Actions

//#region Actions

class UpdatePluginAction extends Action {
	static readonly ID = 'agentPlugin.update';

	constructor(
		private readonly plugin: IAgentPlugin,
		private readonly liveMarketplacePlugin: IMarketplacePlugin,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
	) {
		super(UpdatePluginAction.ID, localize('update', "Update"), 'extension-action label prominent install');
	}

	override async run(): Promise<void> {
		if (await this.pluginInstallService.updatePlugin(this.liveMarketplacePlugin)) {
			this.pluginMarketplaceService.addInstalledPlugin(this.plugin.uri, this.liveMarketplacePlugin);
		}
	}
}

class ManagePluginAction extends Action {
	static readonly ID = 'agentPlugin.manage';
	static readonly CLASS = `extension-action icon manage ${ThemeIcon.asClassName(manageExtensionIcon)}`;

	private _actionViewItem: DropDownActionViewItem | null = null;

	constructor(
		private readonly getActionGroups: () => IAction[][],
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(ManagePluginAction.ID, '', ManagePluginAction.CLASS, true);
		this.tooltip = localize('manage', "Manage");
	}

	createActionViewItem(options: IActionViewItemOptions): DropDownActionViewItem {
		this._actionViewItem = this.instantiationService.createInstance(DropDownActionViewItem, this, options);
		return this._actionViewItem;
	}

	override async run(): Promise<void> {
		this._actionViewItem?.showMenu(this.getActionGroups());
	}
}

class DropDownActionViewItem extends ActionViewItem {
	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super(null, action, { ...options, icon: true, label: false });
	}

	showMenu(actionGroups: IAction[][]): void {
		if (!this.element) {
			return;
		}
		const actions = actionGroups.flatMap(group => [...group, new Separator()]);
		if (actions.length > 0) {
			actions.pop();
		}
		const { left, top, height } = dom.getDomNodePagePosition(this.element);
		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: left, y: top + height + 10 }),
			getActions: () => actions,
			onHide: () => disposeIfDisposable(actions),
		});
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
		const actionbar = new ActionBar(footer, {
			focusOnlyEnabledItems: true,
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action instanceof ManagePluginAction) {
					return action.createActionViewItem(options);
				}
				return undefined;
			}
		});
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
			data.root.classList.toggle('disabled', element.kind === AgentPluginItemKind.Installed && !isContributionEnabled(element.plugin.enablement.read(reader)));
		}));

		const updateActions = (reader: IReaderWithStore) => {
			data.actionbar.clear();
			if (element.kind === AgentPluginItemKind.Marketplace) {
				data.detail.textContent = element.marketplace;
				const installAction = this.instantiationService.createInstance(InstallPluginAction, element);
				reader.store.add(installAction);
				data.actionbar.push([installAction], { icon: true, label: true });
			} else {
				data.detail.textContent = element.marketplace ?? '';
				const actions: Action[] = [];
				const livePlugin = element.outdated?.read(reader);
				if (livePlugin) {
					const updateAction = this.instantiationService.createInstance(UpdatePluginAction, element.plugin, livePlugin);
					reader.store.add(updateAction);
					actions.push(updateAction);
				}
				const manageAction = this.instantiationService.createInstance(ManagePluginAction,
					() => getInstalledPluginContextMenuActions(element.plugin, this.instantiationService));
				reader.store.add(manageAction);
				actions.push(manageAction);
				data.actionbar.push(actions, { icon: true, label: true });
			}
		};

		data.elementDisposables.push(autorun(updateActions));
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
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(autorun(reader => {
			const plugins = this.agentPluginService.plugins.read(reader);
			for (const plugin of plugins) {
				plugin.enablement.read(reader);
			}
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

		this._register(Event.debounce(Event.filter(this.list.onDidOpen, e => e.element !== null), (_, event) => event, 75, true)(options => {
			this.editorService.openEditor(
				this.instantiationService.createInstance(AgentPluginEditorInput, options.element!),
				options.editorOptions
			);
		}));
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
		let actions: IAction[];
		if (item.kind === AgentPluginItemKind.Installed) {
			const groups = getInstalledPluginContextMenuActions(item.plugin, this.instantiationService);
			actions = groups.flatMap(group => [...group, new Separator()]);
			if (actions.length > 0) {
				actions.pop();
			}
		} else {
			actions = [];
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
		const stripped = query.replace(/@agentPlugins/i, '').trim();
		const isRecommended = /^@recommended$/i.test(stripped);
		const isInstalled = /(?:^|\s)@installed(?:\s|$)/i.test(stripped);
		const text = isRecommended ? '' : stripped.replace(/(?:^|\s)@installed(?:\s|$)/gi, ' ').trim().toLowerCase();

		let installed = this.queryInstalled();
		if (text) {
			installed = installed.filter(p =>
				p.name.toLowerCase().includes(text) ||
				p.description.toLowerCase().includes(text) ||
				(p.marketplace ?? '').toLowerCase().includes(text)
			);
		}

		// When @recommended, filter to plugins listed in workspace recommendations.
		if (isRecommended) {
			const recommended = this.pluginMarketplaceService.recommendedPlugins.get();
			installed = installed.filter(p => {
				const marketplace = p.plugin.fromMarketplace;
				if (!marketplace) {
					return false;
				}
				const key = `${marketplace.name}@${marketplace.marketplace}`;
				return recommended.has(key);
			});
		}

		let items: IAgentPluginItem[] = installed;

		if (!this.listOptions.installedOnly && !isInstalled) {
			const marketplacePlugins = await this.queryMarketplacePlugins();
			let filteredMp = marketplacePlugins;

			if (isRecommended) {
				// When @recommended, filter marketplace plugins to those in recommendations.
				const recommended = this.pluginMarketplaceService.recommendedPlugins.get();
				filteredMp = filteredMp.filter(p => {
					const key = `${p.name}@${p.marketplace}`;
					return recommended.has(key);
				});
			} else {
				const lowerText = text.toLowerCase();
				filteredMp = filteredMp.filter(p => p.name.toLowerCase().includes(lowerText) || p.description.toLowerCase().includes(lowerText) || p.marketplace.toLowerCase().includes(lowerText));
			}

			const marketplace = filteredMp.map(marketplacePluginToItem);

			// Filter out marketplace items that are already installed
			const installedPaths = new Set(installed.map(i => i.plugin.uri.toString()));
			const filteredMarketplace = marketplace.filter(m => {
				const expectedUri = this.pluginInstallService.getPluginInstallUri({
					name: m.name,
					description: m.description,
					version: '',
					source: m.source,
					sourceDescriptor: m.sourceDescriptor,
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

	/**
	 * Builds the installed plugin list using only cached marketplace data
	 * (no IO). The cached data is populated by {@link fetchMarketplacePlugins}
	 * and exposed via the {@link IPluginMarketplaceService.lastFetchedPlugins}
	 * observable, which the view's autorun subscribes to for reactivity.
	 */
	private queryInstalled(): IInstalledPluginItem[] {
		const marketplaceObs = derived(reader => {
			const cachedMarketplace = this.pluginMarketplaceService.lastFetchedPlugins.read(reader);
			const marketplaceByKey = new Map<string, IMarketplacePlugin>();
			for (const mp of cachedMarketplace) {
				marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
			}


			// Read fresh installed plugin metadata from the store (not from
			// IAgentPlugin.fromMarketplace which may be stale after an update).
			const installedByUri = new Map<string, IMarketplacePlugin>();
			for (const entry of this.pluginMarketplaceService.installedPlugins.read(reader)) {
				installedByUri.set(entry.pluginUri.toString(), entry.plugin);
			}

			return { marketplaceByKey, installedByUri };
		});


		const plugins = this.agentPluginService.plugins.get();
		return plugins.map(p => {
			const isOutdated = derived(reader => {
				const { marketplaceByKey, installedByUri } = marketplaceObs.read(reader);
				const storedPlugin = installedByUri.get(p.uri.toString()) ?? p.fromMarketplace;
				if (storedPlugin) {
					const key = `${storedPlugin.marketplaceReference.canonicalId}::${storedPlugin.name}`;
					const live = marketplaceByKey.get(key);
					if (live && hasSourceChanged(storedPlugin.sourceDescriptor, live.sourceDescriptor)) {
						return live;
					}
				}

				return undefined;
			});
			return installedPluginToItem(p, this.labelService, isOutdated);
		});
	}

	private async queryMarketplacePlugins(): Promise<IMarketplacePlugin[]> {
		this.queryCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this.queryCts.value = cts;

		try {
			return await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
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

class CheckForPluginUpdatesCommand extends Action2 {
	constructor() {
		super({
			id: 'workbench.agentPlugins.checkForUpdates',
			title: localize2('agentPlugins.checkForUpdates', "Update Plugins"),
			category: localize2('chat.category', "Chat"),
			precondition: ChatContextKeys.enabled,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		await accessor.get(IPluginInstallService).updateAllPlugins({}, CancellationToken.None);
	}
}

class ForceUpdatePluginsCommand extends Action2 {
	constructor() {
		super({
			id: 'workbench.agentPlugins.forceUpdate',
			title: localize2('agentPlugins.forceUpdate', "Update Plugins (Force)"),
			category: localize2('chat.category', "Chat"),
			precondition: ChatContextKeys.enabled,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		await accessor.get(IPluginInstallService).updateAllPlugins({ force: true }, CancellationToken.None);
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
			hasInstalledKey.set(agentPluginService.plugins.read(reader).length > 0);
		}));

		registerAction2(AgentPluginsBrowseCommand);
		registerAction2(CheckForPluginUpdatesCommand);
		registerAction2(ForceUpdatePluginsCommand);

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
