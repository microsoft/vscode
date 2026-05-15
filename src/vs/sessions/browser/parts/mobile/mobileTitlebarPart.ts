/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './mobileChatShell.css';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IAction, Separator } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { autorun } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { Menus } from '../../menus.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { getAccountTitleBarState, getAccountProfileImageUrl, getAccountTitleBarBadgeKey, resolveAccountInfo } from '../../accountTitleBarState.js';
import { IChatDashboardService } from '../../chatDashboardService.js';
import { MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID } from './contributions/mobileChangesView.js';

/**
 * Mobile titlebar — prepended above the workbench grid on phone viewports
 * in place of the desktop titlebar.
 *
 * Layout (contextual right slot):
 *
 *  - **In a chat session** → `[toggle sidebar]  [session title]  [changes pill]  [+]`
 *  - **Welcome / new session** → `[toggle sidebar]  [host widget | title]  [account]`
 *
 * The center slot switches content based on whether the sessions welcome
 * (home/empty) screen is visible:
 *
 *  - **Welcome hidden** → shows the active session title (live, from
 *    {@link ISessionsManagementService.activeSession}).
 *  - **Welcome visible** → shows whatever is contributed to the
 *    {@link Menus.MobileTitleBarCenter} menu. On web, the host filter
 *    contribution appends its host dropdown + connection button there.
 *
 * The switch is driven entirely by the menu: when the toolbar has no
 * items the title is shown; as soon as it has items the title is hidden
 * and the toolbar fills the slot.
 *
 * The right slot swaps between the new-session (+) button (in a chat)
 * and the account indicator (on welcome / new session). The account
 * indicator shows the user's avatar or a person icon with an optional
 * dot badge for quota/status warnings. Tapping it opens a panel with
 * account info, copilot status dashboard, and sign-in/sign-out actions.
 */
export class MobileTitlebarPart extends Disposable {

	readonly element: HTMLElement;

	private readonly sessionTitleElement: HTMLElement;
	private readonly actionsContainer: HTMLElement;

	private readonly _onDidClickHamburger = this._register(new Emitter<void>());
	readonly onDidClickHamburger: Event<void> = this._onDidClickHamburger.event;

	private readonly _onDidClickNewSession = this._register(new Emitter<void>());
	readonly onDidClickNewSession: Event<void> = this._onDidClickNewSession.event;

	private readonly _onDidClickTitle = this._register(new Emitter<void>());
	readonly onDidClickTitle: Event<void> = this._onDidClickTitle.event;

	// Account indicator state
	private readonly accountButton: HTMLElement;
	private readonly accountAvatarElement: HTMLImageElement;
	private readonly accountIconElement: HTMLElement;
	private readonly accountBadgeElement: HTMLElement;
	private accountName: string | undefined;
	private accountProviderId: string | undefined;
	private accountProviderLabel: string | undefined;
	private isAccountLoading = true;
	private accountRequestCounter = 0;
	private avatarRequestCounter = 0;
	private currentAvatarUrl: string | undefined;
	private loadedAvatarUrl: string | undefined;
	private isAccountMenuVisible = false;
	private lastBadgeKey: string | undefined;
	private dismissedBadgeKey: string | undefined;
	private readonly accountPanelDisposable = this._register(new MutableDisposable<DisposableStore>());
	private readonly avatarLoadDisposable = this._register(new MutableDisposable());
	private readonly copilotDashboardStore = this._register(new MutableDisposable<DisposableStore>());

	// Changes pill state — kept here so the click handler can read the
	// latest set without re-deriving it on each tap.
	private latestChanges: readonly ISessionFileChange[] = [];

	constructor(
		parent: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IMenuService private readonly menuService: IMenuService,
		@IChatDashboardService private readonly chatDashboardService: IChatDashboardService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.element = document.createElement('div');
		this.element.className = 'mobile-top-bar';

		// Register DOM removal before appending so that any exception
		// between this point and the end of the constructor still cleans
		// up the element via disposal.
		this._register(toDisposable(() => this.element.remove()));
		parent.prepend(this.element);

		// Sidebar toggle button. Uses the same icon as the desktop/web
		// agents-app sidebar toggle and reflects open/closed state via the
		// SideBarVisibleContext key.
		const hamburger = append(this.element, $('button.mobile-top-bar-button'));
		hamburger.setAttribute('aria-label', localize('mobileTopBar.openSessions', "Open sessions"));
		const hamburgerIcon = append(hamburger, $('span'));
		const closedIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeftOff);
		const openIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeft);
		hamburgerIcon.classList.add(...closedIconClasses);
		this._register(addDisposableListener(hamburger, EventType.CLICK, () => this._onDidClickHamburger.fire()));

		const sidebarVisibleKeySet = new Set([SideBarVisibleContext.key]);
		const updateSidebarIcon = () => {
			const isOpen = !!SideBarVisibleContext.getValue(contextKeyService);
			hamburgerIcon.classList.remove(...closedIconClasses, ...openIconClasses);
			hamburgerIcon.classList.add(...(isOpen ? openIconClasses : closedIconClasses));
			hamburger.setAttribute('aria-label', isOpen
				? localize('mobileTopBar.closeSessions', "Close sessions")
				: localize('mobileTopBar.openSessions', "Open sessions"));
		};
		updateSidebarIcon();

		// Center slot: title and/or actions container (mutually exclusive)
		const center = append(this.element, $('div.mobile-top-bar-center'));

		this.sessionTitleElement = append(center, $('button.mobile-session-title'));
		this.sessionTitleElement.setAttribute('type', 'button');
		this.sessionTitleElement.textContent = localize('mobileTopBar.newSession', "New Session");
		this._register(addDisposableListener(this.sessionTitleElement, EventType.CLICK, () => this._onDidClickTitle.fire()));

		this.actionsContainer = append(center, $('div.mobile-top-bar-actions'));

		// Right slot — laid out left-to-right in DOM order. The new-session
		// (+) button is appended LAST so it always sits at the right edge,
		// even when the changes pill is visible.

		// Changes pill — shown when in a chat that has produced changes.
		// Tap → opens a file picker; selecting a file invokes the
		// `sessions.mobile.openDiffView` command for that file's diff.
		const changesPill = append(this.element, $('button.mobile-top-bar-button.mobile-changes-pill', { type: 'button' })) as HTMLButtonElement;
		changesPill.setAttribute('aria-label', localize('mobileTopBar.changes', "View changes"));
		changesPill.style.display = 'none';
		const changesIcon = append(changesPill, $('span.mobile-changes-pill-icon'));
		changesIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		const changesAddedEl = append(changesPill, $('span.mobile-changes-pill-added'));
		const changesRemovedEl = append(changesPill, $('span.mobile-changes-pill-removed'));
		this._register(addDisposableListener(changesPill, EventType.CLICK, () => this.showChangesPicker()));

		// New session button (+) — shown when in a chat, hidden on welcome.
		// Always rightmost when in a chat.
		const newSessionButton = append(this.element, $('button.mobile-top-bar-button.mobile-new-session-button'));
		newSessionButton.setAttribute('aria-label', localize('mobileTopBar.newSessionAria', "New session"));
		const newSessionIcon = append(newSessionButton, $('span'));
		newSessionIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plus));
		this._register(addDisposableListener(newSessionButton, EventType.CLICK, () => this._onDidClickNewSession.fire()));

		// Account indicator — shown on welcome/new session, hidden in a chat
		this.accountButton = append(this.element, $('button.mobile-top-bar-button.mobile-account-indicator'));
		this.accountButton.setAttribute('aria-label', localize('mobileTopBar.account', "Account"));
		this.accountAvatarElement = append(this.accountButton, $('img.mobile-account-avatar', { alt: '', draggable: 'false' })) as HTMLImageElement;
		this.accountAvatarElement.decoding = 'async';
		this.accountAvatarElement.referrerPolicy = 'no-referrer';
		this.accountIconElement = append(this.accountButton, $('span'));
		this.accountBadgeElement = append(this.accountButton, $('span.mobile-account-badge'));
		this._register(addDisposableListener(this.accountButton, EventType.CLICK, () => this.showAccountPanel()));

		// Track account state — listen to multiple sources to catch
		// updates regardless of service initialization ordering.
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
		this._register(this.authenticationService.onDidChangeSessions(() => this.refreshAccount()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderAccountState()));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderAccountState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderAccountState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderAccountState()));
		this.refreshAccount();

		// Keep the title in sync with the active session
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			const title = session?.title.read(reader);
			this.sessionTitleElement.textContent = title || localize('mobileTopBar.newSession', "New Session");
		}));

		// Keep the changes pill in sync with the active session's changes.
		// Hidden when there are no changes (counts are zero and list is empty).
		const isNewChatRef = { value: !!IsNewChatSessionContext.getValue(contextKeyService) };
		const renderChangesPill = () => {
			const changes = this.latestChanges;
			let added = 0;
			let removed = 0;
			for (const c of changes) {
				added += c.insertions;
				removed += c.deletions;
			}
			const hasChanges = changes.length > 0 && (added > 0 || removed > 0);
			// Hide on welcome / new-chat — no session changes to view there.
			const visible = hasChanges && !isNewChatRef.value;
			changesPill.style.display = visible ? '' : 'none';
			if (visible) {
				changesAddedEl.textContent = `+${added}`;
				changesRemovedEl.textContent = `-${removed}`;
				changesPill.title = localize('mobileTopBar.changesTooltip', "{0} files changed (+{1} -{2})", changes.length, added, removed);
			}
		};
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			this.latestChanges = session?.changes.read(reader) ?? [];
			renderChangesPill();
		}));

		// Mount the center toolbar (host filter widget on web welcome, etc.)
		const toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this.actionsContainer, Menus.MobileTitleBarCenter, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'mobileTitlebar.center',
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Switch between title and toolbar based on whether a new (empty)
		// chat session is active AND whether the toolbar has anything to
		// show. The latter is important because on desktop/electron or
		// when no agent hosts are configured the toolbar can be empty —
		// in that case we keep the title visible.
		const newChatKeySet = new Set([IsNewChatSessionContext.key]);
		const updateCenterMode = () => {
			const isNewChat = !!IsNewChatSessionContext.getValue(contextKeyService);
			const hasActions = toolbar.getItemsLength() > 0;
			this.element.classList.toggle('show-actions', isNewChat && hasActions);

			// Right slot: swap between [+] (in-chat) and [account] (welcome)
			newSessionButton.style.display = isNewChat ? 'none' : '';
			this.accountButton.style.display = isNewChat ? '' : 'none';

			// Changes pill follows the in-chat state — hidden on welcome.
			isNewChatRef.value = isNewChat;
			renderChangesPill();
		};
		updateCenterMode();
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(newChatKeySet)) {
				updateCenterMode();
			}
			if (e.affectsSome(sidebarVisibleKeySet)) {
				updateSidebarIcon();
			}
		}));
		this._register(toolbar.onDidChangeMenuItems(() => updateCenterMode()));
	}

	/**
	 * Explicitly set the title shown in the center slot. Called only when
	 * overriding the live session title (tests, placeholders). The live
	 * subscription will overwrite this on the next session change.
	 */
	setTitle(title: string): void {
		this.sessionTitleElement.textContent = title;
	}

	// --- Changes Pill --- //

	/**
	 * Tap handler for the changes pill. Opens the dedicated mobile
	 * Changes overlay (a master list with file icons + add/remove
	 * counts) via {@link MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID}. The
	 * overlay's own row taps fan out into per-file diff views with
	 * prev/next navigation.
	 *
	 * The list overlay handles its own single-file shortcut, so the
	 * caller just dispatches the command unconditionally.
	 */
	private showChangesPicker(): void {
		if (!this.latestChanges.length) {
			return;
		}
		this.commandService.executeCommand(MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID);
	}

	// --- Account Indicator --- //

	private async refreshAccount(): Promise<void> {
		const requestId = ++this.accountRequestCounter;
		this.isAccountLoading = true;
		this.renderAccountState();

		const info = await resolveAccountInfo(this.defaultAccountService, this.authenticationService);
		if (requestId !== this.accountRequestCounter) {
			return;
		}

		this.accountName = info?.accountName;
		this.accountProviderId = info?.accountProviderId;
		this.accountProviderLabel = info?.accountProviderLabel;
		this.isAccountLoading = false;
		this.refreshAvatar();
		this.renderAccountState();
	}

	private renderAccountState(): void {
		// When we have a session from the auth service but the entitlement
		// service hasn't resolved yet (still Unknown), treat it as the
		// account being available rather than signed out. This avoids
		// showing "Sign In" right after the walkthrough completes.
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

		// Avatar
		const hasAvatar = !!this.loadedAvatarUrl && !this.isAccountLoading;
		this.accountAvatarElement.classList.toggle('visible', hasAvatar);
		if (hasAvatar && this.accountAvatarElement.src !== this.loadedAvatarUrl) {
			this.accountAvatarElement.src = this.loadedAvatarUrl!;
		} else if (!hasAvatar) {
			this.accountAvatarElement.removeAttribute('src');
		}

		// Codicon fallback
		const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;
		this.accountIconElement.className = ThemeIcon.asClassName(titleBarIcon);
		this.accountIconElement.classList.toggle('hidden', hasAvatar);

		// Dot badge
		const badgeKey = getAccountTitleBarBadgeKey(state);
		if (badgeKey !== this.lastBadgeKey) {
			this.lastBadgeKey = badgeKey;
			this.dismissedBadgeKey = undefined;
		}
		const showBadge = !!badgeKey && badgeKey !== this.dismissedBadgeKey;
		this.accountBadgeElement.style.display = showBadge ? '' : 'none';
		this.accountBadgeElement.classList.toggle('dot-badge-warning', showBadge && state.dotBadge === 'warning');
		this.accountBadgeElement.classList.toggle('dot-badge-error', showBadge && state.dotBadge === 'error');

		// ARIA
		this.accountButton.setAttribute('aria-label', state.ariaLabel);
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
			this.renderAccountState();
			return;
		}

		const image = new Image();
		image.referrerPolicy = 'no-referrer';
		const clearHandlers = () => { image.onload = null; image.onerror = null; };
		image.onload = () => {
			if (requestId !== this.avatarRequestCounter) { return; }
			this.loadedAvatarUrl = avatarUrl;
			this.renderAccountState();
			clearHandlers();
		};
		image.onerror = () => {
			if (requestId !== this.avatarRequestCounter) { return; }
			this.loadedAvatarUrl = undefined;
			this.renderAccountState();
			clearHandlers();
		};
		this.avatarLoadDisposable.value = toDisposable(() => { clearHandlers(); image.src = ''; });
		image.src = avatarUrl;
	}

	// --- Account Sheet --- //

	private showAccountPanel(): void {
		if (this.isAccountMenuVisible) {
			this.accountPanelDisposable.clear();
			return;
		}

		this.accountPanelDisposable.clear();

		const panelStore = new DisposableStore();
		this.accountPanelDisposable.value = panelStore;

		const badgeKey = getAccountTitleBarBadgeKey(getAccountTitleBarState({
			isAccountLoading: this.isAccountLoading,
			accountName: this.accountName,
			accountProviderLabel: this.accountProviderLabel,
			entitlement: this.chatEntitlementService.entitlement,
			sentiment: this.chatEntitlementService.sentiment,
			quotas: this.chatEntitlementService.quotas,
		}));
		if (badgeKey) {
			this.dismissedBadgeKey = badgeKey;
		}

		this.isAccountMenuVisible = true;
		this.renderAccountState();
		panelStore.add({
			dispose: () => {
				this.isAccountMenuVisible = false;
				this.copilotDashboardStore.clear();
				this.renderAccountState();
			}
		});

		const closeSheet = () => this.accountPanelDisposable.clear();

		// Full-screen sheet inside the workbench container
		const workbenchContainer = this.element.parentElement!;
		const sheet = append(workbenchContainer, $('div.mobile-account-sheet'));
		panelStore.add(toDisposable(() => sheet.remove()));

		// Header: title + close button
		const header = append(sheet, $('div.mobile-account-sheet-header'));
		const headerTitle = append(header, $('h2.mobile-account-sheet-title'));
		headerTitle.textContent = localize('mobileAccount.title', "Account");
		const closeButton = append(header, $('button.mobile-account-sheet-close', { type: 'button' })) as HTMLButtonElement;
		closeButton.setAttribute('aria-label', localize('mobileAccount.close', "Close"));
		append(closeButton, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
		panelStore.add(addDisposableListener(closeButton, EventType.CLICK, closeSheet));

		// Scrollable content
		const content = append(sheet, $('div.mobile-account-sheet-content'));

		// Profile section
		const profile = append(content, $('div.mobile-account-sheet-profile'));
		if (this.loadedAvatarUrl) {
			const avatar = append(profile, $('img.mobile-account-sheet-avatar', { alt: '', draggable: 'false' })) as HTMLImageElement;
			avatar.src = this.loadedAvatarUrl;
			avatar.referrerPolicy = 'no-referrer';
			avatar.decoding = 'async';
		} else {
			const avatarPlaceholder = append(profile, $('div.mobile-account-sheet-avatar-placeholder'));
			append(avatarPlaceholder, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.account));
		}
		const profileInfo = append(profile, $('div.mobile-account-sheet-profile-info'));
		if (this.isAccountLoading) {
			append(profileInfo, $('div.mobile-account-sheet-name')).textContent = localize('mobileAccount.loading', "Loading...");
		} else if (this.accountName) {
			append(profileInfo, $('div.mobile-account-sheet-name')).textContent = this.accountName;
			if (this.accountProviderLabel) {
				append(profileInfo, $('div.mobile-account-sheet-provider')).textContent = this.accountProviderLabel;
			}
		} else {
			append(profileInfo, $('div.mobile-account-sheet-name')).textContent = localize('mobileAccount.signedOut', "Not signed in");
		}

		// Copilot status dashboard — only when signed in AND entitlements
		// have resolved. When entitlement is Unknown or Available (setup
		// pending), the dashboard shows a "Set up Copilot" prompt that
		// doesn't apply in the agents app.
		const entitlement = this.chatEntitlementService.entitlement;
		const showDashboard = !this.chatEntitlementService.sentiment.hidden
			&& !!this.accountName
			&& entitlement !== ChatEntitlement.Unknown
			&& entitlement !== ChatEntitlement.Available;
		if (showDashboard) {
			const dashboardSection = append(content, $('div.mobile-account-sheet-section'));
			const store = new DisposableStore();
			this.copilotDashboardStore.value = store;
			const dashboardElement = this.chatDashboardService.createDashboardElement(store);
			if (dashboardElement) {
				append(dashboardSection, dashboardElement);
			}
		}

		// Actions list
		const actionsSection = append(content, $('div.mobile-account-sheet-actions'));
		const allActions = this.getSheetActions();
		for (const action of allActions) {
			if (action instanceof Separator) {
				append(actionsSection, $('div.mobile-account-sheet-separator'));
				continue;
			}
			const row = append(actionsSection, $('button.mobile-account-sheet-action', { type: 'button' })) as HTMLButtonElement;
			row.disabled = !action.enabled;
			row.setAttribute('aria-label', action.tooltip || action.label);
			const icon = this.getActionIcon(action);
			if (icon) {
				append(row, $('span.mobile-account-sheet-action-icon')).classList.add(...ThemeIcon.asClassNameArray(icon));
			}
			append(row, $('span.mobile-account-sheet-action-label')).textContent = action.label;
			panelStore.add(addDisposableListener(row, EventType.CLICK, async event => {
				event.preventDefault();
				event.stopPropagation();
				closeSheet();
				await Promise.resolve(action.run());
			}));
		}
	}

	private getSheetActions(): IAction[] {
		const menu = this.menuService.createMenu(Menus.AccountMenu, this.contextKeyService);
		const rawActions: IAction[] = [];
		fillInActionBarActions(menu.getActions(), rawActions);
		menu.dispose();
		return rawActions.filter(action => {
			if (action instanceof Separator) {
				return true;
			}
			if (this.isAccountLoading && action.id === 'workbench.action.agenticSignIn') {
				return false;
			}
			return !action.id.startsWith('update.');
		});
	}

	private getActionIcon(action: IAction): ThemeIcon | undefined {
		switch (action.id) {
			case 'workbench.action.openSettings': return Codicon.settingsGear;
			case 'workbench.action.agenticSignOut': return Codicon.signOut;
			case 'workbench.action.agenticSignIn': return Codicon.signIn;
			default: return undefined;
		}
	}
}
