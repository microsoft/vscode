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
import { Disposable, DisposableStore, isDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMcpWorkbenchService, IMcpService } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { isContributionDisabled } from '../../common/enablement.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { getContextMenuActions } from '../../../../contrib/mcp/browser/mcpServerActions.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { workspaceIcon, userIcon, mcpServerIcon, builtinIcon, pluginIcon, extensionIcon } from './aiCustomizationIcons.js';
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, CustomizationHarness } from '../../common/customizationHarnessService.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from './customizationGroupHeaderRenderer.js';
const $ = DOM.$;
const MCP_ITEM_HEIGHT = 36;
const PLUGIN_COLLECTION_PREFIX = 'plugin.';
const COPILOT_EXTENSION_IDS = ['github.copilot', 'github.copilot-chat'];
function isCopilotExtension(id) {
    return COPILOT_EXTENSION_IDS.some(copilotId => ExtensionIdentifier.equals(id, copilotId));
}
function getPluginUriFromCollectionId(collectionId) {
    return collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX) ? collectionId.slice(PLUGIN_COLLECTION_PREFIX.length) : undefined;
}
/**
 * Delegate for the MCP server list.
 */
class McpServerItemDelegate {
    getHeight(element) {
        if (element.type === 'group-header') {
            return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
        }
        if (element.type === 'server-item' && element.server.gallery && !element.server.local) {
            return 62;
        }
        return MCP_ITEM_HEIGHT;
    }
    getTemplateId(element) {
        if (element.type === 'group-header') {
            return 'mcpGroupHeader';
        }
        if (element.type === 'builtin-item') {
            return 'mcpServerItem';
        }
        const server = element.server;
        return server.gallery && !server.local ? 'mcpGalleryItem' : 'mcpServerItem';
    }
}
/**
 * Renderer for local MCP server list items.
 */
let McpServerItemRenderer = class McpServerItemRenderer {
    constructor(mcpService, workspaceService, agentPluginService, harnessService, hoverService) {
        this.mcpService = mcpService;
        this.workspaceService = workspaceService;
        this.agentPluginService = agentPluginService;
        this.harnessService = harnessService;
        this.hoverService = hoverService;
        this.templateId = 'mcpServerItem';
    }
    renderTemplate(container) {
        container.classList.add('mcp-server-item');
        const typeIcon = DOM.append(container, $('.mcp-server-icon'));
        typeIcon.classList.add(...ThemeIcon.asClassNameArray(mcpServerIcon));
        const details = DOM.append(container, $('.mcp-server-details'));
        const nameRow = DOM.append(details, $('.mcp-server-name-row'));
        const name = DOM.append(nameRow, $('.mcp-server-name'));
        const bridgedBadge = DOM.append(nameRow, $('.inline-badge.mcp-bridged-badge'));
        bridgedBadge.textContent = localize('bridged', "Bridged");
        const description = DOM.append(details, $('.mcp-server-description'));
        const status = DOM.append(container, $('.mcp-server-status'));
        return { container, typeIcon, name, description, status, bridgedBadge, disposables: new DisposableStore() };
    }
    renderElement(element, index, templateData) {
        templateData.disposables.clear();
        // Show/hide the "Bridged" badge based on active harness
        templateData.disposables.add(autorun(reader => {
            const activeId = this.harnessService.activeHarness.read(reader);
            templateData.bridgedBadge.style.display = activeId !== CustomizationHarness.VSCode ? '' : 'none';
        }));
        templateData.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.bridgedBadge, localize('bridgedHover', "This server is managed by VS Code and forwarded to all compatible agent sessions.")));
        if (element.type === 'builtin-item') {
            templateData.container.classList.add('builtin');
            templateData.name.textContent = formatDisplayName(element.label);
            if (element.description) {
                templateData.description.textContent = truncateToFirstLine(element.description);
                templateData.description.style.display = '';
            }
            else {
                templateData.description.style.display = 'none';
            }
            templateData.status.style.display = 'none';
            // Add hover with plugin provenance for plugin-sourced builtin items
            const pluginUriStr = getPluginUriFromCollectionId(element.collectionId);
            if (pluginUriStr) {
                templateData.disposables.add(this.hoverService.setupDelayedHover(templateData.container, () => {
                    const plugin = this.agentPluginService.plugins.get().find(p => p.uri.toString() === pluginUriStr);
                    if (plugin) {
                        return {
                            content: `${element.label}\n${localize('fromPlugin', "Plugin: {0}", plugin.label)}`,
                            appearance: { compact: true, skipFadeInAnimation: true },
                        };
                    }
                    return { content: element.label, appearance: { compact: true, skipFadeInAnimation: true } };
                }));
            }
            return;
        }
        templateData.container.classList.remove('builtin');
        templateData.name.textContent = formatDisplayName(element.server.label);
        if (element.server.description) {
            templateData.description.textContent = truncateToFirstLine(element.server.description);
            templateData.description.style.display = '';
        }
        else {
            templateData.description.style.display = 'none';
        }
        // Find the server from IMcpService to get connection state
        const server = this.mcpService.servers.get().find(s => s.definition.id === element.server.id);
        templateData.disposables.add(autorun(reader => {
            const disabled = server ? isContributionDisabled(server.enablement.read(reader)) : false;
            const connectionState = server?.connectionState.read(reader);
            templateData.container.classList.toggle('disabled', disabled);
            this.updateStatus(templateData.status, disabled ? 'disabled' : connectionState?.state);
        }));
    }
    updateStatus(statusElement, state) {
        statusElement.className = 'mcp-server-status';
        if (this.workspaceService.isSessionsWindow) {
            // In sessions window, CLI manages MCP servers — hide status
            statusElement.style.display = 'none';
            return;
        }
        statusElement.style.display = '';
        if (state === 'disabled') {
            statusElement.textContent = localize('disabled', "Disabled");
            statusElement.classList.add('disabled');
            return;
        }
        switch (state) {
            case 2 /* McpConnectionState.Kind.Running */:
                statusElement.textContent = localize('running', "Running");
                statusElement.classList.add('running');
                break;
            case 1 /* McpConnectionState.Kind.Starting */:
                statusElement.textContent = localize('starting', "Starting");
                statusElement.classList.add('starting');
                break;
            case 3 /* McpConnectionState.Kind.Error */:
                statusElement.textContent = localize('error', "Error");
                statusElement.classList.add('error');
                break;
            case 0 /* McpConnectionState.Kind.Stopped */:
            default:
                statusElement.textContent = localize('stopped', "Stopped");
                statusElement.classList.add('stopped');
                break;
        }
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
};
McpServerItemRenderer = __decorate([
    __param(0, IMcpService),
    __param(1, IAICustomizationWorkspaceService),
    __param(2, IAgentPluginService),
    __param(3, ICustomizationHarnessService),
    __param(4, IHoverService)
], McpServerItemRenderer);
/**
 * Renderer for gallery MCP server items with an install button.
 */
class McpGalleryItemRenderer {
    constructor(mcpWorkbenchService) {
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.templateId = 'mcpGalleryItem';
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
        templateData.name.textContent = element.server.label;
        templateData.publisher.textContent = element.server.publisherDisplayName ? `by ${element.server.publisherDisplayName}` : '';
        templateData.description.textContent = element.server.description || '';
        this.updateInstallButton(templateData.installButton, element.server);
        templateData.elementDisposables.add(templateData.installButton.onDidClick(async () => {
            const canInstall = this.mcpWorkbenchService.canInstall(element.server);
            if (canInstall === true) {
                templateData.installButton.label = localize('installing', "Installing...");
                templateData.installButton.enabled = false;
                await this.mcpWorkbenchService.install(element.server);
            }
        }));
        templateData.elementDisposables.add(this.mcpWorkbenchService.onChange(changed => {
            if (!changed || changed.id === element.server.id) {
                this.updateInstallButton(templateData.installButton, element.server);
            }
        }));
    }
    updateInstallButton(button, server) {
        switch (server.installState) {
            case 1 /* McpServerInstallState.Installed */:
                button.label = localize('installed', "Installed");
                button.enabled = false;
                break;
            case 0 /* McpServerInstallState.Installing */:
                button.label = localize('installing', "Installing...");
                button.enabled = false;
                break;
            default:
                button.label = localize('install', "Install");
                button.enabled = true;
                break;
        }
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.templateDisposables.dispose();
    }
}
/**
 * Widget that displays a list of MCP servers with marketplace browsing.
 */
let McpListWidget = class McpListWidget extends Disposable {
    constructor(instantiationService, mcpWorkbenchService, mcpService, mcpRegistry, commandService, openerService, contextViewService, contextMenuService, hoverService, agentPluginService, dialogService) {
        super();
        this.instantiationService = instantiationService;
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.mcpService = mcpService;
        this.mcpRegistry = mcpRegistry;
        this.commandService = commandService;
        this.openerService = openerService;
        this.contextViewService = contextViewService;
        this.contextMenuService = contextMenuService;
        this.hoverService = hoverService;
        this.agentPluginService = agentPluginService;
        this.dialogService = dialogService;
        this._onDidSelectServer = this._register(new Emitter());
        this.onDidSelectServer = this._onDidSelectServer.event;
        this._onDidChangeItemCount = this._register(new Emitter());
        this.onDidChangeItemCount = this._onDidChangeItemCount.event;
        this._onDidRequestShowPlugin = this._register(new Emitter());
        this.onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;
        this.filteredServers = [];
        this.filteredBuiltinCount = 0;
        this.displayEntries = [];
        this.galleryServers = [];
        this.searchQuery = '';
        this.browseMode = false;
        this.lastHeight = 0;
        this.lastWidth = 0;
        this.collapsedGroups = new Set();
        this.delayedFilter = new Delayer(200);
        this.delayedGallerySearch = new Delayer(400);
        this.element = $('.mcp-list-widget');
        this.create();
        this._register({
            dispose: () => {
                this.galleryCts?.dispose();
            }
        });
    }
    create() {
        // Search and button container
        this.searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));
        // Search container
        const searchContainer = DOM.append(this.searchAndButtonContainer, $('.list-search-container'));
        this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
            placeholder: localize('searchMcpPlaceholder', "Type to search..."),
            inputBoxStyles: defaultInputBoxStyles,
        }));
        this._register(this.searchInput.onDidChange(() => {
            this.searchQuery = this.searchInput.value;
            if (this.browseMode) {
                this.delayedGallerySearch.trigger(() => this.queryGallery());
            }
            else {
                this.delayedFilter.trigger(() => this.filterServers());
            }
        }));
        // Button container (Browse Marketplace + Add Server)
        const buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));
        // Browse Marketplace button
        const browseButtonContainer = DOM.append(buttonContainer, $('.list-add-button-container'));
        this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
        this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
        this.browseButton.element.classList.add('list-add-button');
        this._register(this.browseButton.onDidClick(() => {
            this.toggleBrowseMode(!this.browseMode);
        }));
        this.addButton = this._register(new Button(buttonContainer, {
            ...defaultButtonStyles,
            secondary: true,
            supportIcons: true,
            title: localize('addServer', "Add Server"),
            ariaLabel: localize('addServer', "Add Server")
        }));
        this.addButton.label = `$(${Codicon.add.id})`;
        this.addButton.element.classList.add('list-icon-button');
        this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.addButton.element, localize('addServerTooltip', "Add Server")));
        this._register(this.addButton.onDidClick(() => {
            this.commandService.executeCommand("workbench.mcp.addConfiguration" /* McpCommandIds.AddConfiguration */);
        }));
        // Back to installed link (shown only in browse mode)
        this.backLink = DOM.append(this.element, $('.mcp-back-link'));
        this.backLink.setAttribute('role', 'button');
        this.backLink.tabIndex = 0;
        this.backLink.setAttribute('aria-label', localize('backToInstalledAriaLabel', "Back to installed servers"));
        const backIcon = DOM.append(this.backLink, $('span'));
        backIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowLeft));
        const backText = DOM.append(this.backLink, $('span'));
        backText.textContent = localize('backToInstalled', "Back to installed servers");
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
        emptyIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.server));
        this.emptyText = DOM.append(emptyHeader, $('.empty-text'));
        this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));
        // List container
        this.listContainer = DOM.append(this.element, $('.mcp-list-container'));
        // Section footer at bottom with description and link
        this.sectionHeader = DOM.append(this.element, $('.section-footer'));
        this.sectionDescription = DOM.append(this.sectionHeader, $('p.section-footer-description'));
        this.sectionDescription.textContent = localize('mcpServersDescription', "An open standard that lets AI use external tools and services. MCP servers provide tools for file operations, databases, APIs, and more.");
        this.sectionLink = DOM.append(this.sectionHeader, $('a.section-footer-link'));
        this.sectionLink.textContent = localize('learnMoreMcp', "Learn more about MCP servers");
        this.sectionLink.href = 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers';
        this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
            e.preventDefault();
            const href = this.sectionLink.href;
            if (href) {
                this.openerService.open(URI.parse(href));
            }
        }));
        // Create list
        const delegate = new McpServerItemDelegate();
        const groupHeaderRenderer = new CustomizationGroupHeaderRenderer('mcpGroupHeader', this.hoverService);
        const localRenderer = this.instantiationService.createInstance(McpServerItemRenderer);
        const galleryRenderer = new McpGalleryItemRenderer(this.mcpWorkbenchService);
        this.list = this._register(this.instantiationService.createInstance((WorkbenchList), 'McpManagementList', this.listContainer, delegate, [groupHeaderRenderer, localRenderer, galleryRenderer], {
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel(element) {
                    if (element.type === 'group-header') {
                        return localize('mcpGroupAriaLabel', "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
                    }
                    if (element.type === 'builtin-item') {
                        return element.label;
                    }
                    return element.server.label;
                },
                getWidgetAriaLabel() {
                    return localize('mcpServersListAriaLabel', "MCP Servers");
                }
            },
            openOnSingleClick: true,
            identityProvider: {
                getId(element) {
                    if (element.type === 'group-header') {
                        return element.id;
                    }
                    if (element.type === 'builtin-item') {
                        return element.id;
                    }
                    return element.server.id;
                }
            }
        }));
        this._register(this.list.onDidOpen(e => {
            if (e.element) {
                if (e.element.type === 'group-header') {
                    this.toggleGroup(e.element);
                }
                else if (e.element.type === 'server-item') {
                    this._onDidSelectServer.fire(e.element.server);
                }
                // builtin-item: no action on click (read-only)
            }
        }));
        // Handle context menu
        this._register(this.list.onContextMenu(e => this.onContextMenu(e)));
        // Listen to MCP service changes
        this._register(this.mcpWorkbenchService.onChange(() => {
            if (!this.browseMode) {
                this.refresh();
            }
        }));
        this._register(autorun(reader => {
            this.mcpService.servers.read(reader);
            if (!this.browseMode) {
                this.refresh();
            }
        }));
        // Initial refresh
        void this.refresh();
    }
    async refresh() {
        if (this.browseMode) {
            await this.queryGallery();
        }
        else {
            this.filterServers();
        }
    }
    toggleBrowseMode(browse) {
        this.browseMode = browse;
        this.searchInput.value = '';
        this.searchQuery = '';
        // Update UI for browse vs installed mode
        this.backLink.style.display = browse ? '' : 'none';
        this.addButton.element.style.display = browse ? 'none' : '';
        this.browseButton.element.parentElement.style.display = browse ? 'none' : '';
        this.searchInput.setPlaceHolder(browse
            ? localize('searchGalleryPlaceholder', "Search MCP marketplace...")
            : localize('searchMcpPlaceholder', "Type to search..."));
        if (browse) {
            void this.queryGallery();
        }
        else {
            this.galleryCts?.dispose(true);
            this.galleryServers = [];
            this.filterServers();
        }
        // Re-layout to account for the back link height change
        if (this.lastHeight > 0) {
            this.layout(this.lastHeight, this.lastWidth);
        }
    }
    async queryGallery() {
        this.galleryCts?.dispose(true);
        const cts = this.galleryCts = new CancellationTokenSource();
        // Show loading state
        this.emptyContainer.style.display = 'flex';
        this.listContainer.style.display = 'none';
        this.emptyText.textContent = localize('loadingGallery', "Loading marketplace...");
        this.emptySubtext.textContent = '';
        try {
            const pager = await this.mcpWorkbenchService.queryGallery({ text: this.searchQuery.trim() || undefined }, cts.token);
            if (cts.token.isCancellationRequested) {
                return;
            }
            this.galleryServers = pager.firstPage.items;
            this.updateGalleryList();
        }
        catch {
            if (!cts.token.isCancellationRequested) {
                this.galleryServers = [];
                this.emptyContainer.style.display = 'flex';
                this.listContainer.style.display = 'none';
                this.emptyText.textContent = localize('galleryError', "Unable to load marketplace");
                this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
            }
        }
    }
    updateGalleryList() {
        if (this.galleryServers.length === 0) {
            this.emptyContainer.style.display = 'flex';
            this.listContainer.style.display = 'none';
            if (this.searchQuery.trim()) {
                this.emptyText.textContent = localize('noGalleryResults', "No servers match '{0}'", this.searchQuery);
                this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
            }
            else {
                this.emptyText.textContent = localize('emptyGallery', "No MCP servers available");
                this.emptySubtext.textContent = '';
            }
        }
        else {
            this.emptyContainer.style.display = 'none';
            this.listContainer.style.display = '';
        }
        const entries = this.galleryServers.map(server => ({ type: 'server-item', server }));
        this.list.splice(0, this.list.length, entries);
    }
    filterServers() {
        const query = this.searchQuery.toLowerCase().trim();
        if (query) {
            this.filteredServers = this.mcpWorkbenchService.local.filter(server => server.label.toLowerCase().includes(query) ||
                (server.description?.toLowerCase().includes(query)));
        }
        else {
            this.filteredServers = [...this.mcpWorkbenchService.local];
        }
        // Find extension-provided servers not in the local list (e.g. GitHub MCP)
        const localIds = new Set(this.filteredServers.map(s => s.id));
        const builtinServers = this.mcpService.servers.get()
            .filter(s => !localIds.has(s.definition.id))
            .filter(s => !query || s.definition.label.toLowerCase().includes(query));
        // Show empty state only when there are no servers at all (not when filtered to empty)
        if (this.filteredServers.length === 0 && builtinServers.length === 0) {
            this.emptyContainer.style.display = 'flex';
            this.listContainer.style.display = 'none';
            if (this.searchQuery.trim()) {
                // Search with no results
                this.emptyText.textContent = localize('noMatchingServers', "No servers match '{0}'", this.searchQuery);
                this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
            }
            else {
                // No servers configured
                this.emptyText.textContent = localize('noMcpServers', "No MCP servers configured");
                this.emptySubtext.textContent = localize('addMcpServer', "Add an MCP server configuration to get started");
            }
        }
        else {
            this.emptyContainer.style.display = 'none';
            this.listContainer.style.display = '';
        }
        // Group servers by scope
        const groups = [
            { scope: "workspace" /* LocalMcpServerScope.Workspace */, label: localize('workspaceGroup', "Workspace"), icon: workspaceIcon, description: localize('workspaceGroupDescription', "MCP servers configured in your workspace settings, shared with your team via version control."), servers: [] },
            { scope: "user" /* LocalMcpServerScope.User */, label: localize('userGroup', "User"), icon: userIcon, description: localize('userGroupDescription', "MCP servers configured in your user settings. Private to you and available across all projects."), servers: [] },
        ];
        for (const server of this.filteredServers) {
            const scope = server.local?.scope;
            if (scope === "workspace" /* LocalMcpServerScope.Workspace */) {
                groups[0].servers.push(server);
            }
            else {
                // User, RemoteUser, or unknown → group under User
                groups[1].servers.push(server);
            }
        }
        // Build display entries with group headers
        const entries = [];
        let isFirst = true;
        for (const group of groups) {
            if (group.servers.length === 0) {
                continue;
            }
            const collapsed = this.collapsedGroups.has(group.scope);
            entries.push({
                type: 'group-header',
                id: `mcp-group-${group.scope}`,
                scope: group.scope,
                label: group.label,
                icon: group.icon,
                count: group.servers.length,
                isFirst,
                description: group.description,
                collapsed,
            });
            if (!collapsed) {
                for (const server of group.servers) {
                    entries.push({ type: 'server-item', server });
                }
            }
            isFirst = false;
        }
        // Add plugin-provided, extension-provided, and built-in servers.
        // Servers from the Copilot extension (github.copilot / github.copilot-chat)
        // are treated as built-in; servers from other extensions go under "Extensions".
        const collectionSources = new Map(this.mcpRegistry.collections.get().map(c => [c.id, c.source]));
        const pluginServers = [];
        const extensionServers = [];
        const otherBuiltinServers = [];
        for (const server of builtinServers) {
            const source = collectionSources.get(server.collection.id);
            if (server.collection.id.startsWith(PLUGIN_COLLECTION_PREFIX)) {
                pluginServers.push(server);
            }
            else if (source instanceof ExtensionIdentifier && !isCopilotExtension(source)) {
                extensionServers.push(server);
            }
            else {
                otherBuiltinServers.push(server);
            }
        }
        if (pluginServers.length > 0) {
            const collapsed = this.collapsedGroups.has('plugin');
            entries.push({
                type: 'group-header',
                id: 'mcp-group-plugin',
                scope: 'plugin',
                label: localize('pluginGroup', "Plugins"),
                icon: pluginIcon,
                count: pluginServers.length,
                isFirst,
                description: localize('pluginGroupDescription', "MCP servers provided by installed plugins."),
                collapsed,
            });
            if (!collapsed) {
                for (const server of pluginServers) {
                    entries.push({
                        type: 'builtin-item',
                        id: `builtin-${server.definition.id}`,
                        label: server.definition.label,
                        description: '',
                        collectionId: server.collection.id,
                    });
                }
            }
            isFirst = false;
        }
        if (extensionServers.length > 0) {
            const collapsed = this.collapsedGroups.has('extension');
            entries.push({
                type: 'group-header',
                id: 'mcp-group-extension',
                scope: 'extension',
                label: localize('extensionGroup', "Extensions"),
                icon: extensionIcon,
                count: extensionServers.length,
                isFirst,
                description: localize('extensionGroupDescription', "MCP servers contributed by installed VS Code extensions."),
                collapsed,
            });
            if (!collapsed) {
                for (const server of extensionServers) {
                    entries.push({
                        type: 'builtin-item',
                        id: `builtin-${server.definition.id}`,
                        label: server.definition.label,
                        description: '',
                        collectionId: server.collection.id,
                    });
                }
            }
            isFirst = false;
        }
        if (otherBuiltinServers.length > 0) {
            const collapsed = this.collapsedGroups.has('builtin');
            entries.push({
                type: 'group-header',
                id: 'mcp-group-builtin',
                scope: 'builtin',
                label: localize('builtInGroup', "Built-in"),
                icon: builtinIcon,
                count: otherBuiltinServers.length,
                isFirst,
                description: localize('builtInGroupDescription', "MCP servers built into VS Code. These are available automatically."),
                collapsed,
            });
            if (!collapsed) {
                for (const server of otherBuiltinServers) {
                    entries.push({
                        type: 'builtin-item',
                        id: `builtin-${server.definition.id}`,
                        label: server.definition.label,
                        description: '',
                        collectionId: server.collection.id,
                    });
                }
            }
            isFirst = false;
        }
        this.displayEntries = entries;
        this.list.splice(0, this.list.length, this.displayEntries);
        // Compute sidebar badge directly from the data arrays (same source as group headers)
        this.filteredBuiltinCount = builtinServers.length;
        this._onDidChangeItemCount.fire(this.itemCount);
    }
    /**
     * Gets the total item count from the underlying data arrays
     * (the same source used to build group headers).
     */
    get itemCount() {
        return this.filteredServers.length + this.filteredBuiltinCount;
    }
    /**
     * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
     * to ensure the subscriber receives the latest count.
     */
    fireItemCount() {
        this._onDidChangeItemCount.fire(this.itemCount);
    }
    /**
     * Toggles the collapsed state of a group.
     */
    toggleGroup(entry) {
        if (this.collapsedGroups.has(entry.scope)) {
            this.collapsedGroups.delete(entry.scope);
        }
        else {
            this.collapsedGroups.add(entry.scope);
        }
        this.filterServers();
    }
    /**
     * Layouts the widget.
     */
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
    /**
     * Focuses the search input.
     */
    focusSearch() {
        this.searchInput.focus();
    }
    /**
     * Scrolls the list so the last item is visible.
     */
    revealLastItem() {
        if (this.list.length > 0) {
            this.list.reveal(this.list.length - 1);
        }
    }
    /**
     * Focuses the list.
     */
    focus() {
        this.list.domFocus();
        const servers = this.list.length;
        if (servers > 0) {
            this.list.setFocus([0]);
        }
    }
    /**
     * Handles context menu for MCP server items.
     */
    onContextMenu(e) {
        if (!e.element) {
            return;
        }
        // Plugin-provided builtin items get an "Uninstall Plugin" context menu
        if (e.element.type === 'builtin-item') {
            const collectionId = e.element.collectionId;
            const pluginUriStr = getPluginUriFromCollectionId(collectionId);
            if (!pluginUriStr) {
                return;
            }
            const plugin = this.agentPluginService.plugins.get().find(p => p.uri.toString() === pluginUriStr);
            if (!plugin) {
                return;
            }
            const disposables = new DisposableStore();
            const showPluginAction = disposables.add(new Action('mcpServer.showPlugin', localize('showPlugin', "Show Plugin"), undefined, true, async () => {
                const item = {
                    kind: "installed" /* AgentPluginItemKind.Installed */,
                    name: plugin.label,
                    description: plugin.fromMarketplace?.description ?? '',
                    marketplace: plugin.fromMarketplace?.marketplace,
                    plugin,
                };
                this._onDidRequestShowPlugin.fire(item);
            }));
            const uninstallAction = disposables.add(new Action('mcpServer.uninstallPlugin', localize('uninstallPlugin', "Uninstall Plugin"), undefined, true, async () => {
                const result = await this.dialogService.confirm({
                    message: localize('confirmUninstallPluginMcp', "This MCP server is provided by the plugin '{0}'", plugin.label),
                    detail: localize('confirmUninstallPluginMcpDetail', "Individual MCP servers from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
                    primaryButton: localize('uninstallPluginBtn', "Uninstall Plugin"),
                    type: 'question',
                });
                if (result.confirmed) {
                    plugin.remove();
                }
            }));
            this.contextMenuService.showContextMenu({
                getAnchor: () => e.anchor,
                getActions: () => [showPluginAction, uninstallAction],
                onHide: () => disposables.dispose(),
            });
            return;
        }
        if (e.element.type !== 'server-item') {
            return;
        }
        const serverEntry = e.element;
        const disposables = new DisposableStore();
        const mcpServer = this.mcpWorkbenchService.local.find(local => local.id === serverEntry.server.id) || serverEntry.server;
        // Get context menu actions from the MCP module
        const groups = getContextMenuActions(mcpServer, false, this.instantiationService);
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
        // Remove trailing separator
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
McpListWidget = __decorate([
    __param(0, IInstantiationService),
    __param(1, IMcpWorkbenchService),
    __param(2, IMcpService),
    __param(3, IMcpRegistry),
    __param(4, ICommandService),
    __param(5, IOpenerService),
    __param(6, IContextViewService),
    __param(7, IContextMenuService),
    __param(8, IHoverService),
    __param(9, IAgentPluginService),
    __param(10, IDialogService)
], McpListWidget);
export { McpListWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTGlzdFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vbWNwTGlzdFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHVDQUF1QyxDQUFDO0FBQy9DLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFcEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDcEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxvQkFBb0IsRUFBa0UsV0FBVyxFQUFjLE1BQU0sNENBQTRDLENBQUM7QUFDM0ssT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9B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