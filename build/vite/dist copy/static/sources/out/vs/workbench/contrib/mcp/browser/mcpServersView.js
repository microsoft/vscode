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
var McpServerRenderer_1;
import './media/mcpServersView.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { combinedDisposable, Disposable, DisposableStore, dispose, isDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { DelayedPagedModel, PagedModel, IterativePagedModel } from '../../../../base/common/paging.js';
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyDefinedExpr, ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchPagedList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService, Extensions as ViewExtensions } from '../../../common/views.js';
import { HasInstalledMcpServersContext, IMcpWorkbenchService, InstalledMcpServersViewId, McpServerContainers, McpServersGalleryStatusContext } from '../common/mcpTypes.js';
import { DropDownAction, getContextMenuActions, InstallAction, InstallingLabelAction, ManageMcpServerAction, McpServerStatusAction } from './mcpServerActions.js';
import { PublisherWidget, StarredWidget, McpServerIconWidget, McpServerHoverWidget, McpServerScopeBadgeWidget } from './mcpServerWidgets.js';
import { ActionRunner, Separator } from '../../../../base/common/actions.js';
import { mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { DefaultViewsContext, SearchMcpServersContext } from '../../extensions/common/extensions.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AbstractExtensionsListView } from '../../extensions/browser/extensionsViews.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { mcpServerIcon } from './mcpServerIcons.js';
import { IMcpGalleryManifestService } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { ProductQualityContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { buildModalNavigationForPagedList } from '../../extensions/browser/extensionsViewer.js';
let McpServersListView = class McpServersListView extends AbstractExtensionsListView {
    constructor(mpcViewOptions, options, keybindingService, contextMenuService, instantiationService, themeService, hoverService, configurationService, contextKeyService, viewDescriptorService, openerService, dialogService, mcpWorkbenchService, mcpGalleryManifestService, layoutService, markdownRendererService, logService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.mpcViewOptions = mpcViewOptions;
        this.dialogService = dialogService;
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.mcpGalleryManifestService = mcpGalleryManifestService;
        this.layoutService = layoutService;
        this.markdownRendererService = markdownRendererService;
        this.logService = logService;
        this.list = null;
        this.listContainer = null;
        this.welcomeContainer = null;
        this.contextMenuActionRunner = this._register(new ActionRunner());
        this.modalNavigationDisposable = this._register(new MutableDisposable());
    }
    renderBody(container) {
        super.renderBody(container);
        // Create welcome container
        this.welcomeContainer = dom.append(container, dom.$('.mcp-welcome-container.hide'));
        this.createWelcomeContent(this.welcomeContainer);
        const messageContainer = dom.append(container, dom.$('.message-container'));
        const messageSeverityIcon = dom.append(messageContainer, dom.$(''));
        const messageBox = dom.append(messageContainer, dom.$('.message'));
        const mcpServersList = dom.$('.mcp-servers-list');
        this.bodyTemplate = {
            mcpServersList,
            messageBox,
            messageContainer,
            messageSeverityIcon
        };
        this.listContainer = dom.append(container, mcpServersList);
        this.list = this._register(this.instantiationService.createInstance(WorkbenchPagedList, `${this.id}-MCP-Servers`, this.listContainer, {
            getHeight() { return 72; },
            getTemplateId: () => McpServerRenderer.templateId,
        }, [this.instantiationService.createInstance(McpServerRenderer, {
                hoverOptions: {
                    position: () => {
                        const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
                        if (viewLocation === 0 /* ViewContainerLocation.Sidebar */) {
                            return this.layoutService.getSideBarPosition() === 0 /* Position.LEFT */ ? 1 /* HoverPosition.RIGHT */ : 0 /* HoverPosition.LEFT */;
                        }
                        if (viewLocation === 2 /* ViewContainerLocation.AuxiliaryBar */) {
                            return this.layoutService.getSideBarPosition() === 0 /* Position.LEFT */ ? 0 /* HoverPosition.LEFT */ : 1 /* HoverPosition.RIGHT */;
                        }
                        return 1 /* HoverPosition.RIGHT */;
                    }
                }
            })], {
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel(mcpServer) {
                    return mcpServer?.label ?? '';
                },
                getWidgetAriaLabel() {
                    return localize('mcp servers', "MCP Servers");
                }
            },
            overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles,
            openOnSingleClick: true,
        }));
        this._register(Event.debounce(Event.filter(this.list.onDidOpen, e => e.element !== null), (_, event) => event, 75, true)(options => {
            this.mcpWorkbenchService.open(options.element, {
                ...options.editorOptions,
                modal: options.sideBySide ? undefined : buildModalNavigationForPagedList(options.element, () => this.list?.model, (serverA, serverB) => serverA.id === serverB.id, (server, modal) => this.mcpWorkbenchService.open(server, { pinned: false, modal }), this.modalNavigationDisposable, this.logService),
            });
        }));
        this._register(this.list.onContextMenu(e => this.onContextMenu(e), this));
        if (this.input) {
            this.renderInput();
        }
    }
    async onContextMenu(e) {
        if (e.element) {
            const disposables = new DisposableStore();
            const mcpServer = e.element ? this.mcpWorkbenchService.local.find(local => local.id === e.element.id) || e.element
                : e.element;
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
            actions.pop();
            this.contextMenuService.showContextMenu({
                getAnchor: () => e.anchor,
                getActions: () => actions,
                actionRunner: this.contextMenuActionRunner,
                onHide: () => disposables.dispose()
            });
        }
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.list?.layout(height, width);
    }
    async show(query) {
        if (this.input) {
            this.input.disposables.dispose();
            this.input = undefined;
        }
        if (this.mpcViewOptions.showWelcome) {
            this.input = { model: new PagedModel([]), disposables: new DisposableStore(), showWelcomeContent: true };
        }
        else {
            this.input = await this.query(query.trim());
        }
        this.renderInput();
        if (this.input.onDidChangeModel) {
            this.input.disposables.add(this.input.onDidChangeModel(model => {
                if (!this.input) {
                    return;
                }
                this.input.model = model;
                this.renderInput();
            }));
        }
        return this.input.model;
    }
    renderInput() {
        if (!this.input) {
            return;
        }
        if (this.list) {
            this.list.model = new DelayedPagedModel(this.input.model);
        }
        this.showWelcomeContent(!!this.input.showWelcomeContent);
        if (!this.input.showWelcomeContent) {
            this.updateBody();
        }
    }
    showWelcomeContent(show) {
        this.welcomeContainer?.classList.toggle('hide', !show);
        this.listContainer?.classList.toggle('hide', show);
    }
    createWelcomeContent(welcomeContainer) {
        const welcomeContent = dom.append(welcomeContainer, dom.$('.mcp-welcome-content'));
        const iconContainer = dom.append(welcomeContent, dom.$('.mcp-welcome-icon'));
        const iconElement = dom.append(iconContainer, dom.$('span'));
        iconElement.className = ThemeIcon.asClassName(mcpServerIcon);
        const title = dom.append(welcomeContent, dom.$('.mcp-welcome-title'));
        title.textContent = localize('mcp.welcome.title', "MCP Servers");
        const settingsCommandLink = createMarkdownCommandLink({ id: 'workbench.action.openSettings', arguments: [`@id:${mcpGalleryServiceEnablementConfig}`], text: mcpGalleryServiceEnablementConfig, tooltip: localize('mcp.welcome.settings.tooltip', "Open Settings") }).toString();
        const description = dom.append(welcomeContent, dom.$('.mcp-welcome-description'));
        const markdownResult = this._register(this.markdownRendererService.render(new MarkdownString(localize('mcp.welcome.descriptionWithLink', "Browse and install [Model Context Protocol (MCP) servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) directly from VS Code to extend agent mode with extra tools for connecting to databases, invoking APIs and performing specialized tasks."), { isTrusted: { enabledCommands: ['workbench.action.openSettings'] } })
            .appendMarkdown('\n\n')
            .appendMarkdown(localize('mcp.gallery.enableDialog.setting', "This feature is currently in preview. You can disable it anytime using the setting {0}.", settingsCommandLink))));
        description.appendChild(markdownResult.element);
        const buttonContainer = dom.append(welcomeContent, dom.$('.mcp-welcome-button-container'));
        const button = this._register(new Button(buttonContainer, {
            title: localize('mcp.welcome.enableGalleryButton', "Enable MCP Servers Marketplace"),
            ...defaultButtonStyles
        }));
        button.label = localize('mcp.welcome.enableGalleryButton', "Enable MCP Servers Marketplace");
        this._register(button.onDidClick(async () => {
            const { result } = await this.dialogService.prompt({
                type: 'info',
                message: localize('mcp.gallery.enableDialog.title', "Enable MCP Servers Marketplace?"),
                custom: {
                    markdownDetails: [{
                            markdown: new MarkdownString(localize('mcp.gallery.enableDialog.setting', "This feature is currently in preview. You can disable it anytime using the setting {0}.", settingsCommandLink), { isTrusted: true })
                        }]
                },
                buttons: [
                    { label: localize('mcp.gallery.enableDialog.enable', "Enable"), run: () => true },
                    { label: localize('mcp.gallery.enableDialog.cancel', "Cancel"), run: () => false }
                ]
            });
            if (result) {
                await this.configurationService.updateValue(mcpGalleryServiceEnablementConfig, true);
            }
        }));
    }
    updateBody(message) {
        if (this.bodyTemplate) {
            const count = this.input?.model.length ?? 0;
            this.bodyTemplate.mcpServersList.classList.toggle('hidden', count === 0);
            this.bodyTemplate.messageContainer.classList.toggle('hidden', !message && count > 0);
            if (this.isBodyVisible()) {
                if (message) {
                    this.bodyTemplate.messageSeverityIcon.className = SeverityIcon.className(message.severity);
                    this.bodyTemplate.messageBox.textContent = message.text;
                }
                else if (count === 0) {
                    this.bodyTemplate.messageSeverityIcon.className = '';
                    this.bodyTemplate.messageBox.textContent = localize('no extensions found', "No MCP Servers found.");
                }
                if (this.bodyTemplate.messageBox.textContent) {
                    alert(this.bodyTemplate.messageBox.textContent);
                }
            }
        }
    }
    async query(query) {
        const disposables = new DisposableStore();
        if (query) {
            const servers = await this.mcpWorkbenchService.queryGallery({ text: query.replace('@mcp', '') });
            const model = disposables.add(new IterativePagedModel(servers));
            return { model, disposables };
        }
        const onDidChangeModel = disposables.add(new Emitter());
        let servers = await this.mcpWorkbenchService.queryLocal();
        disposables.add(Event.debounce(this.mcpWorkbenchService.onChange, () => undefined)(() => {
            const mergedMcpServers = this.mergeChangedMcpServers(servers, [...this.mcpWorkbenchService.local]);
            if (mergedMcpServers) {
                servers = mergedMcpServers;
                onDidChangeModel.fire(new PagedModel(servers));
            }
        }));
        disposables.add(this.mcpWorkbenchService.onReset(() => onDidChangeModel.fire(new PagedModel([...this.mcpWorkbenchService.local]))));
        return { model: new PagedModel(servers), onDidChangeModel: onDidChangeModel.event, disposables };
    }
    mergeChangedMcpServers(mcpServers, newMcpServers) {
        const oldMcpServers = [...mcpServers];
        const findPreviousMcpServerIndex = (from) => {
            let index = -1;
            const previousMcpServerInNew = newMcpServers[from];
            if (previousMcpServerInNew) {
                index = oldMcpServers.findIndex(e => e.id === previousMcpServerInNew.id);
                if (index === -1) {
                    return findPreviousMcpServerIndex(from - 1);
                }
            }
            return index;
        };
        let hasChanged = false;
        for (let index = 0; index < newMcpServers.length; index++) {
            const newMcpServer = newMcpServers[index];
            if (mcpServers.every(r => r.id !== newMcpServer.id)) {
                hasChanged = true;
                mcpServers.splice(findPreviousMcpServerIndex(index - 1) + 1, 0, newMcpServer);
            }
        }
        for (let index = mcpServers.length - 1; index >= 0; index--) {
            const oldMcpServer = mcpServers[index];
            if (newMcpServers.every(r => r.id !== oldMcpServer.id) && newMcpServers.some(r => r.name === oldMcpServer.name)) {
                hasChanged = true;
                mcpServers.splice(index, 1);
            }
        }
        if (!hasChanged) {
            if (mcpServers.length === newMcpServers.length) {
                for (let index = 0; index < newMcpServers.length; index++) {
                    if (mcpServers[index]?.id !== newMcpServers[index]?.id) {
                        hasChanged = true;
                        mcpServers = newMcpServers;
                        break;
                    }
                }
            }
        }
        return hasChanged ? mcpServers : undefined;
    }
};
McpServersListView = __decorate([
    __param(2, IKeybindingService),
    __param(3, IContextMenuService),
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IHoverService),
    __param(7, IConfigurationService),
    __param(8, IContextKeyService),
    __param(9, IViewDescriptorService),
    __param(10, IOpenerService),
    __param(11, IDialogService),
    __param(12, IMcpWorkbenchService),
    __param(13, IMcpGalleryManifestService),
    __param(14, IWorkbenchLayoutService),
    __param(15, IMarkdownRendererService),
    __param(16, ILogService)
], McpServersListView);
export { McpServersListView };
let McpServerRenderer = class McpServerRenderer {
    static { McpServerRenderer_1 = this; }
    static { this.templateId = 'mcpServer'; }
    constructor(options, instantiationService, mcpWorkbenchService, notificationService) {
        this.options = options;
        this.instantiationService = instantiationService;
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.notificationService = notificationService;
        this.templateId = McpServerRenderer_1.templateId;
    }
    renderTemplate(root) {
        const element = dom.append(root, dom.$('.mcp-server-item.extension-list-item'));
        const iconContainer = dom.append(element, dom.$('.icon-container'));
        const iconWidget = this.instantiationService.createInstance(McpServerIconWidget, iconContainer);
        const details = dom.append(element, dom.$('.details'));
        const headerContainer = dom.append(details, dom.$('.header-container'));
        const header = dom.append(headerContainer, dom.$('.header'));
        const name = dom.append(header, dom.$('span.name'));
        const starred = dom.append(header, dom.$('span.ratings'));
        const description = dom.append(details, dom.$('.description.ellipsis'));
        const footer = dom.append(details, dom.$('.footer'));
        const publisherWidget = this.instantiationService.createInstance(PublisherWidget, dom.append(footer, dom.$('.publisher-container')), true);
        const actionbar = new ActionBar(footer, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof DropDownAction) {
                    return action.createActionViewItem(options);
                }
                return undefined;
            },
            focusOnlyEnabledItems: true
        });
        actionbar.setFocusable(false);
        const actionBarListener = actionbar.onDidRun(({ error }) => error && this.notificationService.error(error));
        const mcpServerStatusAction = this.instantiationService.createInstance(McpServerStatusAction);
        const actions = [
            this.instantiationService.createInstance(InstallAction, true),
            this.instantiationService.createInstance(InstallingLabelAction),
            this.instantiationService.createInstance(ManageMcpServerAction, false),
            mcpServerStatusAction
        ];
        const widgets = [
            iconWidget,
            publisherWidget,
            this.instantiationService.createInstance(StarredWidget, starred, true),
            this.instantiationService.createInstance(McpServerScopeBadgeWidget, iconContainer),
            this.instantiationService.createInstance(McpServerHoverWidget, { target: root, position: this.options.hoverOptions.position }, mcpServerStatusAction)
        ];
        const extensionContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets]);
        actionbar.push(actions, { icon: true, label: true });
        const disposable = combinedDisposable(...actions, ...widgets, actionbar, actionBarListener, extensionContainers);
        return {
            root, element, name, description, starred, disposables: [disposable], actionbar,
            mcpServerDisposables: [],
            set mcpServer(mcpServer) {
                extensionContainers.mcpServer = mcpServer;
            }
        };
    }
    renderPlaceholder(index, data) {
        data.element.classList.add('loading');
        data.mcpServerDisposables = dispose(data.mcpServerDisposables);
        data.name.textContent = '';
        data.description.textContent = '';
        data.starred.style.display = 'none';
        data.mcpServer = null;
    }
    renderElement(mcpServer, index, data) {
        data.element.classList.remove('loading');
        data.mcpServerDisposables = dispose(data.mcpServerDisposables);
        data.root.setAttribute('data-mcp-server-id', mcpServer.id);
        data.name.textContent = mcpServer.label;
        data.description.textContent = mcpServer.description;
        data.starred.style.display = '';
        data.mcpServer = mcpServer;
        const updateEnablement = () => data.root.classList.toggle('disabled', !!mcpServer.runtimeStatus?.state && mcpServer.runtimeStatus.state !== 4 /* McpServerEnablementState.Enabled */);
        updateEnablement();
        data.mcpServerDisposables.push(this.mcpWorkbenchService.onChange(e => {
            if (!e || e.id === mcpServer.id) {
                updateEnablement();
            }
        }));
    }
    disposeElement(mcpServer, index, data) {
        data.mcpServerDisposables = dispose(data.mcpServerDisposables);
    }
    disposeTemplate(data) {
        data.mcpServerDisposables = dispose(data.mcpServerDisposables);
        data.disposables = dispose(data.disposables);
    }
};
McpServerRenderer = McpServerRenderer_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IMcpWorkbenchService),
    __param(3, INotificationService)
], McpServerRenderer);
export class DefaultBrowseMcpServersView extends McpServersListView {
    renderBody(container) {
        super.renderBody(container);
        this._register(this.mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => this.show()));
    }
    async show() {
        return super.show('@mcp');
    }
}
export class McpServersViewsContribution extends Disposable {
    static { this.ID = 'workbench.mcp.servers.views.contribution'; }
    constructor() {
        super();
        Registry.as(ViewExtensions.ViewsRegistry).registerViews([
            {
                id: InstalledMcpServersViewId,
                name: localize2('mcp-installed', "MCP Servers - Installed"),
                ctorDescriptor: new SyncDescriptor(McpServersListView, [{}]),
                when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext, ChatContextKeys.Setup.hidden.negate()),
                weight: 40,
                order: 4,
                canToggleVisibility: true
            },
            {
                id: 'workbench.views.mcp.default.marketplace',
                name: localize2('mcp', "MCP Servers"),
                ctorDescriptor: new SyncDescriptor(DefaultBrowseMcpServersView, [{}]),
                when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext.toNegated(), ChatContextKeys.Setup.hidden.negate(), McpServersGalleryStatusContext.isEqualTo("available" /* McpGalleryManifestStatus.Available */), ContextKeyExpr.or(ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`), ProductQualityContext.notEqualsTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`))),
                weight: 40,
                order: 4,
                canToggleVisibility: true
            },
            {
                id: 'workbench.views.mcp.marketplace',
                name: localize2('mcp', "MCP Servers"),
                ctorDescriptor: new SyncDescriptor(McpServersListView, [{}]),
                when: ContextKeyExpr.and(SearchMcpServersContext, ChatContextKeys.Setup.hidden.negate(), McpServersGalleryStatusContext.isEqualTo("available" /* McpGalleryManifestStatus.Available */), ContextKeyExpr.or(ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`), ProductQualityContext.notEqualsTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`))),
            },
            {
                id: 'workbench.views.mcp.default.welcomeView',
                name: localize2('mcp', "MCP Servers"),
                ctorDescriptor: new SyncDescriptor(DefaultBrowseMcpServersView, [{ showWelcome: true }]),
                when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext.toNegated(), ChatContextKeys.Setup.hidden.negate(), McpServersGalleryStatusContext.isEqualTo("available" /* McpGalleryManifestStatus.Available */), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`).negate(), ProductQualityContext.isEqualTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`).negate()),
                weight: 40,
                order: 4,
                canToggleVisibility: true
            },
            {
                id: 'workbench.views.mcp.welcomeView',
                name: localize2('mcp', "MCP Servers"),
                ctorDescriptor: new SyncDescriptor(McpServersListView, [{ showWelcome: true }]),
                when: ContextKeyExpr.and(SearchMcpServersContext, ChatContextKeys.Setup.hidden.negate(), McpServersGalleryStatusContext.isEqualTo("available" /* McpGalleryManifestStatus.Available */), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`).negate(), ProductQualityContext.isEqualTo('stable'), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`).negate()),
            }
        ], VIEW_CONTAINER);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyc1ZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvYnJvd3Nlci9tY3BTZXJ2ZXJzVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyw0QkFBNEIsQ0FBQztBQUNwQyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUUvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUosT0FBTyxFQUFFLGlCQUFpQixFQUFlLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BILE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFx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