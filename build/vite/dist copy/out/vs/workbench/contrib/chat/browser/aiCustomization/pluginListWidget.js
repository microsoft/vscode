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
import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, isDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Separator } from '../../../../../base/common/actions.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../common/enablement.js';
import { getInstalledPluginContextMenuActions } from '../agentPluginActions.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { pluginIcon } from './aiCustomizationIcons.js';
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from './customizationGroupHeaderRenderer.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
const $ = DOM.$;
const PLUGIN_ITEM_HEIGHT = 36;
//#endregion
//#region Delegate
class PluginItemDelegate {
    getHeight(element) {
        if (element.type === 'group-header') {
            return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
        }
        if (element.type === 'marketplace-item') {
            return 62;
        }
        return PLUGIN_ITEM_HEIGHT;
    }
    getTemplateId(element) {
        if (element.type === 'group-header') {
            return 'pluginGroupHeader';
        }
        if (element.type === 'marketplace-item') {
            return 'pluginMarketplaceItem';
        }
        return 'pluginInstalledItem';
    }
}
class PluginInstalledItemRenderer {
    constructor(_harnessService) {
        this._harnessService = _harnessService;
        this.templateId = 'pluginInstalledItem';
    }
    renderTemplate(container) {
        container.classList.add('mcp-server-item');
        const syncCheckboxContainer = DOM.append(container, $('.item-sync-checkbox'));
        const typeIcon = DOM.append(container, $('.mcp-server-icon'));
        typeIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
        const details = DOM.append(container, $('.mcp-server-details'));
        const name = DOM.append(details, $('.mcp-server-name'));
        const description = DOM.append(details, $('.mcp-server-description'));
        const status = DOM.append(container, $('.mcp-server-status'));
        return { container, syncCheckboxContainer, typeIcon, name, description, status, disposables: new DisposableStore() };
    }
    renderElement(element, _index, templateData) {
        templateData.disposables.clear();
        templateData.name.textContent = formatDisplayName(element.item.name);
        if (element.item.description) {
            templateData.description.textContent = truncateToFirstLine(element.item.description);
            templateData.description.style.display = '';
        }
        else {
            templateData.description.style.display = 'none';
        }
        // Show enabled/disabled status
        templateData.disposables.add(autorun(reader => {
            const enabled = isContributionEnabled(element.item.plugin.enablement.read(reader));
            templateData.container.classList.toggle('disabled', !enabled);
            templateData.status.className = 'mcp-server-status';
            if (enabled) {
                templateData.status.textContent = localize('enabled', "Enabled");
                templateData.status.classList.add('running');
            }
            else {
                templateData.status.textContent = localize('disabled', "Disabled");
                templateData.status.classList.add('disabled');
            }
        }));
        // Sync checkbox: shown when the active harness has a sync provider
        const syncProvider = this._harnessService.getActiveDescriptor().syncProvider;
        if (syncProvider) {
            templateData.syncCheckboxContainer.style.display = '';
            const pluginUri = element.item.plugin.uri;
            const synced = syncProvider.isSelected(pluginUri);
            const title = synced
                ? localize('unsyncPlugin', "Remove {0} from sync", element.item.name)
                : localize('syncPlugin', "Add {0} to sync", element.item.name);
            const checkbox = templateData.disposables.add(new Checkbox(title, synced, defaultCheckboxStyles));
            templateData.syncCheckboxContainer.replaceChildren(checkbox.domNode);
            templateData.disposables.add(checkbox.onChange(() => {
                syncProvider.toggleUri(pluginUri);
            }));
        }
        else {
            templateData.syncCheckboxContainer.style.display = 'none';
            templateData.syncCheckboxContainer.replaceChildren();
        }
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
}
class PluginMarketplaceItemRenderer {
    constructor(pluginInstallService) {
        this.pluginInstallService = pluginInstallService;
        this.templateId = 'pluginMarketplaceItem';
    }
    renderTemplate(container) {
        container.classList.add('mcp-server-item', 'mcp-gallery-item', 'extension-list-item');
        const details = DOM.append(container, $('.details'));
        const headerContainer = DOM.append(details, $('.header-container'));
        const header = DOM.append(headerContainer, $('.header'));
        const name = DOM.append(header, $('span.name'));
        const description = DOM.append(details, $('.description.ellipsis'));
        const footer = DOM.append(details, $('.footer'));
        const publisherContainer = DOM.append(footer, $('.publisher-container'));
        const publisher = DOM.append(publisherContainer, $('span.publisher-name'));
        const actionContainer = DOM.append(footer, $('.mcp-gallery-action'));
        const installButton = new Button(actionContainer, { ...defaultButtonStyles, supportIcons: true });
        installButton.element.classList.add('mcp-gallery-install-button');
        const templateDisposables = new DisposableStore();
        templateDisposables.add(installButton);
        return { container, name, publisher, description, installButton, elementDisposables: new DisposableStore(), templateDisposables };
    }
    renderElement(element, _index, templateData) {
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
            }
            catch (_e) {
                templateData.installButton.label = localize('install', "Install");
                templateData.installButton.enabled = true;
            }
        }));
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.templateDisposables.dispose();
    }
}
//#endregion
//#region Helpers
function installedPluginToItem(plugin, labelService) {
    const name = plugin.label ?? basename(plugin.uri);
    const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
    const marketplace = plugin.fromMarketplace?.marketplace;
    return { kind: "installed" /* AgentPluginItemKind.Installed */, name, description, marketplace, plugin };
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
/**
 * Widget that displays a list of agent plugins with marketplace browsing.
 * Follows the same patterns as {@link McpListWidget}.
 */
let PluginListWidget = class PluginListWidget extends Disposable {
    constructor(instantiationService, agentPluginService, pluginMarketplaceService, pluginInstallService, openerService, contextViewService, contextMenuService, hoverService, labelService, commandService, harnessService) {
        super();
        this.instantiationService = instantiationService;
        this.agentPluginService = agentPluginService;
        this.pluginMarketplaceService = pluginMarketplaceService;
        this.pluginInstallService = pluginInstallService;
        this.openerService = openerService;
        this.contextViewService = contextViewService;
        this.contextMenuService = contextMenuService;
        this.hoverService = hoverService;
        this.labelService = labelService;
        this.commandService = commandService;
        this.harnessService = harnessService;
        this._onDidSelectPlugin = this._register(new Emitter());
        this.onDidSelectPlugin = this._onDidSelectPlugin.event;
        this._onDidChangeItemCount = this._register(new Emitter());
        this.onDidChangeItemCount = this._onDidChangeItemCount.event;
        this.installedItems = [];
        this.displayEntries = [];
        this.marketplaceItems = [];
        this.searchQuery = '';
        this.browseMode = false;
        this.lastHeight = 0;
        this.lastWidth = 0;
        this.collapsedGroups = new Set();
        this.delayedFilter = new Delayer(200);
        this.delayedMarketplaceSearch = new Delayer(400);
        this.element = $('.mcp-list-widget'); // reuse MCP list widget CSS
        this.create();
        this._register({
            dispose: () => {
                this.marketplaceCts?.dispose();
            }
        });
    }
    create() {
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
            }
            else {
                this.delayedFilter.trigger(() => this.filterPlugins());
            }
        }));
        // Button container (Browse Marketplace + Install from Source)
        const buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));
        const browseButtonContainer = DOM.append(buttonContainer, $('.list-add-button-container'));
        this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
        this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
        this.browseButton.element.classList.add('list-add-button');
        this._register(this.browseButton.onDidClick(() => {
            this.toggleBrowseMode(!this.browseMode);
        }));
        const installFromSourceButton = this._register(new Button(buttonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
        installFromSourceButton.label = `$(${Codicon.add.id})`;
        installFromSourceButton.setTitle(localize('installFromSource', "Install Plugin from Source"));
        installFromSourceButton.element.classList.add('list-icon-button');
        this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), installFromSourceButton.element, localize('installFromSourceTooltip', "Install Plugin from Source")));
        this._register(installFromSourceButton.onDidClick(() => {
            this.commandService.executeCommand('workbench.action.chat.installPluginFromSource');
        }));
        const createPluginButton = this._register(new Button(buttonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
        createPluginButton.label = `$(${Codicon.save.id})`;
        createPluginButton.setTitle(localize('createPlugin', "Create Plugin"));
        createPluginButton.element.classList.add('list-icon-button');
        this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), createPluginButton.element, localize('createPluginTooltip', "Create Plugin")));
        this._register(createPluginButton.onDidClick(() => {
            this.commandService.executeCommand('workbench.action.chat.createPlugin');
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
        this._register(DOM.addDisposableListener(this.backLink, 'keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggleBrowseMode(false);
            }
        }));
        this.backLink.style.display = 'none';
        // Empty state
        this.emptyContainer = DOM.append(this.element, $('.mcp-empty-state'));
        const emptyHeader = DOM.append(this.emptyContainer, $('.empty-state-header'));
        const emptyIcon = DOM.append(emptyHeader, $('.empty-icon'));
        emptyIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
        this.emptyText = DOM.append(emptyHeader, $('.empty-text'));
        this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));
        // List container
        this.listContainer = DOM.append(this.element, $('.mcp-list-container'));
        // Section footer
        this.sectionHeader = DOM.append(this.element, $('.section-footer'));
        this.sectionDescription = DOM.append(this.sectionHeader, $('p.section-footer-description'));
        this.sectionDescription.textContent = localize('pluginsDescription', "Extend your AI agent with plugins that add commands, skills, agents, hooks, and MCP servers from reusable packages.");
        this.sectionLink = DOM.append(this.sectionHeader, $('a.section-footer-link'));
        this.sectionLink.textContent = localize('learnMorePlugins', "Learn more about agent plugins");
        this.sectionLink.href = 'https://code.visualstudio.com/docs/copilot/customization/agent-plugins';
        this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
            e.preventDefault();
            const href = this.sectionLink.href;
            if (href) {
                this.openerService.open(URI.parse(href));
            }
        }));
        // Create list
        const delegate = new PluginItemDelegate();
        const groupHeaderRenderer = new CustomizationGroupHeaderRenderer('pluginGroupHeader', this.hoverService);
        const installedRenderer = new PluginInstalledItemRenderer(this.harnessService);
        const marketplaceRenderer = new PluginMarketplaceItemRenderer(this.pluginInstallService);
        this.list = this._register(this.instantiationService.createInstance((WorkbenchList), 'PluginManagementList', this.listContainer, delegate, [groupHeaderRenderer, installedRenderer, marketplaceRenderer], {
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel(element) {
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
                getId(element) {
                    if (element.type === 'group-header') {
                        return element.id;
                    }
                    if (element.type === 'marketplace-item') {
                        return `marketplace-${element.item.marketplaceReference.canonicalId}/${element.item.source}`;
                    }
                    return element.item.plugin.uri.toString();
                }
            }
        }));
        this._register(this.list.onDidOpen(e => {
            if (e.element) {
                if (e.element.type === 'group-header') {
                    this.toggleGroup(e.element);
                }
                else if (e.element.type === 'plugin-item') {
                    this._onDidSelectPlugin.fire(e.element.item);
                }
                else if (e.element.type === 'marketplace-item') {
                    this._onDidSelectPlugin.fire(e.element.item);
                }
            }
        }));
        // Handle context menu
        this._register(this.list.onContextMenu(e => this.onContextMenu(e)));
        // Listen to plugin service changes
        this._register(autorun(reader => {
            const plugins = this.agentPluginService.plugins.read(reader);
            for (const plugin of plugins) {
                plugin.enablement.read(reader);
            }
            if (!this.browseMode) {
                this.refresh();
            }
        }));
        this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
            if (!this.browseMode) {
                this.refresh();
            }
        }));
        // Re-render when the active harness changes (sync checkboxes may appear/disappear)
        this._register(autorun(reader => {
            this.harnessService.activeHarness.read(reader);
            if (!this.browseMode) {
                this.refresh();
            }
        }));
        // Re-render when the active harness's sync provider selection changes
        const syncChangeDisposable = this._register(new MutableDisposable());
        this._register(autorun(reader => {
            this.harnessService.activeHarness.read(reader);
            const syncProvider = this.harnessService.getActiveDescriptor().syncProvider;
            if (syncProvider) {
                syncChangeDisposable.value = syncProvider.onDidChange(() => {
                    if (!this.browseMode) {
                        this.refresh();
                    }
                });
            }
            else {
                syncChangeDisposable.clear();
            }
        }));
        // Initial refresh
        void this.refresh();
    }
    async refresh() {
        if (this.browseMode) {
            await this.queryMarketplace();
        }
        else {
            this.filterPlugins();
        }
    }
    toggleBrowseMode(browse) {
        this.browseMode = browse;
        this.searchInput.value = '';
        this.searchQuery = '';
        this.backLink.style.display = browse ? '' : 'none';
        this.browseButton.element.parentElement.style.display = browse ? 'none' : '';
        this.searchInput.setPlaceHolder(browse
            ? localize('searchMarketplacePlaceholder', "Search plugin marketplace...")
            : localize('searchPluginsPlaceholder', "Type to search..."));
        if (browse) {
            void this.queryMarketplace();
        }
        else {
            this.marketplaceCts?.dispose(true);
            this.marketplaceItems = [];
            this.filterPlugins();
        }
        // Re-layout to account for the back link height change
        if (this.lastHeight > 0) {
            this.layout(this.lastHeight, this.lastWidth);
        }
    }
    async queryMarketplace() {
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
            const installedUris = new Set(this.agentPluginService.plugins.get().map(p => p.uri.toString()));
            this.marketplaceItems = filtered
                .filter(p => {
                const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
                return !installedUris.has(expectedUri.toString());
            })
                .map(marketplacePluginToItem);
            this.updateMarketplaceList();
        }
        catch {
            if (!cts.token.isCancellationRequested) {
                this.marketplaceItems = [];
                this.emptyContainer.style.display = 'flex';
                this.listContainer.style.display = 'none';
                this.emptyText.textContent = localize('marketplaceError', "Unable to load marketplace");
                this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
            }
        }
    }
    updateMarketplaceList() {
        if (this.marketplaceItems.length === 0) {
            this.emptyContainer.style.display = 'flex';
            this.listContainer.style.display = 'none';
            if (this.searchQuery.trim()) {
                this.emptyText.textContent = localize('noMarketplaceResults', "No plugins match '{0}'", this.searchQuery);
                this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
            }
            else {
                this.emptyText.textContent = localize('emptyMarketplace', "No plugins available");
                this.emptySubtext.textContent = '';
            }
        }
        else {
            this.emptyContainer.style.display = 'none';
            this.listContainer.style.display = '';
        }
        const entries = this.marketplaceItems.map(item => ({ type: 'marketplace-item', item }));
        this.list.splice(0, this.list.length, entries);
    }
    filterPlugins() {
        const query = this.searchQuery.toLowerCase().trim();
        const allPlugins = this.agentPluginService.plugins.get();
        this.installedItems = allPlugins
            .map(p => installedPluginToItem(p, this.labelService))
            .filter(item => !query ||
            item.name.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query));
        if (this.installedItems.length === 0) {
            this.emptyContainer.style.display = 'flex';
            this.listContainer.style.display = 'none';
            if (this.searchQuery.trim()) {
                this.emptyText.textContent = localize('noMatchingPlugins', "No plugins match '{0}'", this.searchQuery);
                this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
            }
            else {
                this.emptyText.textContent = localize('noPlugins', "No plugins installed");
                this.emptySubtext.textContent = localize('browseToAdd', "Browse the marketplace to discover and install plugins");
            }
        }
        else {
            this.emptyContainer.style.display = 'none';
            this.listContainer.style.display = '';
        }
        // Group plugins: enabled vs disabled
        const enabledPlugins = this.installedItems.filter(item => isContributionEnabled(item.plugin.enablement.get()));
        const disabledPlugins = this.installedItems.filter(item => !isContributionEnabled(item.plugin.enablement.get()));
        const entries = [];
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
        // Compute sidebar badge directly from the data array (same source as group headers)
        this._onDidChangeItemCount.fire(this.itemCount);
    }
    /**
     * Gets the total item count from the underlying data array
     * (the same source used to build group headers).
     */
    get itemCount() {
        return this.installedItems.length;
    }
    /**
     * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
     * to ensure the subscriber receives the latest count.
     */
    fireItemCount() {
        this._onDidChangeItemCount.fire(this.itemCount);
    }
    toggleGroup(entry) {
        if (this.collapsedGroups.has(entry.group)) {
            this.collapsedGroups.delete(entry.group);
        }
        else {
            this.collapsedGroups.add(entry.group);
        }
        this.filterPlugins();
    }
    layout(height, width) {
        this.lastHeight = height;
        this.lastWidth = width;
        this.element.style.height = `${height}px`;
        // Measure sibling elements to calculate the list height.
        // When offsetHeight returns 0 the container just became visible
        // after display:none and the browser hasn't reflowed yet — defer
        // layout to the next frame so measurements are accurate.
        const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
        if (searchBarHeight === 0) {
            DOM.getWindow(this.element).requestAnimationFrame(() => this.layout(this.lastHeight, this.lastWidth));
            return;
        }
        const footerHeight = this.sectionHeader.offsetHeight;
        const backLinkHeight = this.browseMode ? this.backLink.offsetHeight : 0;
        const listHeight = Math.max(0, height - searchBarHeight - footerHeight - backLinkHeight);
        this.listContainer.style.height = `${listHeight}px`;
        this.list.layout(listHeight, width);
    }
    focusSearch() {
        this.searchInput.focus();
    }
    revealLastItem() {
        if (this.list.length > 0) {
            this.list.reveal(this.list.length - 1);
        }
    }
    focus() {
        this.list.domFocus();
        if (this.list.length > 0) {
            this.list.setFocus([0]);
        }
    }
    onContextMenu(e) {
        if (!e.element || e.element.type !== 'plugin-item') {
            return;
        }
        const entry = e.element;
        const disposables = new DisposableStore();
        const groups = getInstalledPluginContextMenuActions(entry.item.plugin, this.instantiationService);
        const actions = [];
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
};
PluginListWidget = __decorate([
    __param(0, IInstantiationService),
    __param(1, IAgentPluginService),
    __param(2, IPluginMarketplaceService),
    __param(3, IPluginInstallService),
    __param(4, IOpenerService),
    __param(5, IContextViewService),
    __param(6, IContextMenuService),
    __param(7, IHoverService),
    __param(8, ILabelService),
    __param(9, ICommandService),
    __param(10, ICustomizationHarnessService)
], PluginListWidget);
export { PluginListWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luTGlzdFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vcGx1Z2luTGlzdFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHVDQUF1QyxDQUFDO0FBQy9DLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFcEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDM0ksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFx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