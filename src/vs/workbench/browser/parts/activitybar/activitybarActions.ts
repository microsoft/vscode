/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activityaction';
import { localize } from 'vs/nls';
import { EventType, addDisposableListener, EventHelper, append, $, clearNode, hide, show } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import { Action, IAction, Separator, SubmenuAction, toAction } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IMenuService, MenuId, IMenu, registerAction2, Action2, IAction2Options } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { activeContrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ActivityAction, ActivityActionViewItem, IActivityActionViewItemOptions, IActivityHoverOptions, ICompositeBar, ICompositeBarColors, ToggleCompositeBadgeAction, ToggleCompositePinnedAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IActivity } from 'vs/workbench/common/activity';
import { ACTIVITY_BAR_ACTIVE_FOCUS_BORDER, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_ACTIVE_BORDER } from 'vs/workbench/common/theme';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { AuthenticationSessionInfo, getCurrentAuthenticationSessionInfo } from 'vs/workbench/services/authentication/browser/authenticationService';
import { AuthenticationSessionAccount, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';
import { AnchorAlignment, AnchorAxisAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ILogService } from 'vs/platform/log/common/log';
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { runWhenIdle } from 'vs/base/common/async';
import { Lazy } from 'vs/base/common/lazy';

export class ViewContainerActivityAction extends ActivityAction {

	private static readonly preventDoubleClickDelay = 300;

	private lastRun = 0;

	constructor(
		activity: IActivity,
		private readonly paneCompositePart: IPaneCompositePart,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(activity);
	}

	updateActivity(activity: IActivity): void {
		this.activity = activity;
	}

	override async run(event: { preserveFocus: boolean }): Promise<void> {
		if (event instanceof MouseEvent && event.button === 2) {
			return; // do not run on right click
		}

		// prevent accident trigger on a doubleclick (to help nervous people)
		const now = Date.now();
		if (now > this.lastRun /* https://github.com/microsoft/vscode/issues/25830 */ && now - this.lastRun < ViewContainerActivityAction.preventDoubleClickDelay) {
			return;
		}
		this.lastRun = now;

		const sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
		const activeViewlet = this.paneCompositePart.getActivePaneComposite();
		const focusBehavior = this.configurationService.getValue<string>('workbench.activityBar.iconClickBehavior');

		const focus = (event && 'preserveFocus' in event) ? !event.preserveFocus : true;
		if (sideBarVisible && activeViewlet?.getId() === this.activity.id) {
			switch (focusBehavior) {
				case 'focus':
					this.logAction('refocus');
					this.paneCompositePart.openPaneComposite(this.activity.id, focus);
					break;
				case 'toggle':
				default:
					// Hide sidebar if selected viewlet already visible
					this.logAction('hide');
					this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
					break;
			}

			return;
		}

		this.logAction('show');
		await this.paneCompositePart.openPaneComposite(this.activity.id, focus);

		return this.activate();
	}

	private logAction(action: string) {
		type ActivityBarActionClassification = {
			owner: 'sbatten';
			comment: 'Event logged when an activity bar action is triggered.';
			viewletId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The view in the activity bar for which the action was performed.' };
			action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action that was performed. e.g. "hide", "show", or "refocus"' };
		};
		this.telemetryService.publicLog2<{ viewletId: String; action: String }, ActivityBarActionClassification>('activityBarAction', { viewletId: this.activity.id, action });
	}
}

abstract class AbstractGlobalActivityActionViewItem extends ActivityActionViewItem {

	constructor(
		action: ActivityAction,
		private contextMenuActionsProvider: () => IAction[],
		options: IActivityActionViewItemOptions,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService protected readonly menuService: IMenuService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(action, options, () => true, themeService, hoverService, configurationService, keybindingService);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, async (e: MouseEvent) => {
			EventHelper.stop(e, true);
			const isLeftClick = e?.button !== 2;
			// Left-click run
			if (isLeftClick) {
				this.run();
			}
		}));

		// The rest of the activity bar uses context menu event for the context menu, so we match this
		this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, async (e: MouseEvent) => {
			const disposables = new DisposableStore();
			const actions = await this.resolveContextMenuActions(disposables);

			const event = new StandardMouseEvent(e);

			this.contextMenuService.showContextMenu({
				getAnchor: () => event,
				getActions: () => actions,
				onHide: () => disposables.dispose()
			});
		}));

		this._register(addDisposableListener(this.container, EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				EventHelper.stop(e, true);
				this.run();
			}
		}));

		this._register(addDisposableListener(this.container, TouchEventType.Tap, (e: GestureEvent) => {
			EventHelper.stop(e, true);
			this.run();
		}));
	}

	protected async resolveContextMenuActions(disposables: DisposableStore): Promise<IAction[]> {
		return this.contextMenuActionsProvider();
	}

	protected abstract run(): Promise<void>;
}

class MenuActivityActionViewItem extends AbstractGlobalActivityActionViewItem {

	constructor(
		private readonly menuId: MenuId,
		action: ActivityAction,
		contextMenuActionsProvider: () => IAction[],
		icon: boolean,
		colors: (theme: IColorTheme) => ICompositeBarColors,
		hoverOptions: IActivityHoverOptions,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(action, contextMenuActionsProvider, { draggable: false, colors, icon, hasPopup: true, hoverOptions }, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService);
	}

	protected async run(): Promise<void> {
		const disposables = new DisposableStore();
		const menu = disposables.add(this.menuService.createMenu(this.menuId, this.contextKeyService));
		const actions = await this.resolveMainMenuActions(menu, disposables);

		this.contextMenuService.showContextMenu({
			getAnchor: () => this.container,
			anchorAlignment: this.configurationService.getValue('workbench.sideBar.location') === 'left' ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT,
			anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL,
			getActions: () => actions,
			onHide: () => disposables.dispose(),
			menuActionOptions: { renderShortTitle: true },
		});

	}

	protected async resolveMainMenuActions(menu: IMenu, _disposable: DisposableStore): Promise<IAction[]> {
		const actions: IAction[] = [];
		createAndFillInActionBarActions(menu, { renderShortTitle: true }, { primary: [], secondary: actions });
		return actions;
	}

}

export class AccountsActivityActionViewItem extends MenuActivityActionViewItem {

	static readonly ACCOUNTS_VISIBILITY_PREFERENCE_KEY = 'workbench.activity.showAccounts';

	private readonly groupedAccounts: Map<string, (AuthenticationSessionAccount & { canSignOut: boolean })[]> = new Map();
	private readonly problematicProviders: Set<string> = new Set();

	private initialized = false;
	private sessionFromEmbedder = new Lazy<Promise<AuthenticationSessionInfo | undefined>>(() => getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService));

	constructor(
		action: ActivityAction,
		contextMenuActionsProvider: () => IAction[],
		colors: (theme: IColorTheme) => ICompositeBarColors,
		activityHoverOptions: IActivityHoverOptions,
		@IThemeService themeService: IThemeService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IHoverService hoverService: IHoverService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ILogService private readonly logService: ILogService
	) {
		super(MenuId.AccountsContext, action, contextMenuActionsProvider, true, colors, activityHoverOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService);
		this.registerListeners();
		this.initialize();
	}

	private registerListeners(): void {
		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(async (e) => {
			await this.addAccountsFromProvider(e.id);
		}));

		this._register(this.authenticationService.onDidUnregisterAuthenticationProvider((e) => {
			this.groupedAccounts.delete(e.id);
			this.problematicProviders.delete(e.id);
		}));

		this._register(this.authenticationService.onDidChangeSessions(async e => {
			for (const changed of [...e.event.changed, ...e.event.added]) {
				try {
					await this.addOrUpdateAccount(e.providerId, changed.account);
				} catch (e) {
					this.logService.error(e);
				}
			}
			for (const removed of e.event.removed) {
				this.removeAccount(e.providerId, removed.account);
			}
		}));
	}

	// This function exists to ensure that the accounts are added for auth providers that had already been registered
	// before the menu was created.
	private async initialize(): Promise<void> {
		// Resolving the menu doesn't need to happen immediately, so we can wait until after the workbench has been restored
		// and only run this when the system is idle.
		await this.lifecycleService.when(LifecyclePhase.Restored);
		const disposable = this._register(runWhenIdle(async () => {
			await this.doInitialize();
			disposable.dispose();
		}));
	}

	private async doInitialize(): Promise<void> {
		const providerIds = this.authenticationService.getProviderIds();
		const results = await Promise.allSettled(providerIds.map(providerId => this.addAccountsFromProvider(providerId)));

		// Log any errors that occurred while initializing. We try to be best effort here to show the most amount of accounts
		for (const result of results) {
			if (result.status === 'rejected') {
				this.logService.error(result.reason);
			}
		}

		this.initialized = true;
	}

	//#region overrides

	protected override async resolveMainMenuActions(accountsMenu: IMenu, disposables: DisposableStore): Promise<IAction[]> {
		await super.resolveMainMenuActions(accountsMenu, disposables);

		const providers = this.authenticationService.getProviderIds();
		const otherCommands = accountsMenu.getActions();
		let menus: IAction[] = [];

		for (const providerId of providers) {
			if (!this.initialized) {
				const noAccountsAvailableAction = disposables.add(new Action('noAccountsAvailable', localize('loading', "Loading..."), undefined, false));
				menus.push(noAccountsAvailableAction);
				break;
			}
			const providerLabel = this.authenticationService.getLabel(providerId);
			const accounts = this.groupedAccounts.get(providerId);
			if (!accounts) {
				if (this.problematicProviders.has(providerId)) {
					const providerUnavailableAction = disposables.add(new Action('providerUnavailable', localize('authProviderUnavailable', '{0} is currently unavailable', providerLabel), undefined, false));
					menus.push(providerUnavailableAction);
					// try again in the background so that if the failure was intermittent, we can resolve it on the next showing of the menu
					try {
						await this.addAccountsFromProvider(providerId);
					} catch (e) {
						this.logService.error(e);
					}
				}
				continue;
			}

			for (const account of accounts) {
				const manageExtensionsAction = disposables.add(new Action(`configureSessions${account.label}`, localize('manageTrustedExtensions', "Manage Trusted Extensions"), undefined, true, () => {
					return this.authenticationService.manageTrustedExtensionsForAccount(providerId, account.label);
				}));

				const providerSubMenuActions: Action[] = [manageExtensionsAction];

				if (account.canSignOut) {
					const signOutAction = disposables.add(new Action('signOut', localize('signOut', "Sign Out"), undefined, true, async () => {
						const allSessions = await this.authenticationService.getSessions(providerId);
						const sessionsForAccount = allSessions.filter(s => s.account.id === account.id);
						return await this.authenticationService.removeAccountSessions(providerId, account.label, sessionsForAccount);
					}));
					providerSubMenuActions.push(signOutAction);
				}

				const providerSubMenu = new SubmenuAction('activitybar.submenu', `${account.label} (${providerLabel})`, providerSubMenuActions);
				menus.push(providerSubMenu);
			}
		}

		if (providers.length && !menus.length) {
			const noAccountsAvailableAction = disposables.add(new Action('noAccountsAvailable', localize('noAccounts', "You are not signed in to any accounts"), undefined, false));
			menus.push(noAccountsAvailableAction);
		}

		if (menus.length && otherCommands.length) {
			menus.push(new Separator());
		}

		otherCommands.forEach((group, i) => {
			const actions = group[1];
			menus = menus.concat(actions);
			if (i !== otherCommands.length - 1) {
				menus.push(new Separator());
			}
		});

		return menus;
	}

	protected override async resolveContextMenuActions(disposables: DisposableStore): Promise<IAction[]> {
		const actions = await super.resolveContextMenuActions(disposables);

		actions.unshift(...[
			toAction({ id: 'hideAccounts', label: localize('hideAccounts', "Hide Accounts"), run: () => this.storageService.store(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, false, StorageScope.PROFILE, StorageTarget.USER) }),
			new Separator()
		]);

		return actions;
	}

	//#endregion

	//#region groupedAccounts helpers

	private async addOrUpdateAccount(providerId: string, account: AuthenticationSessionAccount): Promise<void> {
		let accounts = this.groupedAccounts.get(providerId);
		if (accounts) {
			const existingAccount = accounts.find(a => a.id === account.id);
			if (existingAccount) {
				// Update the label if it has changed
				if (existingAccount.label !== account.label) {
					existingAccount.label = account.label;
				}
				return;
			}
		} else {
			accounts = [];
			this.groupedAccounts.set(providerId, accounts);
		}

		const sessionFromEmbedder = await this.sessionFromEmbedder.value;
		// If the session stored from the embedder allows sign out, then we can treat it and all others as sign out-able
		let canSignOut = !!sessionFromEmbedder?.canSignOut;
		if (!canSignOut) {
			if (sessionFromEmbedder?.id) {
				const sessions = (await this.authenticationService.getSessions(providerId)).filter(s => s.account.id === account.id);
				canSignOut = !sessions.some(s => s.id === sessionFromEmbedder.id);
			} else {
				// The default if we don't have a session from the embedder is to allow sign out
				canSignOut = true;
			}
		}

		accounts.push({ ...account, canSignOut });
	}

	private removeAccount(providerId: string, account: AuthenticationSessionAccount): void {
		const accounts = this.groupedAccounts.get(providerId);
		if (!accounts) {
			return;
		}

		const index = accounts.findIndex(a => a.id === account.id);
		if (index === -1) {
			return;
		}

		accounts.splice(index, 1);
		if (accounts.length === 0) {
			this.groupedAccounts.delete(providerId);
		}
	}

	private async addAccountsFromProvider(providerId: string): Promise<void> {
		try {
			const sessions = await this.authenticationService.getSessions(providerId);
			this.problematicProviders.delete(providerId);

			for (const session of sessions) {
				try {
					await this.addOrUpdateAccount(providerId, session.account);
				} catch (e) {
					this.logService.error(e);
				}
			}
		} catch (e) {
			this.logService.error(e);
			this.problematicProviders.add(providerId);
		}
	}

	//#endregion
}

export interface IProfileActivity extends IActivity {
	readonly icon: boolean;
}

export class GlobalActivityActionViewItem extends MenuActivityActionViewItem {

	private profileBadge: HTMLElement | undefined;
	private profileBadgeContent: HTMLElement | undefined;

	constructor(
		action: ActivityAction,
		contextMenuActionsProvider: () => IAction[],
		colors: (theme: IColorTheme) => ICompositeBarColors,
		activityHoverOptions: IActivityHoverOptions,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(MenuId.GlobalActivity, action, contextMenuActionsProvider, true, colors, activityHoverOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService);
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.updateProfileBadge()));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.profileBadge = append(container, $('.profile-badge'));
		this.profileBadgeContent = append(this.profileBadge, $('.profile-badge-content'));
		this.updateProfileBadge();
	}

	private updateProfileBadge(): void {
		if (!this.profileBadge || !this.profileBadgeContent) {
			return;
		}

		clearNode(this.profileBadgeContent);
		hide(this.profileBadge);

		if (this.userDataProfileService.currentProfile.isDefault) {
			return;
		}

		if ((this.action as ActivityAction).getBadge()) {
			return;
		}

		this.profileBadgeContent.textContent = this.userDataProfileService.currentProfile.name.substring(0, 2).toUpperCase();
		show(this.profileBadge);
	}

	protected override updateBadge(): void {
		super.updateBadge();
		this.updateProfileBadge();
	}

	protected override computeTitle(): string {
		return this.userDataProfileService.currentProfile.isDefault ? super.computeTitle() : localize('manage', "Manage {0} (Profile)", this.userDataProfileService.currentProfile.name);
	}
}

export class PlaceHolderViewContainerActivityAction extends ViewContainerActivityAction { }

export class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {

	constructor(id: string, compositeBar: ICompositeBar) {
		super({ id, name: id, classNames: undefined }, compositeBar);
	}

	setActivity(activity: IActivity): void {
		this.label = activity.name;
	}
}

export class PlaceHolderToggleCompositeBadgeAction extends ToggleCompositeBadgeAction {

	constructor(id: string, compositeBar: ICompositeBar) {
		super({ id, name: id, classNames: undefined }, compositeBar);
	}

	setActivity(activity: IActivity): void {
		this.label = activity.name;
	}
}

class SwitchSideBarViewAction extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private readonly offset: number
	) {
		super(desc);
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);

		const visibleViewletIds = paneCompositeService.getVisiblePaneCompositeIds(ViewContainerLocation.Sidebar);

		const activeViewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
		if (!activeViewlet) {
			return;
		}
		let targetViewletId: string | undefined;
		for (let i = 0; i < visibleViewletIds.length; i++) {
			if (visibleViewletIds[i] === activeViewlet.getId()) {
				targetViewletId = visibleViewletIds[(i + visibleViewletIds.length + this.offset) % visibleViewletIds.length];
				break;
			}
		}

		await paneCompositeService.openPaneComposite(targetViewletId, ViewContainerLocation.Sidebar, true);
	}
}

registerAction2(
	class PreviousSideBarViewAction extends SwitchSideBarViewAction {
		constructor() {
			super({
				id: 'workbench.action.previousSideBarView',
				title: { value: localize('previousSideBarView', "Previous Primary Side Bar View"), original: 'Previous Primary Side Bar View' },
				category: Categories.View,
				f1: true
			}, -1);
		}
	}
);

registerAction2(
	class NextSideBarViewAction extends SwitchSideBarViewAction {
		constructor() {
			super({
				id: 'workbench.action.nextSideBarView',
				title: { value: localize('nextSideBarView', "Next Primary Side Bar View"), original: 'Next Primary Side Bar View' },
				category: Categories.View,
				f1: true
			}, 1);
		}
	}
);

registerAction2(
	class FocusActivityBarAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.focusActivityBar',
				title: { value: localize('focusActivityBar', "Focus Activity Bar"), original: 'Focus Activity Bar' },
				category: Categories.View,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
			layoutService.focusPart(Parts.ACTIVITYBAR_PART);
		}
	});

registerThemingParticipant((theme, collector) => {

	const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
	if (activityBarActiveBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
	}

	const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
	if (activityBarActiveFocusBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
	}

	const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
	if (activityBarActiveBackgroundColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:before {
				content: "";
				position: absolute;
				top: 8px;
				left: 8px;
				height: 32px;
				width: 32px;
				z-index: 1;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.profile-activity-item:before {
				top: -6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover:before {
				outline: 1px solid;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover:before {
				outline: 1px dashed;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover:before {
				outline-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
						border-left-color: ${focusBorderColor};
					}
				`);
		}
	}
});
