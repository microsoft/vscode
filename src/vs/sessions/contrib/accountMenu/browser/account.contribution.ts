/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/accountWidget.css';
import './media/accountTitleBarWidget.css';
import '../../../../workbench/contrib/chat/browser/chatStatus/media/chatStatus.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { appendUpdateMenuItems as registerUpdateMenuItems } from '../../../../workbench/contrib/update/browser/update.js';
import { Menus } from '../../../browser/menus.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { $, append, disposableWindowInterval, getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ActionViewItem, BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { URI } from '../../../../base/common/uri.js';
import { UpdateHoverWidget } from './updateHoverWidget.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatStatusDashboard } from '../../../../workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { getAccountTitleBarState } from './accountTitleBarState.js';

// --- Account Menu Items --- //
const AccountMenu = new MenuId('SessionsAccountMenu');
const SessionsTitleBarAccountWidgetAction = 'sessions.action.titleBarAccountWidget';
const SIMULATE_SESSIONS_UPDATE_AVAILABLE = true;
const SIMULATED_SESSIONS_UPDATE_STATE = State.AvailableForDownload({
	version: 'b7c2d9f',
	productVersion: '1.115.0',
	timestamp: Date.now() - (2 * 60 * 60 * 1000),
}, false);

function getSessionsUpdateState(updateService: IUpdateService): State {
	return SIMULATE_SESSIONS_UPDATE_AVAILABLE ? SIMULATED_SESSIONS_UPDATE_STATE : updateService.state;
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
	async run(accessor: ServicesAccessor): Promise<void> {
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
	async run(accessor: ServicesAccessor): Promise<void> {
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

export class AccountWidget extends ActionViewItem {

	private accountButton: Button | undefined;
	private copilotStatusButton: Button | undefined;
	private copilotStatusContainer: HTMLElement | undefined;
	private updateButton: Button | undefined;
	private readonly updateHoverWidget: UpdateHoverWidget;
	private readonly viewItemDisposables = this._register(new DisposableStore());
	private readonly copilotDashboardStore = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action, { ...options, icon: false, label: false });
		this.updateHoverWidget = new UpdateHoverWidget(this.updateService, this.productService, this.hoverService);
	}

	protected override getTooltip(): string | undefined {
		return undefined;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('account-widget', 'sidebar-action');

		// Account button (left)
		const accountContainer = append(container, $('.account-widget-account'));
		this.accountButton = this.viewItemDisposables.add(new Button(accountContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this.accountButton.element.classList.add('account-widget-account-button', 'sidebar-action-button');

		// Copilot status button (between account and update)
		this.copilotStatusContainer = append(container, $('.account-widget-copilot-status'));
		this.copilotStatusButton = this.viewItemDisposables.add(new Button(this.copilotStatusContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this.copilotStatusButton.element.classList.add('account-widget-copilot-status-button', 'sidebar-action-button');

		// Update button (right)
		const updateContainer = append(container, $('.account-widget-update'));
		this.updateButton = this.viewItemDisposables.add(new Button(updateContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this.updateButton.element.classList.add('account-widget-update-button', 'sidebar-action-button');
		this.viewItemDisposables.add(this.updateHoverWidget.attachTo(this.updateButton.element));

		this.updateAccountButton();
		this.viewItemDisposables.add(this.defaultAccountService.onDidChangeDefaultAccount(() => this.updateAccountButton()));
		this.updateUpdateButton();
		this.viewItemDisposables.add(this.updateService.onStateChange(() => this.updateUpdateButton()));

		this.viewItemDisposables.add(this.accountButton.onDidClick(e => {
			e?.preventDefault();
			e?.stopPropagation();
			this.showAccountMenu(this.accountButton!.element);
		}));

		this.viewItemDisposables.add(this.updateButton.onDidClick(() => this.update()));

		// Copilot status: update icon and show/hide based on update button
		this.updateCopilotStatusButton();
		this.viewItemDisposables.add(this.chatEntitlementService.onDidChangeEntitlement(() => this.updateCopilotStatusButton()));
		this.viewItemDisposables.add(this.chatEntitlementService.onDidChangeSentiment(() => this.updateCopilotStatusButton()));
		this.viewItemDisposables.add(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.updateCopilotStatusButton()));
		this.viewItemDisposables.add(this.chatSessionsService.onDidChangeInProgress(() => this.updateCopilotStatusButton()));

		this.viewItemDisposables.add(this.copilotStatusButton.onDidClick(e => {
			e?.preventDefault();
			e?.stopPropagation();
			this.showCopilotStatusDashboard(this.copilotStatusButton!.element);
		}));
	}

	private showAccountMenu(anchor: HTMLElement): void {
		const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
		const actions: IAction[] = [];
		fillInActionBarActions(menu.getActions(), actions);
		menu.dispose();

		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
		});
	}

	private updateCopilotStatusButton(): void {
		if (!this.copilotStatusButton || !this.copilotStatusContainer) {
			return;
		}

		this.copilotStatusContainer.classList.remove('hidden');

		let icon = Codicon.copilot.id;
		const chatQuotaExceeded = this.chatEntitlementService.quotas.chat?.percentRemaining === 0;
		const completionsQuotaExceeded = this.chatEntitlementService.quotas.completions?.percentRemaining === 0;

		if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
			icon = 'copilot-not-connected';
		} else if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && (chatQuotaExceeded || completionsQuotaExceeded)) {
			icon = 'copilot-warning';
		}

		this.copilotStatusButton.label = `$(${icon})`;
		this.copilotStatusButton.element.setAttribute('aria-label', localize('copilotStatus', "Copilot status"));

		// Hide when update button is visible
		this.updateCopilotStatusVisibility();
	}

	private updateCopilotStatusVisibility(): void {
		if (!this.copilotStatusContainer || !this.updateButton) {
			return;
		}

		const updateVisible = !this.updateButton.element.classList.contains('hidden');
		this.copilotStatusContainer.classList.toggle('hidden', updateVisible || this.chatEntitlementService.sentiment.hidden);
	}

	private showCopilotStatusDashboard(anchor: HTMLElement): void {
		const store = new DisposableStore();
		this.copilotDashboardStore.value = store;
		const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
			disableInlineSuggestionsSettings: true,
			disableModelSelection: true,
			disableProviderOptions: true,
			disableCompletionsSnooze: true,
			disableContributions: true,
		});

		this.hoverService.showInstantHover({
			content: dashboardElement,
			target: anchor,
			position: { hoverPosition: HoverPosition.ABOVE },
			persistence: { sticky: true, hideOnHover: false },
			appearance: { skipFadeInAnimation: true },
		});

		// Dispose the dashboard when the hover is hidden
		store.add(disposableWindowInterval(mainWindow, () => {
			if (!dashboardElement.isConnected) {
				store.dispose();
			}
		}, 2000));
	}

	private async updateAccountButton(): Promise<void> {
		if (!this.accountButton) {
			return;
		}
		this.accountButton.label = `$(${Codicon.loading.id}~spin) ${localize('loadingAccount', "Loading account...")}`;
		this.accountButton.enabled = false;
		const account = await this.defaultAccountService.getDefaultAccount();
		this.accountButton.enabled = true;
		this.accountButton.label = account
			? `$(${Codicon.account.id}) ${account.accountName} (${account.authenticationProvider.name})`
			: `$(${Codicon.account.id}) ${localize('signInLabel', "Sign In")}`;
	}

	private updateUpdateButton(): void {
		if (!this.updateButton) {
			return;
		}

		const state = getSessionsUpdateState(this.updateService);

		// In the embedded app, updates are detected but cannot be installed directly.
		// Show a hint button to update via VS Code only when an update is actually available.
		if (state.type === StateType.AvailableForDownload && state.canInstall === false) {
			this.updateButton.element.classList.remove('hidden');
			this.updateButton.element.classList.remove('account-widget-update-button-ready');
			this.updateButton.element.classList.add('account-widget-update-button-hint');
			this.updateButton.enabled = true;
			this.updateButton.label = localize('updateAvailable', "Update Available");
			this.updateButton.element.title = localize('updateInVSCodeHover', "Updates are managed by VS Code. Click to open VS Code.");
		} else if (this.shouldHideUpdateButton(state.type)) {
			this.clearUpdateButtonStyling();
			this.updateButton.element.classList.add('hidden');
		} else {
			this.updateButton.element.classList.remove('hidden');
			this.updateButton.element.style.backgroundImage = '';
			this.updateButton.enabled = state.type === StateType.Ready;
			this.updateButton.label = this.getUpdateProgressMessage(state.type);

			if (state.type === StateType.Ready) {
				this.updateButton.element.classList.add('account-widget-update-button-ready');
			} else {
				this.updateButton.element.classList.remove('account-widget-update-button-ready');
			}
		}

		this.updateCopilotStatusVisibility();
	}

	private shouldHideUpdateButton(type: StateType): boolean {
		return type === StateType.Uninitialized
			|| type === StateType.Idle
			|| type === StateType.Disabled
			|| type === StateType.CheckingForUpdates;
	}

	private clearUpdateButtonStyling(): void {
		if (this.updateButton) {
			this.updateButton.element.style.backgroundImage = '';
			this.updateButton.element.classList.remove('account-widget-update-button-ready');
		}
	}

	private getUpdateProgressMessage(type: StateType): string {
		switch (type) {
			case StateType.Ready:
				return localize('update', "Update");
			case StateType.AvailableForDownload:
			case StateType.Downloading:
			case StateType.Overwriting:
				return localize('downloadingUpdate', "Downloading...");
			case StateType.Downloaded:
				return localize('installingUpdate', "Installing...");
			case StateType.Updating:
				return localize('updatingApp', "Updating...");
			default:
				return localize('updating', "Updating...");
		}
	}

	private async update(): Promise<void> {
		const state = getSessionsUpdateState(this.updateService);
		if (state.type === StateType.AvailableForDownload && state.canInstall === false) {
			const { confirmed } = await this.dialogService.confirm({
				message: localize('updateFromVSCode.title', "Update from VS Code"),
				detail: localize('updateFromVSCode.detail', "This will close the Agents app and open VS Code so you can install the update.\n\nLaunch Agents again after the update is complete."),
				primaryButton: localize('updateFromVSCode.open', "Close and Open VS Code"),
			});
			if (confirmed) {
				await this.openVSCode();
				await this.hostService.close();
			}
			return;
		}
		await this.updateService.quitAndInstall();
	}

	private async openVSCode(): Promise<void> {
		await this.openerService.open(URI.from({
			scheme: this.productService.urlProtocol,
			query: 'windowId=_blank',
		}), { openExternal: true });
	}


	override onClick(): void {
		// Handled by custom click handlers
	}
}

class TitleBarAccountWidget extends BaseActionViewItem {

	private container: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined;
	private labelElement: HTMLElement | undefined;
	private badgeElement: HTMLElement | undefined;
	private readonly hoverDisposable = this._register(new MutableDisposable());
	private readonly updateHoverWidget: UpdateHoverWidget;
	private accountName: string | undefined;
	private accountProviderLabel: string | undefined;
	private isAccountLoading = true;
	private accountRequestCounter = 0;
	private lastState: ReturnType<typeof getAccountTitleBarState>;
	private isMenuVisible = false;
	private readonly copilotDashboardStore = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
	) {
		super(undefined, action, options);

		this.updateHoverWidget = new UpdateHoverWidget(this.updateService, this.productService, this.hoverService);
		this.lastState = getAccountTitleBarState({
			isAccountLoading: true,
			updateState: getSessionsUpdateState(this.updateService),
			entitlement: this.chatEntitlementService.entitlement,
			sentiment: this.chatEntitlementService.sentiment,
			quotas: this.chatEntitlementService.quotas,
		});

		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
		this._register(this.updateService.onStateChange(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderState()));
		this.refreshAccount();
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.container = container;
		container.classList.add('sessions-account-titlebar-widget');

		this.iconElement = append(container, $('.sessions-account-titlebar-widget-icon'));
		this.labelElement = append(container, $('span.sessions-account-titlebar-widget-label'));
		this.badgeElement = append(container, $('span.sessions-account-titlebar-widget-badge'));

		this.renderState();
	}

	override onClick(): void {
		if (!this.container) {
			return;
		}

		if (this.lastState.source === 'update') {
			this.update();
			return;
		}

		if (this.lastState.source === 'copilot') {
			if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && (this.chatEntitlementService.quotas.chat?.percentRemaining === 0 || this.chatEntitlementService.quotas.completions?.percentRemaining === 0)) {
				this.commandService.executeCommand('workbench.action.chat.openQuotaExceededDialog');
				return;
			}
		}

		const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
		const actions: IAction[] = [];
		fillInActionBarActions(menu.getActions(), actions);
		menu.dispose();
		this.isMenuVisible = true;
		this.container.classList.add('menu-visible');

		this.contextMenuService.showContextMenu({
			getAnchor: () => this.container!,
			getActions: () => actions,
			onHide: () => {
				this.isMenuVisible = false;
				this.container?.classList.remove('menu-visible');
			},
		});
	}

	private async refreshAccount(): Promise<void> {
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

	private renderState(): void {
		if (!this.container || !this.iconElement || !this.labelElement || !this.badgeElement) {
			return;
		}

		const state = getAccountTitleBarState({
			isAccountLoading: this.isAccountLoading,
			accountName: this.accountName,
			accountProviderLabel: this.accountProviderLabel,
			updateState: getSessionsUpdateState(this.updateService),
			entitlement: this.chatEntitlementService.entitlement,
			sentiment: this.chatEntitlementService.sentiment,
			quotas: this.chatEntitlementService.quotas,
		});
		this.lastState = state;

		this.container.classList.remove('kind-default', 'kind-accent', 'kind-warning', 'kind-prominent');
		this.container.classList.add(`kind-${state.kind}`);
		this.container.classList.toggle('reveal-label-on-hover', !!state.revealLabelOnHover);
		this.container.classList.toggle('menu-visible', this.isMenuVisible);
		this.container.setAttribute('aria-label', state.ariaLabel);

		this.iconElement.className = `sessions-account-titlebar-widget-icon ${ThemeIcon.asClassName(state.icon)}`;
		this.labelElement.textContent = state.label;

		if (state.badge) {
			this.badgeElement.textContent = state.badge;
			this.badgeElement.style.display = '';
		} else {
			this.badgeElement.textContent = '';
			this.badgeElement.style.display = 'none';
		}

		this.hoverDisposable.clear();
		this.hoverDisposable.value = this.hoverService.setupDelayedHover(this.container, () => {
			const { left } = getDomNodePagePosition(this.container!);
			const hoverTarget = {
				targetElements: [this.container!],
				x: left - 8,
			};

			if (state.source === 'update') {
				return {
					content: this.updateHoverWidget.createHoverContent(getSessionsUpdateState(this.updateService)),
					target: hoverTarget,
					position: { hoverPosition: HoverPosition.BELOW },
					appearance: { showPointer: true },
				};
			}

			if (this.shouldShowCopilotDashboardHover()) {
				return {
					content: this.createCopilotHoverContent(),
					target: hoverTarget,
					position: { hoverPosition: HoverPosition.BELOW },
					appearance: { showPointer: true, skipFadeInAnimation: true },
				};
			}

			return {
				content: state.ariaLabel,
				target: hoverTarget,
				position: { hoverPosition: HoverPosition.BELOW },
				appearance: { showPointer: true },
			};
		}, {
			groupId: 'sessions-account-titlebar',
			reducedDelay: true,
		});
	}

	private shouldShowCopilotDashboardHover(): boolean {
		return this.chatEntitlementService.entitlement !== ChatEntitlement.Unknown && !this.chatEntitlementService.sentiment.hidden;
	}

	private createCopilotHoverContent(): HTMLElement {
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

	private async update(): Promise<void> {
		const state = getSessionsUpdateState(this.updateService);
		if (state.type === StateType.AvailableForDownload && state.canInstall === false) {
			const { confirmed } = await this.dialogService.confirm({
				message: localize('updateFromVSCode.title', "Update from VS Code"),
				detail: localize('updateFromVSCode.detail', "This will close the Agents app and open VS Code so you can install the update.\n\nLaunch Agents again after the update is complete."),
				primaryButton: localize('updateFromVSCode.open', "Close and Open VS Code"),
			});
			if (confirmed) {
				await this.openVSCode();
				await this.hostService.close();
			}
			return;
		}

		await this.updateService.quitAndInstall();
	}

	private async openVSCode(): Promise<void> {
		await this.openerService.open(URI.from({
			scheme: this.productService.urlProtocol,
			query: 'windowId=_blank',
		}), { openExternal: true });
	}
}

// --- Register custom view item --- //

class AccountWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWidget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarAccountWidgetAction, (action, options) => {
			return instantiationService.createInstance(TitleBarAccountWidget, action, options);
		}, undefined));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SessionsTitleBarAccountWidgetAction,
					title: localize2('agentsAccountStatusTitleBar', 'Agents Account and Status'),
					menu: {
						id: Menus.TitleBarRightLayout,
						group: 'navigation',
						order: 100,
					}
				});
			}

			async run(): Promise<void> {
				// Handled by the custom view item
			}
		}));

	}
}

registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, WorkbenchPhase.AfterRestored);
