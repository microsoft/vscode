/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activityaction';
import { localize } from 'vs/nls';
import { EventType, addDisposableListener, EventHelper } from 'vs/base/browser/dom';
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
import { ActivityAction, ActivityActionViewItem, IActivityActionViewItemOptions, IActivityHoverOptions, ICompositeBar, ICompositeBarColors, ToggleCompositePinnedAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IActivity } from 'vs/workbench/common/activity';
import { ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_SETTINGS_PROFILE_BACKGROUND, ACTIVITY_BAR_SETTINGS_PROFILE_HOVER_FOREGROUND } from 'vs/workbench/common/theme';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { getCurrentAuthenticationSessionInfo } from 'vs/workbench/services/authentication/browser/authenticationService';
import { AuthenticationSession, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
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
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { IUserDataProfileService, ManageProfilesSubMenu, PROFILES_CATEGORY } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';

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
		super(action, options, themeService, hoverService, configurationService, keybindingService);
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
			const anchor = {
				x: event.posx,
				y: event.posy
			};

			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
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
			onHide: () => disposables.dispose()
		});

	}

	protected async resolveMainMenuActions(menu: IMenu, _disposable: DisposableStore): Promise<IAction[]> {
		const actions: IAction[] = [];
		createAndFillInActionBarActions(menu, undefined, { primary: [], secondary: actions });
		return actions;
	}

}

export class AccountsActivityActionViewItem extends MenuActivityActionViewItem {

	static readonly ACCOUNTS_VISIBILITY_PREFERENCE_KEY = 'workbench.activity.showAccounts';

	constructor(
		action: ActivityAction,
		contextMenuActionsProvider: () => IAction[],
		colors: (theme: IColorTheme) => ICompositeBarColors,
		activityHoverOptions: IActivityHoverOptions,
		@IThemeService themeService: IThemeService,
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
		@ICredentialsService private readonly credentialsService: ICredentialsService,
	) {
		super(MenuId.AccountsContext, action, contextMenuActionsProvider, true, colors, activityHoverOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService);
	}

	protected override async resolveMainMenuActions(accountsMenu: IMenu, disposables: DisposableStore): Promise<IAction[]> {
		await super.resolveMainMenuActions(accountsMenu, disposables);

		const otherCommands = accountsMenu.getActions();
		const providers = this.authenticationService.getProviderIds();
		const allSessions = providers.map(async providerId => {
			try {
				const sessions = await this.authenticationService.getSessions(providerId);

				const groupedSessions: { [label: string]: AuthenticationSession[] } = {};
				sessions.forEach(session => {
					if (groupedSessions[session.account.label]) {
						groupedSessions[session.account.label].push(session);
					} else {
						groupedSessions[session.account.label] = [session];
					}
				});

				return { providerId, sessions: groupedSessions };
			} catch {
				return { providerId };
			}
		});

		const result = await Promise.all(allSessions);
		let menus: IAction[] = [];
		const authenticationSession = await getCurrentAuthenticationSessionInfo(this.credentialsService, this.productService);
		result.forEach(sessionInfo => {
			const providerDisplayName = this.authenticationService.getLabel(sessionInfo.providerId);

			if (sessionInfo.sessions) {
				Object.keys(sessionInfo.sessions).forEach(accountName => {
					const manageExtensionsAction = disposables.add(new Action(`configureSessions${accountName}`, localize('manageTrustedExtensions', "Manage Trusted Extensions"), '', true, () => {
						return this.authenticationService.manageTrustedExtensionsForAccount(sessionInfo.providerId, accountName);
					}));

					const signOutAction = disposables.add(new Action('signOut', localize('signOut', "Sign Out"), '', true, () => {
						return this.authenticationService.removeAccountSessions(sessionInfo.providerId, accountName, sessionInfo.sessions[accountName]);
					}));

					const providerSubMenuActions = [manageExtensionsAction];

					const hasEmbedderAccountSession = sessionInfo.sessions[accountName].some(session => session.id === (authenticationSession?.id));
					if (!hasEmbedderAccountSession || authenticationSession?.canSignOut) {
						providerSubMenuActions.push(signOutAction);
					}

					const providerSubMenu = new SubmenuAction('activitybar.submenu', `${accountName} (${providerDisplayName})`, providerSubMenuActions);
					menus.push(providerSubMenu);
				});
			} else {
				const providerUnavailableAction = disposables.add(new Action('providerUnavailable', localize('authProviderUnavailable', '{0} is currently unavailable', providerDisplayName)));
				menus.push(providerUnavailableAction);
			}
		});

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
}

export interface IProfileActivity extends IActivity {
	readonly icon: boolean;
}

export class ProfilesActivityActionViewItem extends MenuActivityActionViewItem {

	static readonly PROFILES_VISIBILITY_PREFERENCE_KEY = 'workbench.activity.showProfiles';

	constructor(
		action: ActivityAction,
		contextMenuActionsProvider: () => IAction[],
		colors: (theme: IColorTheme) => ICompositeBarColors,
		hoverOptions: IActivityHoverOptions,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(ManageProfilesSubMenu, action, contextMenuActionsProvider, (<IProfileActivity>action.activity).icon, colors, hoverOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.container.classList.add('profile-activity-item');
	}

	protected override async resolveContextMenuActions(disposables: DisposableStore): Promise<IAction[]> {
		const actions = await super.resolveContextMenuActions(disposables);

		actions.unshift(...[
			toAction({ id: 'hideprofiles', label: localize('hideprofiles', "Hide {0}", PROFILES_CATEGORY.value), run: () => this.storageService.store(ProfilesActivityActionViewItem.PROFILES_VISIBILITY_PREFERENCE_KEY, false, StorageScope.PROFILE, StorageTarget.USER) }),
			new Separator()
		]);

		return actions;
	}

	protected override computeTitle(): string {
		return localize('profiles', "{0} (Settings Profile)", this.userDataProfileService.currentProfile.name);
	}

}

export class GlobalActivityActionViewItem extends MenuActivityActionViewItem {

	constructor(
		action: ActivityAction,
		contextMenuActionsProvider: () => IAction[],
		colors: (theme: IColorTheme) => ICompositeBarColors,
		activityHoverOptions: IActivityHoverOptions,
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
	}
}

export class PlaceHolderViewContainerActivityAction extends ViewContainerActivityAction { }

export class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {

	constructor(id: string, compositeBar: ICompositeBar) {
		super({ id, name: id, cssClass: undefined }, compositeBar);
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
	const activityBarForegroundColor = theme.getColor(ACTIVITY_BAR_FOREGROUND);
	if (activityBarForegroundColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label:not(.codicon):not(.profile-activity-item),
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .action-label:not(.codicon):not(.profile-activity-item),
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label:not(.codicon):not(.profile-activity-item) {
				background-color: ${activityBarForegroundColor} !important;
			}
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label.codicon,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .action-label.codicon,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label.codicon {
				color: ${activityBarForegroundColor} !important;
			}
		`);
	}

	const activityBarSettingsProfileBgColor = theme.getColor(ACTIVITY_BAR_SETTINGS_PROFILE_BACKGROUND);
	if (activityBarSettingsProfileBgColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label.profile-activity-item,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label.profile-activity-item,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label.profile-activity-item {
				background-color: ${activityBarSettingsProfileBgColor} !important;
			}
		`);
	}

	const activityBarSettingsProfileHoverFgColor = theme.getColor(ACTIVITY_BAR_SETTINGS_PROFILE_HOVER_FOREGROUND);
	if (activityBarSettingsProfileHoverFgColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label.profile-activity-item,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .action-label.profile-activity-item,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label.profile-activity-item {
				color: ${activityBarSettingsProfileHoverFgColor} !important;
			}
		`);
	}

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
