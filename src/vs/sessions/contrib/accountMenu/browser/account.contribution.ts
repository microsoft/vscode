/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/accountWidget.css';
import './media/accountTitleBarWidget.css';
import '../../../../workbench/contrib/chat/browser/chatStatus/media/chatStatus.css';
import '../../../../workbench/contrib/chat/browser/media/copilotPrototypeShell.css';
import { CopilotPrototypeShellCoinStatusBarContribution, CopilotTBB3StatusBarContribution } from '../../../../workbench/contrib/chat/browser/copilotPrototypeShell.contribution.js';
import Severity from '../../../../base/common/severity.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2, IMenuService } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { appendUpdateMenuItems as registerUpdateMenuItems } from '../../../../workbench/contrib/update/browser/update.js';
import { Menus } from '../../../browser/menus.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { $, addDisposableListener, append, disposableWindowInterval, EventType, getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, Separator } from '../../../../base/common/actions.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerUpdateTitleBarMenuPlacement } from '../../../../workbench/contrib/update/browser/updateTitleBarEntry.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatStatusDashboard, IChatStatusDashboardOptions } from '../../../../workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { getAccountProfileImageUrl, getAccountTitleBarBadgeKey, getAccountTitleBarState, resolveAccountInfo } from '../../../browser/accountTitleBarState.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IAuthenticationAccessService } from '../../../../workbench/services/authentication/browser/authenticationAccessService.js';
import { IAuthenticationUsageService } from '../../../../workbench/services/authentication/browser/authenticationUsageService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { IChatDashboardService } from '../../../browser/chatDashboardService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

// --- Account Menu Items --- //
const AccountMenu = Menus.AccountMenu;
const SessionsTitleBarAccountWidgetAction = 'sessions.action.titleBarAccountWidget';
const SessionsTitleBarTBBWidgetAction = 'sessions.action.titleBarTBBWidget';
const SessionsTitleBarUBBWidgetAction = 'sessions.action.titleBarUBBWidget';
const SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH = 360;

const PERSONALIZE_ACTION_IDS: readonly string[] = [
	'workbench.action.openSettings',
	'workbench.action.openGlobalKeybindings',
	'workbench.action.selectTheme',
];
const SIGN_OUT_ACTION_ID = 'workbench.action.agenticSignOut';
const SIGN_IN_ACTION_ID = 'workbench.action.agenticSignIn';

// Register the shared VS Code update title bar entry into the Agents titlebar layout.
registerUpdateTitleBarMenuPlacement(Menus.TitleBarRightLayout, {
	when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
	group: 'navigation',
	order: 99,
});

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
		const dialogService = accessor.get(IDialogService);
		const authenticationService = accessor.get(IAuthenticationService);
		const authenticationUsageService = accessor.get(IAuthenticationUsageService);
		const authenticationAccessService = accessor.get(IAuthenticationAccessService);
		const defaultAccount = await defaultAccountService.getDefaultAccount();
		if (!defaultAccount) {
			return;
		}

		const providerId = defaultAccount.authenticationProvider.id;
		const accountLabel = defaultAccount.accountName;
		const { confirmed } = await dialogService.confirm({
			type: Severity.Info,
			message: localize('agenticSignOutMessage', "Sign out of the Agents app?"),
			detail: localize('agenticSignOutDetail', "This will sign out '{0}' from the Agents app.", accountLabel),
			primaryButton: localize({ key: 'agenticSignOutButton', comment: ['&& denotes a mnemonic'] }, "&&Sign Out")
		});

		if (!confirmed) {
			return;
		}

		const allSessions = await authenticationService.getSessions(providerId);
		const sessions = allSessions.filter(session => session.account.label === accountLabel);
		await Promise.all(sessions.map(session => authenticationService.removeSession(providerId, session.id)));
		authenticationUsageService.removeAccountUsage(providerId, accountLabel);
		authenticationAccessService.removeAllowedExtensions(providerId, accountLabel);
	}
});

// Color Theme (hidden on phone — no theme picker UI on mobile)
MenuRegistry.appendMenuItem(AccountMenu, {
	command: {
		id: 'workbench.action.selectTheme',
		title: localize('selectColorTheme', "Color Theme"),
	},
	when: IsPhoneLayoutContext.negate(),
	group: '2_settings',
	order: 1,
});

// Settings (hidden on phone — no settings UI on mobile)
MenuRegistry.appendMenuItem(AccountMenu, {
	command: {
		id: 'workbench.action.openSettings',
		title: localize('settings', "Settings"),
	},
	when: IsPhoneLayoutContext.negate(),
	group: '2_settings',
	order: 2,
});

// Keyboard Shortcuts (hidden on phone — no keybindings UI on mobile)
MenuRegistry.appendMenuItem(AccountMenu, {
	command: {
		id: 'workbench.action.openGlobalKeybindings',
		title: localize('sessionsAccountMenu.keyboardShortcuts', "Keyboard Shortcuts"),
	},
	when: IsPhoneLayoutContext.negate(),
	group: '2_settings',
	order: 3,
});

// Update actions
registerUpdateMenuItems(AccountMenu, '3_updates');

class TitleBarAccountWidget extends BaseActionViewItem {

	private container: HTMLElement | undefined;
	private avatarElement: HTMLImageElement | undefined;
	private iconElement: HTMLElement | undefined;
	private labelElement: HTMLElement | undefined;
	private badgeElement: HTMLElement | undefined;
	private accountName: string | undefined;
	private accountProviderId: string | undefined;
	private accountProviderLabel: string | undefined;
	private isAccountLoading = true;
	private accountRequestCounter = 0;
	private avatarRequestCounter = 0;
	private currentAvatarUrl: string | undefined;
	private loadedAvatarUrl: string | undefined;
	private lastState: ReturnType<typeof getAccountTitleBarState>;
	private isMenuVisible = false;
	private lastBadgeKey: string | undefined;
	private dismissedBadgeKey: string | undefined;
	private readonly copilotDashboardStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly clickPanelDisposable = this._register(new MutableDisposable<DisposableStore>());
	private readonly avatarLoadDisposable = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
	) {
		super(undefined, action, options);
		this.lastState = getAccountTitleBarState({
			isAccountLoading: true,
			entitlement: this.chatEntitlementService.entitlement,
			sentiment: this.chatEntitlementService.sentiment,
			quotas: this.chatEntitlementService.quotas,
		});

		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
		this._register(this.authenticationService.onDidChangeSessions(() => this.refreshAccount()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderState()));
		this.refreshAccount();
	}

	override setFocusable(_focusable: boolean): void {
		// Don't let the ActionBar remove focusability - this widget must
		// always be reachable via Tab even when a sibling item is hidden.
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.container = container;
		container.classList.add('sessions-account-titlebar-widget');
		container.setAttribute('role', 'button');
		container.tabIndex = 0;

		this.avatarElement = append(container, $('img.sessions-account-titlebar-widget-avatar', { alt: localize('accountAvatarAltFallback', "Account profile image"), draggable: 'false' })) as HTMLImageElement;
		this.avatarElement.decoding = 'async';
		this.avatarElement.referrerPolicy = 'no-referrer';
		this.iconElement = append(container, $('.sessions-account-titlebar-widget-icon'));
		this.labelElement = append(container, $('span.sessions-account-titlebar-widget-label'));
		this.badgeElement = append(container, $('span.sessions-account-titlebar-widget-badge'));

		this.renderState();
	}

	override onClick(): void {
		if (!this.container) {
			return;
		}

		this.showCombinedPanel();
	}

	private async refreshAccount(): Promise<void> {
		const requestId = ++this.accountRequestCounter;
		this.isAccountLoading = true;
		this.renderState();

		const info = await resolveAccountInfo(this.defaultAccountService, this.authenticationService);
		if (requestId !== this.accountRequestCounter) {
			return;
		}

		this.accountName = info?.accountName;
		this.accountProviderId = info?.accountProviderId;
		this.accountProviderLabel = info?.accountProviderLabel;
		this.isAccountLoading = false;
		this.refreshAvatar();
		this.renderState();
	}

	private renderState(): void {
		if (!this.container || !this.avatarElement || !this.iconElement || !this.labelElement || !this.badgeElement) {
			return;
		}

		// When we have a session but entitlement hasn't resolved yet,
		// treat as Unresolved to avoid showing "Agents Signed Out".
		const entitlement = this.accountName && this.chatEntitlementService.entitlement === ChatEntitlement.Unknown
			? ChatEntitlement.Unresolved
			: this.chatEntitlementService.entitlement;

		const state = getAccountTitleBarState({
			isAccountLoading: this.isAccountLoading,
			accountName: this.accountName,
			accountProviderLabel: this.accountProviderLabel,
			entitlement,
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
		const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : undefined;
		const hasLoadedAvatar = !!loadedAvatarUrl;
		const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;

		this.avatarElement.classList.toggle('visible', hasLoadedAvatar);
		this.avatarElement.alt = this.getAvatarAltText(hasLoadedAvatar);
		if (hasLoadedAvatar) {
			if (this.avatarElement.src !== loadedAvatarUrl) {
				this.avatarElement.src = loadedAvatarUrl;
			}
		} else {
			this.avatarElement.removeAttribute('src');
		}

		this.iconElement.className = `sessions-account-titlebar-widget-icon ${ThemeIcon.asClassName(titleBarIcon)}`;
		this.iconElement.classList.toggle('hidden', hasLoadedAvatar);
		this.labelElement.textContent = '';
		this.badgeElement.textContent = '';
		this.badgeElement.classList.toggle('dot-badge', shouldShowDotBadge);
		this.badgeElement.classList.toggle('dot-badge-warning', shouldShowDotBadge && state.dotBadge === 'warning');
		this.badgeElement.classList.toggle('dot-badge-error', shouldShowDotBadge && state.dotBadge === 'error');
		this.badgeElement.style.display = shouldShowDotBadge ? '' : 'none';
	}

	private getAvatarAltText(hasLoadedAvatar: boolean): string {
		if (hasLoadedAvatar && this.accountProviderId === 'github' && this.accountName) {
			return localize('accountAvatarAlt', "GitHub profile image for {0}", this.accountName);
		}

		return localize('accountAvatarAltFallback', "Account profile image");
	}

	private refreshAvatar(): void {
		const avatarUrl = getAccountProfileImageUrl(this.accountProviderId, this.accountName);
		if (avatarUrl === this.currentAvatarUrl) {
			return;
		}

		this.currentAvatarUrl = avatarUrl;
		this.loadedAvatarUrl = undefined;
		this.avatarLoadDisposable.clear();
		const requestId = ++this.avatarRequestCounter;

		if (!avatarUrl) {
			this.renderState();
			return;
		}

		const image = new Image();
		image.referrerPolicy = 'no-referrer';
		const clearHandlers = () => {
			image.onload = null;
			image.onerror = null;
		};
		image.onload = () => {
			if (requestId !== this.avatarRequestCounter) {
				return;
			}

			this.loadedAvatarUrl = avatarUrl;
			this.renderState();
			clearHandlers();
		};
		image.onerror = () => {
			if (requestId !== this.avatarRequestCounter) {
				return;
			}

			this.loadedAvatarUrl = undefined;
			this.renderState();
			clearHandlers();
		};
		this.avatarLoadDisposable.value = toDisposable(() => {
			clearHandlers();
			image.src = '';
		});
		image.src = avatarUrl;
		this.renderState();
	}

	private getHoverTarget(): { targetElements: HTMLElement[]; x: number } {
		const { left, width } = getDomNodePagePosition(this.container!);
		return {
			targetElements: [this.container!],
			x: left + width - SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH,
		};
	}

	private showCombinedPanel(): void {
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
				this.container?.focus();
			}
		});

		const panelContent = this.createCombinedPanelContent(panelStore);
		const hoverWidget = this.hoverService.showInstantHover({
			content: panelContent,
			target: this.getHoverTarget(),
			additionalClasses: ['sessions-account-titlebar-panel-hover'],
			position: { hoverPosition: HoverPosition.BELOW },
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

	private createCombinedPanelContent(panelStore: DisposableStore): HTMLElement {
		const panel = $('div.sessions-account-titlebar-panel');

		// Build the menu actions once and partition them.
		const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
		const rawActions: IAction[] = [];
		fillInActionBarActions(menu.getActions(), rawActions);
		menu.dispose();
		const partitioned = this.partitionMenuActions(rawActions);

		// Header: account label + sign-out icon.
		const headerSection = append(panel, $('.sessions-account-titlebar-panel-header'));
		const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : undefined;
		if (loadedAvatarUrl) {
			const avatar = append(headerSection, $('img.sessions-account-titlebar-panel-avatar', {
				alt: this.getAvatarAltText(true),
				draggable: 'false',
				src: loadedAvatarUrl,
			})) as HTMLImageElement;
			avatar.decoding = 'async';
			avatar.referrerPolicy = 'no-referrer';
		}
		const title = append(headerSection, $('div.sessions-account-titlebar-panel-title'));
		title.textContent = this.getPanelHeaderLabel();
		if (partitioned.signOut) {
			const headerActionsContainer = append(headerSection, $('.sessions-account-titlebar-panel-header-actions'));
			this.createPanelButton(headerActionsContainer, partitioned.signOut, panelStore, {
				classNames: ['sessions-account-titlebar-panel-header-action'],
				icon: this.getHeaderActionIcon(partitioned.signOut),
			});
		}

		// Personalize section.
		if (partitioned.personalize.length > 0) {
			const personalizeId = 'sessions-account-personalize-title';
			const personalizeSection = append(panel, $('section.sessions-account-titlebar-panel-section', { 'aria-labelledby': personalizeId }));
			const personalizeHeading = append(personalizeSection, $('div.sessions-account-titlebar-panel-section-title', { id: personalizeId }));
			personalizeHeading.textContent = localize('sessionsAccountMenu.personalize', "Personalize");
			const personalizeActionsContainer = append(personalizeSection, $('.sessions-account-titlebar-panel-actions'));
			for (const action of partitioned.personalize) {
				this.createPanelButton(personalizeActionsContainer, action, panelStore, {
					classNames: ['sessions-account-titlebar-panel-action', 'with-icon'],
					icon: this.getPersonalizeActionIcon(action),
					includeLabel: true,
				});
			}
		}

		// Other panel actions (sign-in, etc.) — only render if there's at least one non-separator action.
		if (partitioned.other.some(a => !(a instanceof Separator))) {
			const actionsSection = append(panel, $('.sessions-account-titlebar-panel-actions'));
			let lastWasSeparator = true;
			for (const action of partitioned.other) {
				if (action instanceof Separator) {
					if (!lastWasSeparator) {
						append(actionsSection, $('.sessions-account-titlebar-panel-separator'));
						lastWasSeparator = true;
					}
					continue;
				}
				lastWasSeparator = false;
				this.createPanelButton(actionsSection, action, panelStore, {
					classNames: ['sessions-account-titlebar-panel-action'],
					includeLabel: true,
					checked: !!action.checked,
				});
			}
		}

		// Subscription / Copilot dashboard.
		const contentSection = append(panel, $('.sessions-account-titlebar-panel-content'));
		if (this.shouldShowCopilotDashboardHover()) {
			const subscriptionId = 'sessions-account-subscription-title';
			const subscriptionSection = append(contentSection, $('section.sessions-account-titlebar-panel-section.subscription', { 'aria-labelledby': subscriptionId }));
			const subscriptionHeader = append(subscriptionSection, $('.sessions-account-titlebar-panel-section-header'));
			const subscriptionHeading = append(subscriptionHeader, $('div.sessions-account-titlebar-panel-section-title', { id: subscriptionId }));
			subscriptionHeading.textContent = localize('sessionsAccountMenu.subscription', "Subscription");
			const dashboard = this.createCopilotHoverContent({ titleHeaderContainer: subscriptionHeader });
			append(subscriptionSection, dashboard);
		} else if (!this.isAccountLoading) {
			const summary = append(contentSection, $('.sessions-account-titlebar-panel-summary'));
			summary.textContent = this.lastState.ariaLabel;
		}

		return panel;
	}

	private partitionMenuActions(rawActions: IAction[]): { signOut: IAction | undefined; personalize: IAction[]; other: IAction[] } {
		let signOut: IAction | undefined;
		const personalizeMap = new Map<string, IAction>();
		const other: IAction[] = [];

		const pushSeparator = () => {
			// Collapse runs and skip leading separators so groups whose only
			// items get filtered (e.g. update.*) don't leave orphans behind.
			if (other.length === 0 || other[other.length - 1] instanceof Separator) {
				return;
			}
			other.push(new Separator());
		};

		for (const action of rawActions) {
			if (action instanceof Separator) {
				pushSeparator();
				continue;
			}
			if (action.id === SIGN_OUT_ACTION_ID) {
				signOut = action;
				continue;
			}
			if (PERSONALIZE_ACTION_IDS.includes(action.id)) {
				personalizeMap.set(action.id, action);
				continue;
			}
			if (action.id.startsWith('update.')) {
				continue;
			}
			if (this.isAccountLoading && action.id === SIGN_IN_ACTION_ID) {
				continue;
			}
			other.push(action);
		}

		// Trim trailing separator left after filtering.
		if (other.length > 0 && other[other.length - 1] instanceof Separator) {
			other.pop();
		}

		// Preserve canonical personalize order.
		const personalize = PERSONALIZE_ACTION_IDS
			.map(id => personalizeMap.get(id))
			.filter((a): a is IAction => !!a);

		return { signOut, personalize, other };
	}

	private createPanelButton(
		parent: HTMLElement,
		action: IAction,
		panelStore: DisposableStore,
		options: { classNames: readonly string[]; icon?: ThemeIcon; includeLabel?: boolean; checked?: boolean },
	): HTMLButtonElement {
		const button = append(parent, $('button', { type: 'button' })) as HTMLButtonElement;
		button.classList.add(...options.classNames);
		button.disabled = !action.enabled;
		button.setAttribute('aria-label', action.tooltip || action.label);
		if (options.checked) {
			button.classList.add('checked');
		}

		if (options.icon && options.includeLabel) {
			const iconElement = append(button, $('span.sessions-account-titlebar-panel-action-icon'));
			iconElement.classList.add(...ThemeIcon.asClassNameArray(options.icon));
			const labelElement = append(button, $('span.sessions-account-titlebar-panel-action-label'));
			append(labelElement, ...renderLabelWithIcons(action.label));
		} else if (options.icon) {
			button.title = action.tooltip || action.label;
			button.classList.add(...ThemeIcon.asClassNameArray(options.icon));
		} else {
			append(button, ...renderLabelWithIcons(action.label));
		}

		panelStore.add(addDisposableListener(button, EventType.CLICK, async event => {
			event.preventDefault();
			event.stopPropagation();
			this.hoverService.hideHover(true);
			this.clickPanelDisposable.clear();
			await Promise.resolve(action.run());
		}));

		return button;
	}

	private getPanelHeaderLabel(): string {
		if (this.accountName) {
			return this.accountName;
		}

		if (this.isAccountLoading) {
			return localize('loadingAccountHeader', "Loading Account...");
		}

		return localize('accountMenuHeaderFallback', "Account");
	}

	private getHeaderActionIcon(action: IAction): ThemeIcon {
		switch (action.id) {
			case 'workbench.action.selectTheme':
				return Codicon.symbolColor;
			case 'workbench.action.openSettings':
				return Codicon.settingsGear;
			case SIGN_OUT_ACTION_ID:
				return Codicon.signOut;
			default:
				return Codicon.circleLargeFilled;
		}
	}

	private getPersonalizeActionIcon(action: IAction): ThemeIcon {
		switch (action.id) {
			case 'workbench.action.openSettings':
				return Codicon.settingsGear;
			case 'workbench.action.openGlobalKeybindings':
				return Codicon.keyboard;
			case 'workbench.action.selectTheme':
				return Codicon.symbolColor;
			default:
				return Codicon.circleLargeFilled;
		}
	}

	private shouldShowCopilotDashboardHover(): boolean {
		return !this.chatEntitlementService.sentiment.hidden && !!this.accountName;
	}

	private createCopilotHoverContent(extraOptions?: Partial<IChatStatusDashboardOptions>): HTMLElement {
		const store = new DisposableStore();
		this.copilotDashboardStore.value = store;

		const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
			disableInlineSuggestionsSettings: true,
			disableModelSelection: true,
			disableProviderOptions: true,
			disableCompletionsSnooze: true,
			disableQuickSettingsCollapsible: true,
			disableContributedSectionsCollapsible: true,
			...extraOptions,
		});

		store.add(disposableWindowInterval(mainWindow, () => {
			if (!dashboardElement.isConnected) {
				store.dispose();
			}
		}, 2000));

		return dashboardElement;
	}
}

class TitleBarTBBWidget extends BaseActionViewItem {

	private container: HTMLElement | undefined;
	private readonly clickPanelDisposable = this._register(new MutableDisposable<DisposableStore>());
	private isMenuVisible = false;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.container = container;
		container.classList.add('sessions-tbb-titlebar-widget');
		container.setAttribute('aria-label', localize('tbbSimulator', "Token Based Billing Simulator"));
		container.title = localize('tbbSimulator', "Token Based Billing Simulator");

		const icon = append(container, $('span.sessions-tbb-titlebar-widget-icon'));
		icon.append(...renderLabelWithIcons(`$(${Codicon.dashboard.id})`));
	}

	override onClick(): void {
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

		this.isMenuVisible = true;
		this.container.classList.add('menu-visible');

		panelStore.add({
			dispose: () => {
				this.isMenuVisible = false;
				this.container?.classList.remove('menu-visible');
			}
		});

		const panelContent = this.createTBBPanelContent(panelStore);
		const { left, width } = getDomNodePagePosition(this.container);
		const hoverWidget = this.hoverService.showInstantHover({
			content: panelContent,
			target: {
				targetElements: [this.container],
				x: left + width - 320,
			},
			additionalClasses: ['sessions-account-titlebar-panel-hover'],
			position: { hoverPosition: HoverPosition.BELOW },
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

	private createTBBPanelContent(panelStore: DisposableStore): HTMLElement {
		const panel = $('div.copilot-prototype-coin-view');
		panel.style.padding = '8px';
		panel.style.minWidth = '300px';

		const tbb3Instance = CopilotTBB3StatusBarContribution.instance;

		if (!tbb3Instance) {
			const msg = $('div');
			msg.style.padding = '12px';
			msg.style.color = 'var(--vscode-descriptionForeground)';
			msg.textContent = localize('tbbLoading', "Waiting for prototype controller...");
			panel.appendChild(msg);
			return panel;
		}

		tbb3Instance.renderController(panel, panelStore);
		CopilotPrototypeShellCoinStatusBarContribution.instance?.setBillingMode('tbb-3.0');

		return panel;
	}
}

class TitleBarUBBWidget extends BaseActionViewItem {

	private container: HTMLElement | undefined;
	private readonly clickPanelDisposable = this._register(new MutableDisposable<DisposableStore>());
	private isMenuVisible = false;
	private _pooledBannerDismissed = false;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.container = container;
		container.classList.add('sessions-ubb-titlebar-widget');
		container.setAttribute('aria-label', localize('ubbDashboard', "Usage Based Billing"));
		container.title = localize('ubbDashboard', "Usage Based Billing");

		// Show user avatar or fallback icon
		const account = this.defaultAccountService.currentDefaultAccount;
		const avatarUrl = getAccountProfileImageUrl(account?.authenticationProvider.id, account?.accountName);
		if (avatarUrl) {
			const avatar = append(container, $('img.sessions-ubb-titlebar-widget-avatar', {
				alt: localize('accountAvatarAltFallback', "Account profile image"),
				draggable: 'false',
				src: avatarUrl,
			})) as HTMLImageElement;
			avatar.decoding = 'async';
			avatar.referrerPolicy = 'no-referrer';
		} else {
			const icon = append(container, $('span.sessions-ubb-titlebar-widget-icon'));
			icon.append(...renderLabelWithIcons(`$(${Codicon.account.id})`));
		}
	}

	override onClick(): void {
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

		this.isMenuVisible = true;
		this.container.classList.add('menu-visible');

		panelStore.add({
			dispose: () => {
				this.isMenuVisible = false;
				this.container?.classList.remove('menu-visible');
			}
		});

		const panelContent = this.createUBBPanelContent(panelStore);
		const { left, width } = getDomNodePagePosition(this.container);
		const hoverWidget = this.hoverService.showInstantHover({
			content: panelContent,
			target: {
				targetElements: [this.container],
				x: left + width - SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH,
			},
			additionalClasses: ['sessions-account-titlebar-panel-hover'],
			position: { hoverPosition: HoverPosition.BELOW },
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

	private createUBBPanelContent(_panelStore: DisposableStore): HTMLElement {
		const panel = $('div.sessions-account-titlebar-panel');
		panel.style.minWidth = '340px';

		const account = this.defaultAccountService.currentDefaultAccount;
		const accountName = account?.accountName;
		const providerId = account?.authenticationProvider.id;
		const avatarUrl = getAccountProfileImageUrl(providerId, accountName);

		// Read state from the UBB controller
		const tbb3 = CopilotTBB3StatusBarContribution.instance;
		const sku = tbb3?.activeSku ?? 'Edu/Free';
		const state = tbb3?.activeState ?? 'Default';

		const isFree = sku === 'Edu/Free';
		const isProNoO = sku === 'Pro/Pro+ No O';
		const hasOverage = sku === 'Pro/Pro+' || sku === 'Max';
		const isEnterprise = sku === 'Ent/Bus' || sku === 'Ent/Bus ULB';
		const isUnlimitedEnt = sku === 'Ent/Bus';
		const isEntULB = sku === 'Ent/Bus ULB';
		const hasApproached = state === 'Monthly Approached';
		const hasExhausted = state === 'Monthly Exhausted';
		const isOverageApproached = state === 'Overage Approached';
		const isOverageExhausted = state === 'Overage Exhausted';
		const showCallout = hasApproached || hasExhausted || isOverageApproached || isOverageExhausted;

		// Plan title
		let planName: string;
		switch (sku) {
			case 'Edu/Free': planName = localize('ubbPlanFree', "Copilot Free"); break;
			case 'Pro/Pro+ No O': planName = localize('ubbPlanPro', "Copilot Pro"); break;
			case 'Pro/Pro+': planName = localize('ubbPlanProPlus', "Copilot Pro+"); break;
			case 'Max': planName = localize('ubbPlanMax', "Copilot Max"); break;
			case 'Ent/Bus ULB': planName = localize('ubbPlanEntULB', "Copilot Enterprise ULB"); break;
			case 'Ent/Bus': planName = localize('ubbPlanEnt', "Copilot Enterprise"); break;
			default: planName = localize('ubbPlanDefault', "Copilot Pro"); break;
		}

		// Mock percentage based on state
		let pctUsed: number;
		switch (state) {
			case 'Monthly Approached': pctUsed = 75; break;
			case 'Monthly Exhausted': case 'Overage Approached': case 'Overage Exhausted': pctUsed = 100; break;
			case 'Monthly Reset': case 'Overage Reset': pctUsed = 0; break;
			default: pctUsed = 50; break;
		}

		// === Header ===
		const header = append(panel, $('div.sessions-account-titlebar-panel-header'));
		if (avatarUrl) {
			const avatar = append(header, $('img.sessions-account-titlebar-panel-avatar', {
				alt: localize('accountAvatarAltFallback', "Account profile image"),
				draggable: 'false', src: avatarUrl,
			})) as HTMLImageElement;
			avatar.decoding = 'async';
			avatar.referrerPolicy = 'no-referrer';
		}
		append(header, $('div.sessions-account-titlebar-panel-title')).textContent =
			accountName ?? localize('accountMenuHeaderFallback', "Account");

		const actions = append(header, $('div.sessions-account-titlebar-panel-header-actions'));

		// CTA in header — one button max.
		if (isEntULB && (hasApproached || hasExhausted)) {
			// Enterprise ULB: admin-managed budget — surface a primary "Request More Usage" CTA.
			const ctaBtn = append(actions, $('button.sessions-ubb-header-cta.primary'));
			ctaBtn.textContent = localize('requestMoreUsage', "Request More Usage");
		} else if (showCallout && !isEnterprise) {
			let ctaLabel: string | undefined;
			if (isOverageApproached || isOverageExhausted) {
				ctaLabel = localize('increaseBudget', "Increase Budget");
			} else if (isFree) {
				ctaLabel = localize('upgrade', "Upgrade");
			}
			// Pro/Pro+ No O has no header CTA — its "Configure" action lives inline on the
			// Additional Budget row (see below), next to the "Not configured" state.
			if (ctaLabel) {
				const ctaBtn = append(actions, $('button.sessions-ubb-header-cta'));
				ctaBtn.textContent = ctaLabel;
			}
		}

		const settingsBtn = append(actions, $('button.sessions-account-titlebar-panel-header-action'));
		settingsBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.settingsGear));
		settingsBtn.title = localize('settings', "Settings");
		const signOutBtn = append(actions, $('button.sessions-account-titlebar-panel-header-action'));
		signOutBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.signOut));
		signOutBtn.title = localize('signOut', "Sign Out");

		// Non-ULB pooled enterprise: explain the shared-pool context in a dismissable banner at the top.
		// The Agents window has no inline code suggestions, so that detail is intentionally omitted here.
		if (isUnlimitedEnt && !this._pooledBannerDismissed) {
			const banner = append(panel, $('div.sessions-ubb-callout.dismissable'));
			const bannerBody = append(banner, $('div.sessions-ubb-callout-body'));
			append(bannerBody, $('span.sessions-ubb-callout-icon')).classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
			append(bannerBody, $('span.sessions-ubb-callout-text')).textContent =
				localize('ubbEntPooledLine', "Your usage draws from your organization's shared credit pool.");
			const dismiss = append(bannerBody, $('span.sessions-ubb-callout-dismiss'));
			dismiss.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
			dismiss.tabIndex = 0;
			dismiss.title = localize('dismiss', "Dismiss");
			dismiss.addEventListener('click', () => { this._pooledBannerDismissed = true; banner.remove(); });
		}

		// === Callout (text only, no buttons or links) ===
		if (showCallout && !isUnlimitedEnt) {
			const callout = append(panel, $('div.sessions-ubb-callout'));
			const calloutBody = append(callout, $('div.sessions-ubb-callout-body'));
			const calloutIconEl = append(calloutBody, $('span.sessions-ubb-callout-icon'));
			calloutIconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
			const textContainer = append(calloutBody, $('span.sessions-ubb-callout-text'));

			if (isEntULB) {
				// Enterprise ULB — match the main dashboard "limit" language (no admin sentence).
				if (hasExhausted) {
					append(textContainer, $('span.sessions-ubb-callout-title')).textContent =
						localize('ubbCreditsReachedTitle', "Credits Reached.");
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbEntExhaustedMsg', "Copilot is paused until the limit resets.");
				} else {
					append(textContainer, $('span.sessions-ubb-callout-title')).textContent =
						localize('ubbCreditsApproachingTitle', "Credits at {0}%.", pctUsed);
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbEntApproachingMsg', "Copilot will pause when the limit is reached.");
				}
			} else if (isOverageApproached) {
				append(textContainer, $('span.sessions-ubb-callout-title')).textContent =
					localize('ubbOverageApproachingTitle', "Additional Budget at {0}%.", 75);
				append(textContainer, $('span')).textContent =
					' ' + localize('ubbOverageApproachingMsg', "Increase your budget to keep going.");
			} else if (isOverageExhausted) {
				append(textContainer, $('span.sessions-ubb-callout-title')).textContent =
					localize('ubbOverageReachedTitle', "Additional Budget Reached.");
				append(textContainer, $('span')).textContent =
					' ' + localize('ubbOverageExhaustedMsg', "Increase your budget to keep building.");
			} else if (hasExhausted) {
				append(textContainer, $('span.sessions-ubb-callout-title')).textContent =
					localize('ubbCreditsReachedTitle', "Credits Reached.");
				if (isFree) {
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbFreeExhaustedMsg', "You're getting the most out of Copilot. Upgrade to keep going.");
				} else if (hasOverage) {
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbPaidOverageActiveMsg', "Your additional budget will keep Copilot going.");
				} else {
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbPaidExhaustedMsg', "Configure additional budget to keep building.");
				}
			} else {
				append(textContainer, $('span.sessions-ubb-callout-title')).textContent =
					localize('ubbCreditsApproachingTitle', "Credits at {0}%.", pctUsed);
				if (isFree) {
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbFreeApproachingMsg', "You're getting the most out of Copilot. Upgrade to keep going.");
				} else if (hasOverage) {
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbPaidOverageApproachMsg', "Your additional budget will keep Copilot going.");
				} else {
					append(textContainer, $('span')).textContent =
						' ' + localize('ubbPaidApproachingMsg', "Configure additional budget to keep going.");
				}
			}
		}

		// === Quota ===
		const quota = append(panel, $('div.sessions-ubb-quota'));

		if (isUnlimitedEnt) {
			// Non-ULB pooled enterprise (#319589): there is no per-user denominator, so surface the
			// aggregate monthly credits consumed as a single value. The shared-pool context is
			// explained in the dismissable banner at the top of the panel.
			const creditsUsed = 1284;
			const titleRow = append(quota, $('div.sessions-ubb-quota-row'));
			append(titleRow, $('span.sessions-ubb-quota-title')).textContent = planName;
			append(titleRow, $('span.sessions-ubb-quota-pct')).textContent = creditsUsed.toLocaleString();
			const detailRow = append(quota, $('div.sessions-ubb-quota-row'));
			append(detailRow, $('span.sessions-ubb-quota-reset')).textContent =
				localize('ubbResetDate', "Resets May 31 at 5:00 PM");
			append(detailRow, $('span.sessions-ubb-quota-credits-label')).textContent =
				localize('creditsUsed', "Credits used");
		} else {
			// Row 1: plan title + percentage
			const titleRow = append(quota, $('div.sessions-ubb-quota-row'));
			append(titleRow, $('span.sessions-ubb-quota-title')).textContent = planName;
			append(titleRow, $('span.sessions-ubb-quota-pct')).textContent = `${pctUsed}%`;

			// Row 2: reset date + "Credits used"
			const detailRow = append(quota, $('div.sessions-ubb-quota-row'));
			append(detailRow, $('span.sessions-ubb-quota-reset')).textContent =
				localize('ubbResetDate', "Resets May 31 at 5:00 PM");
			append(detailRow, $('span.sessions-ubb-quota-credits-label')).textContent =
				localize('creditsUsed', "Credits used");
		}

		// === Additional Budget (overage) ===
		// Always shown for individual SKUs that have (or can configure) an additional budget; dimmed when not in use.
		// Enterprise SKUs never show this — their budget is admin-managed.
		// No reset line — it shares the monthly reset already shown under Credits above.
		if (!isFree && !isEnterprise && (hasOverage || isProNoO)) {
			const overageActive = hasExhausted || isOverageApproached || isOverageExhausted;
			const overagePct = isOverageExhausted ? 100 : isOverageApproached ? 75 : hasExhausted ? 10 : 0;
			const additional = append(panel, $('div.sessions-ubb-quota'));
			if (!overageActive) { additional.classList.add('dimmed'); }
			const addRow = append(additional, $('div.sessions-ubb-quota-row'));
			append(addRow, $('span.sessions-ubb-quota-title')).textContent =
				localize('ubbAdditionalBudget', "Additional Budget");
			if (isProNoO) {
				// No additional budget configured — offer an inline tertiary "Configure" action
				// in place of the value (the header CTA is intentionally omitted for this state).
				const configureBtn = append(addRow, $('button.sessions-ubb-quota-configure'));
				configureBtn.textContent = localize('configure', "Configure");
			} else {
				append(addRow, $('span.sessions-ubb-quota-pct')).textContent = `${overagePct}%`;
			}
		}

		// === Codebase Semantic Index ===
		const idx = append(panel, $('div.sessions-ubb-index'));
		const idxHeader = append(idx, $('button.sessions-ubb-index-header'));
		append(idxHeader, $('span.sessions-ubb-index-label')).textContent =
			localize('codebaseSemanticIndex', "Codebase Semantic Index");
		append(idxHeader, $('span.sessions-ubb-index-chevron')).classList.add(
			...ThemeIcon.asClassNameArray(Codicon.chevronRight));
		append(idxHeader, $('span.sessions-ubb-index-status')).textContent =
			localize('ready', "Ready");

		return panel;
	}
}

// --- Register custom view item --- //

// Actions registered at module level so Menus.TitleBarRightLayout is non-empty when the
// toolbar is first constructed. The run() is a no-op — rendering is handled by the custom
// view items registered in AccountWidgetContribution.
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SessionsTitleBarAccountWidgetAction,
			title: localize2('agentsAccountStatusTitleBar', "Agents Account and Status"),
			menu: {
				id: Menus.TitleBarRightLayout,
				group: 'navigation',
				order: 100,
				when: IsAuxiliaryWindowContext.toNegated(),
			}
		});
	}

	run(): void { }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SessionsTitleBarTBBWidgetAction,
			title: localize2('agentsTBBTitleBar', "Token Based Billing Simulator"),
			menu: {
				id: Menus.TitleBarRightLayout,
				group: 'navigation',
				order: 97,
				when: IsAuxiliaryWindowContext.toNegated(),
			}
		});
	}

	run(): void { }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SessionsTitleBarUBBWidgetAction,
			title: localize2('agentsUBBTitleBar', "Usage Based Billing Dashboard"),
			menu: {
				id: Menus.TitleBarRightLayout,
				group: 'navigation',
				order: 98,
				when: IsAuxiliaryWindowContext.toNegated(),
			}
		});
	}

	run(): void { }
});

class AccountWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWidget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// TBB Simulator widget (dashboard icon, left of update and account)
		this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarTBBWidgetAction, (action, options) => {
			return instantiationService.createInstance(TitleBarTBBWidget, action, options);
		}, undefined));

		// UBB Dashboard widget (credit card icon, shows simplified quota dashboard)
		this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarUBBWidgetAction, (action, options) => {
			return instantiationService.createInstance(TitleBarUBBWidget, action, options);
		}, undefined));

		this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarAccountWidgetAction, (action, options) => {
			return instantiationService.createInstance(TitleBarAccountWidget, action, options);
		}, undefined));
	}
}

registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, WorkbenchPhase.BlockRestore);

// --- Chat Dashboard Service (real implementation for mobile account sheet) --- //

class ChatDashboardServiceImpl implements IChatDashboardService {
	readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	createDashboardElement(store: DisposableStore): HTMLElement | undefined {
		const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
			disableInlineSuggestionsSettings: true,
			disableModelSelection: true,
			disableProviderOptions: true,
			disableCompletionsSnooze: true,
		});

		store.add(disposableWindowInterval(mainWindow, () => {
			if (!dashboardElement.isConnected) {
				store.dispose();
			}
		}, 2000));

		return dashboardElement;
	}
}

registerSingleton(IChatDashboardService, ChatDashboardServiceImpl, InstantiationType.Delayed);
