/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var UpdatePluginAction_1, ManagePluginAction_1, AgentPluginRenderer_1;
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, disposeIfDisposable, isDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { PagedModel } from '../../../../base/common/paging.js';
import { dirname } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchPagedList } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService, Extensions as ViewExtensions } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { manageExtensionIcon } from '../../extensions/browser/extensionsIcons.js';
import { AbstractExtensionsListView } from '../../extensions/browser/extensionsViews.js';
import { DefaultViewsContext, extensionsFilterSubMenu, IExtensionsWorkbenchService, SearchAgentPluginsContext } from '../../extensions/common/extensions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../common/enablement.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { hasSourceChanged, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';
import { AgentPluginEditorInput } from './agentPluginEditor/agentPluginEditorInput.js';
import { getInstalledPluginContextMenuActions, InstallPluginAction, OpenPluginReadmeAction } from './agentPluginActions.js';
export const HasInstalledAgentPluginsContext = new RawContextKey('hasInstalledAgentPlugins', false);
export const InstalledAgentPluginsViewId = 'workbench.views.agentPlugins.installed';
//#region Item model
function installedPluginToItem(plugin, labelService, outdated) {
    const name = plugin.label;
    const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
    const marketplace = plugin.fromMarketplace?.marketplace;
    return { kind: "installed" /* AgentPluginItemKind.Installed */, name, description, marketplace, plugin, outdated };
}
function marketplacePluginToItem(plugin) {
    return {
        kind: "marketplace" /* AgentPluginItemKind.Marketplace */,
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
let UpdatePluginAction = class UpdatePluginAction extends Action {
    static { UpdatePluginAction_1 = this; }
    static { this.ID = 'agentPlugin.update'; }
    constructor(plugin, liveMarketplacePlugin, pluginInstallService, pluginMarketplaceService) {
        super(UpdatePluginAction_1.ID, localize('update', "Update"), 'extension-action label prominent install');
        this.plugin = plugin;
        this.liveMarketplacePlugin = liveMarketplacePlugin;
        this.pluginInstallService = pluginInstallService;
        this.pluginMarketplaceService = pluginMarketplaceService;
    }
    async run() {
        if (await this.pluginInstallService.updatePlugin(this.liveMarketplacePlugin)) {
            this.pluginMarketplaceService.addInstalledPlugin(this.plugin.uri, this.liveMarketplacePlugin);
        }
    }
};
UpdatePluginAction = UpdatePluginAction_1 = __decorate([
    __param(2, IPluginInstallService),
    __param(3, IPluginMarketplaceService)
], UpdatePluginAction);
let ManagePluginAction = class ManagePluginAction extends Action {
    static { ManagePluginAction_1 = this; }
    static { this.ID = 'agentPlugin.manage'; }
    static { this.CLASS = `extension-action icon manage ${ThemeIcon.asClassName(manageExtensionIcon)}`; }
    constructor(getActionGroups, instantiationService) {
        super(ManagePluginAction_1.ID, '', ManagePluginAction_1.CLASS, true);
        this.getActionGroups = getActionGroups;
        this.instantiationService = instantiationService;
        this._actionViewItem = null;
        this.tooltip = localize('manage', "Manage");
    }
    createActionViewItem(options) {
        this._actionViewItem = this.instantiationService.createInstance(DropDownActionViewItem, this, options);
        return this._actionViewItem;
    }
    async run() {
        this._actionViewItem?.showMenu(this.getActionGroups());
    }
};
ManagePluginAction = ManagePluginAction_1 = __decorate([
    __param(1, IInstantiationService)
], ManagePluginAction);
let DropDownActionViewItem = class DropDownActionViewItem extends ActionViewItem {
    constructor(action, options, contextMenuService) {
        super(null, action, { ...options, icon: true, label: false });
        this.contextMenuService = contextMenuService;
    }
    showMenu(actionGroups) {
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
};
DropDownActionViewItem = __decorate([
    __param(2, IContextMenuService)
], DropDownActionViewItem);
let AgentPluginRenderer = class AgentPluginRenderer {
    static { AgentPluginRenderer_1 = this; }
    static { this.templateId = 'agentPlugin'; }
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
        this.templateId = AgentPluginRenderer_1.templateId;
    }
    renderTemplate(root) {
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
            actionViewItemProvider: (action, options) => {
                if (action instanceof ManagePluginAction) {
                    return action.createActionViewItem(options);
                }
                return undefined;
            }
        });
        actionbar.setFocusable(false);
        return { root, name, description, detail, actionbar, disposables: [actionbar], elementDisposables: [] };
    }
    renderPlaceholder(_index, data) {
        data.name.textContent = '';
        data.description.textContent = '';
        data.detail.textContent = '';
        data.actionbar.clear();
        this.disposeElement(undefined, 0, data);
    }
    renderElement(element, _index, data) {
        this.disposeElement(undefined, 0, data);
        data.name.textContent = element.name;
        data.description.textContent = element.description;
        data.elementDisposables.push(autorun(reader => {
            data.root.classList.toggle('disabled', element.kind === "installed" /* AgentPluginItemKind.Installed */ && !isContributionEnabled(element.plugin.enablement.read(reader)));
        }));
        const updateActions = (reader) => {
            data.actionbar.clear();
            if (element.kind === "marketplace" /* AgentPluginItemKind.Marketplace */) {
                data.detail.textContent = element.marketplace;
                const installAction = this.instantiationService.createInstance(InstallPluginAction, element);
                reader.store.add(installAction);
                data.actionbar.push([installAction], { icon: true, label: true });
            }
            else {
                data.detail.textContent = element.marketplace ?? '';
                const actions = [];
                const livePlugin = element.outdated?.read(reader);
                if (livePlugin) {
                    const updateAction = this.instantiationService.createInstance(UpdatePluginAction, element.plugin, livePlugin);
                    reader.store.add(updateAction);
                    actions.push(updateAction);
                }
                const manageAction = this.instantiationService.createInstance(ManagePluginAction, () => getInstalledPluginContextMenuActions(element.plugin, this.instantiationService));
                reader.store.add(manageAction);
                actions.push(manageAction);
                data.actionbar.push(actions, { icon: true, label: true });
            }
        };
        data.elementDisposables.push(autorun(updateActions));
    }
    disposeElement(_element, _index, data) {
        for (const d of data.elementDisposables) {
            d.dispose();
        }
        data.elementDisposables = [];
    }
    disposeTemplate(data) {
        for (const d of data.disposables) {
            d.dispose();
        }
        this.disposeElement(undefined, 0, data);
    }
};
AgentPluginRenderer = AgentPluginRenderer_1 = __decorate([
    __param(0, IInstantiationService)
], AgentPluginRenderer);
let AgentPluginsListView = class AgentPluginsListView extends AbstractExtensionsListView {
    constructor(listOptions, options, keybindingService, contextMenuService, instantiationService, themeService, hoverService, configurationService, contextKeyService, viewDescriptorService, openerService, agentPluginService, pluginMarketplaceService, pluginInstallService, labelService, editorService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.listOptions = listOptions;
        this.agentPluginService = agentPluginService;
        this.pluginMarketplaceService = pluginMarketplaceService;
        this.pluginInstallService = pluginInstallService;
        this.labelService = labelService;
        this.editorService = editorService;
        this.actionStore = this._register(new DisposableStore());
        this.queryCts = new MutableDisposable();
        this.list = null;
        this.listContainer = null;
        this.currentQuery = '@agentPlugins';
        this.refreshOnPluginsChangedScheduler = this._register(new RunOnceScheduler(() => {
            if (this.list) {
                void this.show(this.currentQuery);
            }
        }, 0));
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
    renderBody(container) {
        super.renderBody(container);
        const messageContainer = dom.append(container, dom.$('.message-container'));
        const messageBox = dom.append(messageContainer, dom.$('.message'));
        const pluginsList = dom.$('.agent-plugins-list');
        this.bodyTemplate = { pluginsList, messageBox, messageContainer };
        this.listContainer = dom.append(container, pluginsList);
        this.list = this._register(this.instantiationService.createInstance(WorkbenchPagedList, `${this.id}-Agent-Plugins`, this.listContainer, {
            getHeight() { return 72; },
            getTemplateId: () => AgentPluginRenderer.templateId,
        }, [this.instantiationService.createInstance(AgentPluginRenderer)], {
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel(item) {
                    return item?.name ?? '';
                },
                getWidgetAriaLabel() {
                    return localize('agentPlugins', "Agent Plugins");
                }
            },
            overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles,
        }));
        this._register(this.list.onContextMenu(e => this.onContextMenu(e), this));
        this._register(Event.debounce(Event.filter(this.list.onDidOpen, e => e.element !== null), (_, event) => event, 75, true)(options => {
            this.editorService.openEditor(this.instantiationService.createInstance(AgentPluginEditorInput, options.element), options.editorOptions);
        }));
    }
    onContextMenu(e) {
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
    getContextMenuActions(item) {
        let actions;
        if (item.kind === "installed" /* AgentPluginItemKind.Installed */) {
            const groups = getInstalledPluginContextMenuActions(item.plugin, this.instantiationService);
            actions = groups.flatMap(group => [...group, new Separator()]);
            if (actions.length > 0) {
                actions.pop();
            }
        }
        else {
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
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.list?.layout(height, width);
    }
    async show(query) {
        this.currentQuery = query;
        const stripped = query.replace(/@agentPlugins/i, '').trim();
        const isRecommended = /^@recommended$/i.test(stripped);
        const isInstalled = /(?:^|\s)@installed(?:\s|$)/i.test(stripped);
        const text = isRecommended ? '' : stripped.replace(/(?:^|\s)@installed(?:\s|$)/gi, ' ').trim().toLowerCase();
        let installed = this.queryInstalled();
        if (text) {
            installed = installed.filter(p => p.name.toLowerCase().includes(text) ||
                p.description.toLowerCase().includes(text) ||
                (p.marketplace ?? '').toLowerCase().includes(text));
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
        let items = installed;
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
            }
            else {
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
    queryInstalled() {
        const marketplaceObs = derived(reader => {
            const cachedMarketplace = this.pluginMarketplaceService.lastFetchedPlugins.read(reader);
            const marketplaceByKey = new Map();
            for (const mp of cachedMarketplace) {
                marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
            }
            // Read fresh installed plugin metadata from the store (not from
            // IAgentPlugin.fromMarketplace which may be stale after an update).
            const installedByUri = new Map();
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
    async queryMarketplacePlugins() {
        this.queryCts.value?.cancel();
        const cts = new CancellationTokenSource();
        this.queryCts.value = cts;
        try {
            return await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
        }
        catch {
            return [];
        }
    }
    updateBody(count) {
        if (this.bodyTemplate) {
            this.bodyTemplate.pluginsList.classList.toggle('hidden', count === 0);
            this.bodyTemplate.messageContainer.classList.toggle('hidden', count > 0);
            if (count === 0 && this.isBodyVisible()) {
                this.bodyTemplate.messageBox.textContent = localize('noAgentPlugins', "No agent plugins found.");
            }
        }
    }
};
AgentPluginsListView = __decorate([
    __param(2, IKeybindingService),
    __param(3, IContextMenuService),
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IHoverService),
    __param(7, IConfigurationService),
    __param(8, IContextKeyService),
    __param(9, IViewDescriptorService),
    __param(10, IOpenerService),
    __param(11, IAgentPluginService),
    __param(12, IPluginMarketplaceService),
    __param(13, IPluginInstallService),
    __param(14, ILabelService),
    __param(15, IEditorService)
], AgentPluginsListView);
export { AgentPluginsListView };
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
    async run(accessor) {
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
    async run(accessor) {
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
    async run(accessor) {
        await accessor.get(IPluginInstallService).updateAllPlugins({ force: true }, CancellationToken.None);
    }
}
//#endregion
//#region Views contribution
let AgentPluginsViewsContribution = class AgentPluginsViewsContribution extends Disposable {
    static { this.ID = 'workbench.chat.agentPlugins.views.contribution'; }
    constructor(contextKeyService, agentPluginService) {
        super();
        const hasInstalledKey = HasInstalledAgentPluginsContext.bindTo(contextKeyService);
        this._register(autorun(reader => {
            hasInstalledKey.set(agentPluginService.plugins.read(reader).length > 0);
        }));
        registerAction2(AgentPluginsBrowseCommand);
        registerAction2(CheckForPluginUpdatesCommand);
        registerAction2(ForceUpdatePluginsCommand);
        Registry.as(ViewExtensions.ViewsRegistry).registerViews([
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
};
AgentPluginsViewsContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, IAgentPluginService)
], AgentPluginsViewsContribution);
export { AgentPluginsViewsContribution };
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5zVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFBsdWdpbnNWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsY0FBYyxFQUEwQixNQUFNLDBEQUEwRCxDQUFDO0FBR2xILE9BQU8sRUFBRSxNQUFNLEVBQVcsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxtQkFBbUIsRUFBZSxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0SixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQWlDLE1BQU0sdUNBQXVDLENBQUM7QUFDeEcsT0FBTyxFQUFlLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFD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