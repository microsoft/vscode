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
import '../../../browser/media/sidebarActionButton.css';
import './media/accountWidget.css';
import './media/accountTitleBarWidget.css';
import '../../../../workbench/contrib/chat/browser/chatStatus/media/chatStatus.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { appendUpdateMenuItems as registerUpdateMenuItems } from '../../../../workbench/contrib/update/browser/update.js';
import { Menus } from '../../../browser/menus.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { $, addDisposableListener, append, disposableWindowInterval, EventType, getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Separator } from '../../../../base/common/actions.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { URI } from '../../../../base/common/uri.js';
import { UpdateHoverWidget } from './updateHoverWidget.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatStatusDashboard } from '../../../../workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { getAccountTitleBarBadgeKey, getAccountTitleBarState } from './accountTitleBarState.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
// --- Account Menu Items --- //
const AccountMenu = new MenuId('SessionsAccountMenu');
const SessionsTitleBarAccountWidgetAction = 'sessions.action.titleBarAccountWidget';
const SessionsTitleBarUpdateWidgetAction = 'sessions.action.titleBarUpdateWidget';
const SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH = 280;
function shouldHideSessionsTitleBarUpdateWidget(type) {
    return type === "uninitialized" /* StateType.Uninitialized */
        || type === "idle" /* StateType.Idle */
        || type === "disabled" /* StateType.Disabled */
        || type === "checking for updates" /* StateType.CheckingForUpdates */;
}
function isPrimarySessionsTitleBarUpdateWidget(type) {
    return type === "available for download" /* StateType.AvailableForDownload */
        || type === "downloaded" /* StateType.Downloaded */
        || type === "ready" /* StateType.Ready */;
}
function isBusySessionsTitleBarUpdateWidget(type) {
    return type === "downloading" /* StateType.Downloading */
        || type === "overwriting" /* StateType.Overwriting */
        || type === "updating" /* StateType.Updating */
        || type === "restarting" /* StateType.Restarting */;
}
function getSessionsTitleBarUpdateLabel(state) {
    switch (state.type) {
        case "available for download" /* StateType.AvailableForDownload */:
            return localize('sessionsTitleBarUpdateAvailable', "Update Available");
        case "downloaded" /* StateType.Downloaded */:
            return localize('sessionsTitleBarInstallUpdate', "Install Update");
        case "ready" /* StateType.Ready */:
            return localize('sessionsTitleBarRestartToUpdate', "Restart to Update");
        case "downloading" /* StateType.Downloading */:
        case "overwriting" /* StateType.Overwriting */:
            return localize('sessionsTitleBarDownloading', "Downloading...");
        case "updating" /* StateType.Updating */:
        case "restarting" /* StateType.Restarting */:
            return localize('sessionsTitleBarInstalling', "Installing...");
        default:
            return localize('sessionsTitleBarUpdate', "Update");
    }
}
function getSessionsTitleBarUpdateAriaLabel(state) {
    switch (state.type) {
        case "available for download" /* StateType.AvailableForDownload */:
            return localize('sessionsTitleBarUpdateAvailableAria', "Update available");
        case "downloaded" /* StateType.Downloaded */:
            return localize('sessionsTitleBarInstallUpdateAria', "Install downloaded update");
        case "ready" /* StateType.Ready */:
            return localize('sessionsTitleBarRestartToUpdateAria', "Restart to apply update");
        case "downloading" /* StateType.Downloading */:
        case "overwriting" /* StateType.Overwriting */:
            return localize('sessionsTitleBarDownloadingAria', "Update download in progress");
        case "updating" /* StateType.Updating */:
        case "restarting" /* StateType.Restarting */:
            return localize('sessionsTitleBarInstallingAria', "Update install in progress");
        default:
            return localize('sessionsTitleBarUpdateAria', "Update");
    }
}
async function runSessionsUpdateAction(state, updateService, openerService, productService, dialogService, hostService) {
    if (state.type === "available for download" /* StateType.AvailableForDownload */ && state.canInstall === false) {
        const { confirmed } = await dialogService.confirm({
            message: localize('sessionsUpdateFromVSCode.title', "Update from VS Code"),
            detail: localize('sessionsUpdateFromVSCode.detail', "This will close the Agents app and open VS Code so you can install the update.\n\nLaunch Agents again after the update is complete."),
            primaryButton: localize('sessionsUpdateFromVSCode.open', "Close and Open VS Code"),
        });
        if (confirmed) {
            await openerService.open(URI.from({
                scheme: productService.urlProtocol,
                query: 'windowId=_blank',
            }), { openExternal: true });
            await hostService.close();
        }
        return;
    }
    if (state.type === "available for download" /* StateType.AvailableForDownload */) {
        await updateService.downloadUpdate(true);
        return;
    }
    if (state.type === "ready" /* StateType.Ready */) {
        await updateService.quitAndInstall();
        return;
    }
    if (state.type === "downloaded" /* StateType.Downloaded */) {
        await updateService.applyUpdate();
    }
}
// Sign In (shown when signed out)
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.agenticSignIn',
            title: localize2('signIn', 'Sign In'),
            menu: {
                id: AccountMenu,
                when: ContextKeyExpr.notEquals('defaultAccountStatus', 'available'),
                group: '1_account',
                order: 1,
            }
        });
    }
    async run(accessor) {
        const defaultAccountService = accessor.get(IDefaultAccountService);
        await defaultAccountService.signIn();
    }
});
// Sign Out (shown when signed in)
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.agenticSignOut',
            title: localize2('signOut', 'Sign Out'),
            menu: {
                id: AccountMenu,
                when: ContextKeyExpr.equals('defaultAccountStatus', 'available'),
                group: '1_account',
                order: 1,
            }
        });
    }
    async run(accessor) {
        const defaultAccountService = accessor.get(IDefaultAccountService);
        await defaultAccountService.signOut();
    }
});
// Settings
MenuRegistry.appendMenuItem(AccountMenu, {
    command: {
        id: 'workbench.action.openSettings',
        title: localize('settings', "Settings"),
    },
    group: '2_settings',
    order: 1,
});
// Update actions
registerUpdateMenuItems(AccountMenu, '3_updates');
let TitleBarAccountWidget = class TitleBarAccountWidget extends BaseActionViewItem {
    constructor(action, options, defaultAccountService, menuService, contextKeyService, hoverService, instantiationService, chatEntitlementService) {
        super(undefined, action, options);
        this.defaultAccountService = defaultAccountService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.hoverService = hoverService;
        this.instantiationService = instantiationService;
        this.chatEntitlementService = chatEntitlementService;
        this.isAccountLoading = true;
        this.accountRequestCounter = 0;
        this.isMenuVisible = false;
        this.copilotDashboardStore = this._register(new MutableDisposable());
        this.clickPanelDisposable = this._register(new MutableDisposable());
        this.lastState = getAccountTitleBarState({
            isAccountLoading: true,
            entitlement: this.chatEntitlementService.entitlement,
            sentiment: this.chatEntitlementService.sentiment,
            quotas: this.chatEntitlementService.quotas,
        });
        this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
        this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderState()));
        this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderState()));
        this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderState()));
        this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderState()));
        this.refreshAccount();
    }
    render(container) {
        super.render(container);
        this.container = container;
        container.classList.add('sessions-account-titlebar-widget');
        this.iconElement = append(container, $('.sessions-account-titlebar-widget-icon'));
        this.labelElement = append(container, $('span.sessions-account-titlebar-widget-label'));
        this.badgeElement = append(container, $('span.sessions-account-titlebar-widget-badge'));
        this.renderState();
    }
    onClick() {
        if (!this.container) {
            return;
        }
        this.showCombinedPanel();
    }
    async refreshAccount() {
        const requestId = ++this.accountRequestCounter;
        this.isAccountLoading = true;
        this.renderState();
        const account = await this.defaultAccountService.getDefaultAccount();
        if (requestId !== this.accountRequestCounter) {
            return;
        }
        this.accountName = account?.accountName;
        this.accountProviderLabel = account?.authenticationProvider.name;
        this.isAccountLoading = false;
        this.renderState();
    }
    renderState() {
        if (!this.container || !this.iconElement || !this.labelElement || !this.badgeElement) {
            return;
        }
        const state = getAccountTitleBarState({
            isAccountLoading: this.isAccountLoading,
            accountName: this.accountName,
            accountProviderLabel: this.accountProviderLabel,
            entitlement: this.chatEntitlementService.entitlement,
            sentiment: this.chatEntitlementService.sentiment,
            quotas: this.chatEntitlementService.quotas,
        });
        this.lastState = state;
        this.container.classList.remove('kind-default', 'kind-accent', 'kind-warning', 'kind-prominent');
        this.container.classList.add(`kind-${state.kind}`);
        this.container.classList.toggle('menu-visible', this.isMenuVisible);
        this.container.setAttribute('aria-label', state.ariaLabel);
        const badgeKey = getAccountTitleBarBadgeKey(state);
        if (badgeKey !== this.lastBadgeKey) {
            this.lastBadgeKey = badgeKey;
            this.dismissedBadgeKey = undefined;
        }
        const shouldShowDotBadge = !!badgeKey && badgeKey !== this.dismissedBadgeKey;
        const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;
        this.iconElement.className = `sessions-account-titlebar-widget-icon ${ThemeIcon.asClassName(titleBarIcon)}`;
        this.labelElement.textContent = '';
        this.badgeElement.textContent = '';
        this.badgeElement.classList.toggle('dot-badge', shouldShowDotBadge);
        this.badgeElement.classList.toggle('dot-badge-warning', shouldShowDotBadge && state.dotBadge === 'warning');
        this.badgeElement.classList.toggle('dot-badge-error', shouldShowDotBadge && state.dotBadge === 'error');
        this.badgeElement.style.display = shouldShowDotBadge ? '' : 'none';
    }
    getHoverTarget() {
        const { left, width } = getDomNodePagePosition(this.container);
        return {
            targetElements: [this.container],
            x: left + width - SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH,
        };
    }
    showCombinedPanel() {
        if (!this.container) {
            return;
        }
        if (this.isMenuVisible) {
            this.hoverService.hideHover(true);
            this.clickPanelDisposable.clear();
            return;
        }
        this.hoverService.hideHover(true);
        this.clickPanelDisposable.clear();
        const panelStore = new DisposableStore();
        this.clickPanelDisposable.value = panelStore;
        const badgeKey = getAccountTitleBarBadgeKey(this.lastState);
        if (badgeKey) {
            this.dismissedBadgeKey = badgeKey;
        }
        this.isMenuVisible = true;
        this.container.classList.add('menu-visible');
        this.renderState();
        panelStore.add({
            dispose: () => {
                this.isMenuVisible = false;
                this.container?.classList.remove('menu-visible');
                this.renderState();
            }
        });
        const panelContent = this.createCombinedPanelContent(panelStore);
        const hoverWidget = this.hoverService.showInstantHover({
            content: panelContent,
            target: this.getHoverTarget(),
            additionalClasses: ['sessions-account-titlebar-panel-hover'],
            position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
            persistence: { sticky: true, hideOnHover: false },
            appearance: { showPointer: false, skipFadeInAnimation: true, maxHeightRatio: 0.8 },
        }, true);
        if (hoverWidget) {
            panelStore.add(hoverWidget);
        }
        panelStore.add(disposableWindowInterval(mainWindow, () => {
            if (!panelContent.isConnected || hoverWidget?.isDisposed) {
                this.clickPanelDisposable.clear();
            }
        }, 500));
    }
    createCombinedPanelContent(panelStore) {
        const panel = $('div.sessions-account-titlebar-panel');
        const headerSection = append(panel, $('.sessions-account-titlebar-panel-header'));
        const title = append(headerSection, $('div.sessions-account-titlebar-panel-title'));
        title.textContent = this.getPanelHeaderLabel();
        const headerActions = this.getHeaderActions();
        if (headerActions.length > 0) {
            const headerActionsContainer = append(headerSection, $('.sessions-account-titlebar-panel-header-actions'));
            for (const action of headerActions) {
                const button = append(headerActionsContainer, $('button.sessions-account-titlebar-panel-header-action', { type: 'button' }));
                button.disabled = !action.enabled;
                button.setAttribute('aria-label', action.tooltip || action.label);
                button.title = action.tooltip || action.label;
                button.classList.add(...ThemeIcon.asClassNameArray(this.getHeaderActionIcon(action)));
                panelStore.add(addDisposableListener(button, EventType.CLICK, async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.hoverService.hideHover(true);
                    this.clickPanelDisposable.clear();
                    await Promise.resolve(action.run());
                }));
            }
        }
        const actions = this.getPanelActions();
        if (actions.length > 0) {
            const actionsSection = append(panel, $('.sessions-account-titlebar-panel-actions'));
            let lastWasSeparator = true;
            for (const action of actions) {
                if (action instanceof Separator) {
                    if (!lastWasSeparator) {
                        append(actionsSection, $('.sessions-account-titlebar-panel-separator'));
                        lastWasSeparator = true;
                    }
                    continue;
                }
                lastWasSeparator = false;
                const button = append(actionsSection, $('button.sessions-account-titlebar-panel-action', { type: 'button' }));
                button.disabled = !action.enabled;
                button.setAttribute('aria-label', action.tooltip || action.label);
                button.classList.toggle('checked', !!action.checked);
                append(button, ...renderLabelWithIcons(action.label));
                panelStore.add(addDisposableListener(button, EventType.CLICK, async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.hoverService.hideHover(true);
                    this.clickPanelDisposable.clear();
                    await Promise.resolve(action.run());
                }));
            }
        }
        const contentSection = append(panel, $('.sessions-account-titlebar-panel-content'));
        if (this.shouldShowCopilotDashboardHover()) {
            append(contentSection, this.createCopilotHoverContent());
        }
        else if (!this.isAccountLoading) {
            const summary = append(contentSection, $('.sessions-account-titlebar-panel-summary'));
            summary.textContent = this.lastState.ariaLabel;
        }
        return panel;
    }
    getPanelHeaderLabel() {
        if (this.accountName) {
            return localize('signedInAsHeader', "Signed in as {0}", this.accountName);
        }
        if (this.isAccountLoading) {
            return localize('loadingAccountHeader', "Loading Account...");
        }
        return localize('accountMenuHeaderFallback', "Account");
    }
    getHeaderActions() {
        const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
        const rawActions = [];
        fillInActionBarActions(menu.getActions(), rawActions);
        menu.dispose();
        const settingsAction = rawActions.find(action => !(action instanceof Separator) && action.id === 'workbench.action.openSettings');
        const signOutAction = rawActions.find(action => !(action instanceof Separator) && action.id === 'workbench.action.agenticSignOut');
        return [settingsAction, signOutAction].filter((action) => !!action);
    }
    getPanelActions() {
        const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
        const rawActions = [];
        fillInActionBarActions(menu.getActions(), rawActions);
        menu.dispose();
        return rawActions.filter(action => {
            if (action instanceof Separator) {
                return true;
            }
            // Hide sign-in while account is still loading
            if (this.isAccountLoading && action.id === 'workbench.action.agenticSignIn') {
                return false;
            }
            return action.id !== 'workbench.action.agenticSignOut'
                && action.id !== 'workbench.action.openSettings'
                && !action.id.startsWith('update.');
        });
    }
    getHeaderActionIcon(action) {
        switch (action.id) {
            case 'workbench.action.openSettings':
                return Codicon.settingsGear;
            case 'workbench.action.agenticSignOut':
                return Codicon.signOut;
            default:
                return Codicon.circleLargeFilled;
        }
    }
    shouldShowCopilotDashboardHover() {
        return !this.chatEntitlementService.sentiment.hidden && !!this.accountName;
    }
    createCopilotHoverContent() {
        const store = new DisposableStore();
        this.copilotDashboardStore.value = store;
        const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
            disableInlineSuggestionsSettings: true,
            disableModelSelection: true,
            disableProviderOptions: true,
            disableCompletionsSnooze: true,
            disableContributions: true,
        });
        store.add(disposableWindowInterval(mainWindow, () => {
            if (!dashboardElement.isConnected) {
                store.dispose();
            }
        }, 2000));
        return dashboardElement;
    }
};
TitleBarAccountWidget = __decorate([
    __param(2, IDefaultAccountService),
    __param(3, IMenuService),
    __param(4, IContextKeyService),
    __param(5, IHoverService),
    __param(6, IInstantiationService),
    __param(7, IChatEntitlementService)
], TitleBarAccountWidget);
let TitleBarUpdateWidget = class TitleBarUpdateWidget extends BaseActionViewItem {
    constructor(action, options, updateService, hoverService, productService, openerService, dialogService, hostService) {
        super(undefined, action, options);
        this.updateService = updateService;
        this.hoverService = hoverService;
        this.productService = productService;
        this.openerService = openerService;
        this.dialogService = dialogService;
        this.hostService = hostService;
        this.hoverAttachment = this._register(new MutableDisposable());
        this.updateHoverWidget = new UpdateHoverWidget(this.updateService, this.productService, this.hoverService);
        this._register(this.updateService.onStateChange(() => this.renderState()));
    }
    render(container) {
        super.render(container);
        this.container = container;
        container.classList.add('sessions-update-titlebar-widget');
        this.labelElement = append(container, $('span.sessions-update-titlebar-widget-label'));
        this.hoverAttachment.value = this.updateHoverWidget.attachTo(container);
        this.renderState();
    }
    onClick() {
        const state = this.updateService.state;
        if (shouldHideSessionsTitleBarUpdateWidget(state.type) || isBusySessionsTitleBarUpdateWidget(state.type)) {
            return;
        }
        void runSessionsUpdateAction(state, this.updateService, this.openerService, this.productService, this.dialogService, this.hostService);
    }
    renderState() {
        if (!this.container || !this.labelElement) {
            return;
        }
        const state = this.updateService.state;
        const hidden = shouldHideSessionsTitleBarUpdateWidget(state.type);
        const busy = isBusySessionsTitleBarUpdateWidget(state.type);
        const primary = isPrimarySessionsTitleBarUpdateWidget(state.type);
        this.container.classList.toggle('hidden', hidden);
        this.container.classList.toggle('disabled', busy);
        this.container.classList.toggle('primary-state', primary);
        this.container.classList.toggle('busy-state', busy);
        if (hidden) {
            this.container.removeAttribute('aria-label');
            this.labelElement.textContent = '';
            return;
        }
        this.container.setAttribute('aria-label', getSessionsTitleBarUpdateAriaLabel(state));
        this.labelElement.textContent = getSessionsTitleBarUpdateLabel(state);
    }
};
TitleBarUpdateWidget = __decorate([
    __param(2, IUpdateService),
    __param(3, IHoverService),
    __param(4, IProductService),
    __param(5, IOpenerService),
    __param(6, IDialogService),
    __param(7, IHostService)
], TitleBarUpdateWidget);
// --- Register custom view item --- //
let AccountWidgetContribution = class AccountWidgetContribution extends Disposable {
    static { this.ID = 'workbench.contrib.sessionsWidget'; }
    constructor(actionViewItemService, instantiationService) {
        super();
        // Titlebar update widget (to the right of separator, left of account badge)
        this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarUpdateWidgetAction, (action, options) => {
            return instantiationService.createInstance(TitleBarUpdateWidget, action, options);
        }, undefined));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: SessionsTitleBarUpdateWidgetAction,
                    title: localize2('agentsUpdateTitleBar', "Agents Update"),
                    menu: {
                        id: Menus.TitleBarRightLayout,
                        group: 'navigation',
                        order: 99,
                        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
                    }
                });
            }
            async run() {
                // Handled by the custom view item
            }
        }));
        // Titlebar account widget (rightmost in titlebar)
        this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarAccountWidgetAction, (action, options) => {
            return instantiationService.createInstance(TitleBarAccountWidget, action, options);
        }, undefined));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: SessionsTitleBarAccountWidgetAction,
                    title: localize2('agentsAccountStatusTitleBar', "Agents Account and Status"),
                    menu: {
                        id: Menus.TitleBarRightLayout,
                        group: 'navigation',
                        order: 100,
                    }
                });
            }
            async run() {
                // Handled by the custom view item
            }
        }));
    }
};
AccountWidgetContribution = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService)
], AccountWidgetContribution);
registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjb3VudC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FjY291bnRNZW51L2Jyb3dzZXIvYWNjb3VudC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxnREFBZ0QsQ0FBQztBQUN4RCxPQUFPLDJCQUEyQixDQUFDO0FBQ25DLE9BQU8sbUNBQW1DLENBQUM7QUFDM0MsT0FBTyw0RUFBNEUsQ0FBQztBQUNwRixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5SCxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0sK0NBQStDLENBQUM7QUFDdkksT0FBTyxFQUFFLHFCQUFxQixJQUFJLHVCQUF1QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDMUgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFD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