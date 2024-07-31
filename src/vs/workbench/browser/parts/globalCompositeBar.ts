/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ActionBar, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { IActivity, IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { CompositeBarActionViewItem, CompositeBarAction, IActivityHoverOptions, ICompositeBarActionViewItemOptions, ICompositeBarColors } from 'vs/workbench/browser/parts/compositeBarActions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Action, IAction, Separator, SubmenuAction, toAction } from 'vs/base/common/actions';
import { IMenu, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { addDisposableListener, EventType, append, clearNode, hide, show, EventHelper, $, runWhenWindowIdle, getWindow } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import { AnchorAlignment, AnchorAxisAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { Lazy } from 'vs/base/common/lazy';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets';
import { AuthenticationSessionInfo, getCurrentAuthenticationSessionInfo } from 'vs/workbench/services/authentication/browser/authenticationService';
import { AuthenticationSessionAccount, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { DEFAULT_ICON } from 'vs/workbench/services/userDataProfile/common/userDataProfileIcons';
import { isString } from 'vs/base/common/types';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND } from 'vs/workbench/common/theme';
import { IBaseActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class GlobalCompositeBar extends Disposable {

	private static readonly ACCOUNTS_ACTION_INDEX = 0;
	static readonly ACCOUNTS_ICON = registerIcon('accounts-view-bar-icon', Codicon.account, localize('accountsViewBarIcon', "Accounts icon in the view bar."));

	readonly element: HTMLElement;

	private readonly globalActivityAction = this._register(new Action(GLOBAL_ACTIVITY_ID));
	private readonly accountAction = this._register(new Action(ACCOUNTS_ACTIVITY_ID));
	private readonly globalActivityActionBar: ActionBar;

	constructor(
		private readonly contextMenuActionsProvider: () => IAction[],
		private readonly colors: (theme: IColorTheme) => ICompositeBarColors,
		private readonly activityHoverOptions: IActivityHoverOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();

		this.element = document.createElement('div');
		const contextMenuAlignmentOptions = () => ({
			anchorAlignment: configurationService.getValue('workbench.sideBar.location') === 'left' ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT,
			anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL
		});
		this.globalActivityActionBar = this._register(new ActionBar(this.element, {
			actionViewItemProvider: (action, options) => {
				if (action.id === GLOBAL_ACTIVITY_ID) {
					return this.instantiationService.createInstance(GlobalActivityActionViewItem, this.contextMenuActionsProvider, { ...options, colors: this.colors, hoverOptions: this.activityHoverOptions }, contextMenuAlignmentOptions);
				}

				if (action.id === ACCOUNTS_ACTIVITY_ID) {
					return this.instantiationService.createInstance(AccountsActivityActionViewItem,
						this.contextMenuActionsProvider,
						{
							...options,
							colors: this.colors,
							hoverOptions: this.activityHoverOptions
						},
						contextMenuAlignmentOptions,
						(actions: IAction[]) => {
							actions.unshift(...[
								toAction({ id: 'hideAccounts', label: localize('hideAccounts', "Hide Accounts"), run: () => setAccountsActionVisible(storageService, false) }),
								new Separator()
							]);
						});
				}

				throw new Error(`No view item for action '${action.id}'`);
			},
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: localize('manage', "Manage"),
			preventLoopNavigation: true
		}));

		if (this.accountsVisibilityPreference) {
			this.globalActivityActionBar.push(this.accountAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
		}

		this.globalActivityActionBar.push(this.globalActivityAction);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (!this._store.isDisposed) {
				this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, this._store)(() => this.toggleAccountsActivity()));
			}
		});
	}

	create(parent: HTMLElement): void {
		parent.appendChild(this.element);
	}

	focus(): void {
		this.globalActivityActionBar.focus(true);
	}

	size(): number {
		return this.globalActivityActionBar.viewItems.length;
	}

	getContextMenuActions(): IAction[] {
		return [toAction({ id: 'toggleAccountsVisibility', label: localize('accounts', "Accounts"), checked: this.accountsVisibilityPreference, run: () => this.accountsVisibilityPreference = !this.accountsVisibilityPreference })];
	}

	private toggleAccountsActivity() {
		if (this.globalActivityActionBar.length() === 2 && this.accountsVisibilityPreference) {
			return;
		}
		if (this.globalActivityActionBar.length() === 2) {
			this.globalActivityActionBar.pull(GlobalCompositeBar.ACCOUNTS_ACTION_INDEX);
		} else {
			this.globalActivityActionBar.push(this.accountAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
		}
	}

	private get accountsVisibilityPreference(): boolean {
		return isAccountsActionVisible(this.storageService);
	}

	private set accountsVisibilityPreference(value: boolean) {
		setAccountsActionVisible(this.storageService, value);
	}
}

abstract class AbstractGlobalActivityActionViewItem extends CompositeBarActionViewItem {

	constructor(
		private readonly menuId: MenuId,
		action: CompositeBarAction,
		options: ICompositeBarActionViewItemOptions,
		private readonly contextMenuActionsProvider: () => IAction[],
		private readonly contextMenuAlignmentOptions: () => Readonly<{ anchorAlignment: AnchorAlignment; anchorAxisAlignment: AnchorAxisAlignment }> | undefined,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IActivityService private readonly activityService: IActivityService,
	) {
		super(action, { draggable: false, icon: true, hasPopup: true, ...options }, () => true, themeService, hoverService, configurationService, keybindingService);

		this.updateItemActivity();
		this._register(this.activityService.onDidChangeActivity(viewContainerOrAction => {
			if (isString(viewContainerOrAction) && viewContainerOrAction === this.compositeBarActionItem.id) {
				this.updateItemActivity();
			}
		}));
	}

	private updateItemActivity(): void {
		const activities = this.activityService.getActivity(this.compositeBarActionItem.id);
		let activity = activities[0];
		if (activity) {
			const { badge, priority } = activity;
			if (badge instanceof NumberBadge && activities.length > 1) {
				const cumulativeNumberBadge = this.getCumulativeNumberBadge(activities, priority ?? 0);
				activity = { badge: cumulativeNumberBadge };
			}
		}
		(this.action as CompositeBarAction).activity = activity;
	}

	private getCumulativeNumberBadge(activityCache: IActivity[], priority: number): NumberBadge {
		const numberActivities = activityCache.filter(activity => activity.badge instanceof NumberBadge && (activity.priority ?? 0) === priority);
		const number = numberActivities.reduce((result, activity) => { return result + (<NumberBadge>activity.badge).number; }, 0);
		const descriptorFn = (): string => {
			return numberActivities.reduce((result, activity, index) => {
				result = result + (<NumberBadge>activity.badge).getDescription();
				if (index < numberActivities.length - 1) {
					result = `${result}\n`;
				}

				return result;
			}, '');
		};

		return new NumberBadge(number, descriptorFn);
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
			// Let the item decide on the context menu instead of the toolbar
			e.stopPropagation();

			const disposables = new DisposableStore();
			const actions = await this.resolveContextMenuActions(disposables);

			const event = new StandardMouseEvent(getWindow(this.container), e);

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

	private async run(): Promise<void> {
		const disposables = new DisposableStore();
		const menu = disposables.add(this.menuService.createMenu(this.menuId, this.contextKeyService));
		const actions = await this.resolveMainMenuActions(menu, disposables);
		const { anchorAlignment, anchorAxisAlignment } = this.contextMenuAlignmentOptions() ?? { anchorAlignment: undefined, anchorAxisAlignment: undefined };

		this.contextMenuService.showContextMenu({
			getAnchor: () => this.label,
			anchorAlignment,
			anchorAxisAlignment,
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

export class AccountsActivityActionViewItem extends AbstractGlobalActivityActionViewItem {

	static readonly ACCOUNTS_VISIBILITY_PREFERENCE_KEY = 'workbench.activity.showAccounts';

	private readonly groupedAccounts: Map<string, (AuthenticationSessionAccount & { canSignOut: boolean })[]> = new Map();
	private readonly problematicProviders: Set<string> = new Set();

	private initialized = false;
	private sessionFromEmbedder = new Lazy<Promise<AuthenticationSessionInfo | undefined>>(() => getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService));

	constructor(
		contextMenuActionsProvider: () => IAction[],
		options: ICompositeBarActionViewItemOptions,
		contextMenuAlignmentOptions: () => Readonly<{ anchorAlignment: AnchorAlignment; anchorAxisAlignment: AnchorAxisAlignment }> | undefined,
		private readonly fillContextMenuActions: (actions: IAction[]) => void,
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
		@IKeybindingService keybindingService: IKeybindingService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ILogService private readonly logService: ILogService,
		@IActivityService activityService: IActivityService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService
	) {
		const action = instantiationService.createInstance(CompositeBarAction, {
			id: ACCOUNTS_ACTIVITY_ID,
			name: localize('accounts', "Accounts"),
			classNames: ThemeIcon.asClassNameArray(GlobalCompositeBar.ACCOUNTS_ICON)
		});
		super(MenuId.AccountsContext, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService);
		this._register(action);
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
			if (e.event.removed) {
				for (const removed of e.event.removed) {
					this.removeAccount(e.providerId, removed.account);
				}
			}
			for (const changed of [...(e.event.changed ?? []), ...(e.event.added ?? [])]) {
				try {
					await this.addOrUpdateAccount(e.providerId, changed.account);
				} catch (e) {
					this.logService.error(e);
				}
			}
		}));
	}

	// This function exists to ensure that the accounts are added for auth providers that had already been registered
	// before the menu was created.
	private async initialize(): Promise<void> {
		// Resolving the menu doesn't need to happen immediately, so we can wait until after the workbench has been restored
		// and only run this when the system is idle.
		await this.lifecycleService.when(LifecyclePhase.Restored);
		if (this._store.isDisposed) {
			return;
		}
		const disposable = this._register(runWhenWindowIdle(getWindow(this.element), async () => {
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
			const providerLabel = this.authenticationService.getProvider(providerId).label;
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
				const manageExtensionsAction = toAction({
					id: `configureSessions${account.label}`,
					label: localize('manageTrustedExtensions', "Manage Trusted Extensions"),
					enabled: true,
					run: () => this.commandService.executeCommand('_manageTrustedExtensionsForAccount', { providerId, accountLabel: account.label })
				});

				const providerSubMenuActions: IAction[] = [manageExtensionsAction];

				if (account.canSignOut) {
					providerSubMenuActions.push(toAction({
						id: 'signOut',
						label: localize('signOut', "Sign Out"),
						enabled: true,
						run: () => this.commandService.executeCommand('_signOutOfAccount', { providerId, accountLabel: account.label })
					}));
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
		this.fillContextMenuActions(actions);
		return actions;
	}

	//#endregion

	//#region groupedAccounts helpers

	private async addOrUpdateAccount(providerId: string, account: AuthenticationSessionAccount): Promise<void> {
		let accounts = this.groupedAccounts.get(providerId);
		if (!accounts) {
			accounts = [];
			this.groupedAccounts.set(providerId, accounts);
		}

		const sessionFromEmbedder = await this.sessionFromEmbedder.value;
		let canSignOut = true;
		if (
			sessionFromEmbedder												// if we have a session from the embedder
			&& !sessionFromEmbedder.canSignOut								// and that session says we can't sign out
			&& (await this.authenticationService.getSessions(providerId))	// and that session is associated with the account we are adding/updating
				.some(s =>
					s.id === sessionFromEmbedder.id
					&& s.account.id === account.id
				)
		) {
			canSignOut = false;
		}

		const existingAccount = accounts.find(a => a.label === account.label);
		if (existingAccount) {
			// if we have an existing account and we discover that we
			// can't sign out of it, update the account to mark it as "can't sign out"
			if (!canSignOut) {
				existingAccount.canSignOut = canSignOut;
			}
		} else {
			accounts.push({ ...account, canSignOut });
		}
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

export class GlobalActivityActionViewItem extends AbstractGlobalActivityActionViewItem {

	private profileBadge: HTMLElement | undefined;
	private profileBadgeContent: HTMLElement | undefined;

	constructor(
		contextMenuActionsProvider: () => IAction[],
		options: ICompositeBarActionViewItemOptions,
		contextMenuAlignmentOptions: () => Readonly<{ anchorAlignment: AnchorAlignment; anchorAxisAlignment: AnchorAxisAlignment }> | undefined,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IActivityService activityService: IActivityService,
	) {
		const action = instantiationService.createInstance(CompositeBarAction, {
			id: GLOBAL_ACTIVITY_ID,
			name: localize('manage', "Manage"),
			classNames: ThemeIcon.asClassNameArray(userDataProfileService.currentProfile.icon ? ThemeIcon.fromId(userDataProfileService.currentProfile.icon) : DEFAULT_ICON)
		});
		super(MenuId.GlobalActivity, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService);
		this._register(action);
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => {
			action.compositeBarActionItem = {
				...action.compositeBarActionItem,
				classNames: ThemeIcon.asClassNameArray(userDataProfileService.currentProfile.icon ? ThemeIcon.fromId(userDataProfileService.currentProfile.icon) : DEFAULT_ICON)
			};
		}));
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

		if (this.userDataProfileService.currentProfile.icon && this.userDataProfileService.currentProfile.icon !== DEFAULT_ICON.id) {
			return;
		}

		if ((this.action as CompositeBarAction).activity) {
			return;
		}

		show(this.profileBadge);
		this.profileBadgeContent.classList.toggle('profile-text-overlay', true);
		this.profileBadgeContent.classList.toggle('profile-icon-overlay', false);
		this.profileBadgeContent.textContent = this.userDataProfileService.currentProfile.name.substring(0, 2).toUpperCase();
	}

	protected override updateActivity(): void {
		super.updateActivity();
		this.updateProfileBadge();
	}

	protected override computeTitle(): string {
		return this.userDataProfileService.currentProfile.isDefault ? super.computeTitle() : localize('manage profile', "Manage {0} (Profile)", this.userDataProfileService.currentProfile.name);
	}
}

export class SimpleAccountActivityActionViewItem extends AccountsActivityActionViewItem {

	constructor(
		hoverOptions: IActivityHoverOptions,
		options: IBaseActionViewItemOptions,
		@IThemeService themeService: IThemeService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IHoverService hoverService: IHoverService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ISecretStorageService secretStorageService: ISecretStorageService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IActivityService activityService: IActivityService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService
	) {
		super(() => simpleActivityContextMenuActions(storageService, true),
			{
				...options,
				colors: theme => ({
					badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
					badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				}),
				hoverOptions,
				compact: true,
			}, () => undefined, actions => actions, themeService, lifecycleService, hoverService, contextMenuService, menuService, contextKeyService, authenticationService, environmentService, productService, configurationService, keybindingService, secretStorageService, logService, activityService, instantiationService, commandService);
	}
}

export class SimpleGlobalActivityActionViewItem extends GlobalActivityActionViewItem {

	constructor(
		hoverOptions: IActivityHoverOptions,
		options: IBaseActionViewItemOptions,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IActivityService activityService: IActivityService,
		@IStorageService storageService: IStorageService
	) {
		super(() => simpleActivityContextMenuActions(storageService, false),
			{
				...options,
				colors: theme => ({
					badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
					badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				}),
				hoverOptions,
				compact: true,
			}, () => undefined, userDataProfileService, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService, instantiationService, activityService);
	}
}

function simpleActivityContextMenuActions(storageService: IStorageService, isAccount: boolean): IAction[] {
	const currentElementContextMenuActions: IAction[] = [];
	if (isAccount) {
		currentElementContextMenuActions.push(
			toAction({ id: 'hideAccounts', label: localize('hideAccounts', "Hide Accounts"), run: () => setAccountsActionVisible(storageService, false) }),
			new Separator()
		);
	}
	return [
		...currentElementContextMenuActions,
		toAction({ id: 'toggle.hideAccounts', label: localize('accounts', "Accounts"), checked: isAccountsActionVisible(storageService), run: () => setAccountsActionVisible(storageService, !isAccountsActionVisible(storageService)) }),
		toAction({ id: 'toggle.hideManage', label: localize('manage', "Manage"), checked: true, enabled: false, run: () => { throw new Error('"Manage" can not be hidden'); } })
	];
}

export function isAccountsActionVisible(storageService: IStorageService): boolean {
	return storageService.getBoolean(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, StorageScope.PROFILE, true);
}

function setAccountsActionVisible(storageService: IStorageService, visible: boolean) {
	storageService.store(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, visible, StorageScope.PROFILE, StorageTarget.USER);
}
