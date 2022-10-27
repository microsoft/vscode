/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activitybarpart';
import { localize } from 'vs/nls';
import { ActionsOrientation, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { GLOBAL_ACTIVITY_ID, IActivity, ACCOUNTS_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { Part } from 'vs/workbench/browser/part';
import { GlobalActivityActionViewItem, ViewContainerActivityAction, PlaceHolderToggleCompositePinnedAction, PlaceHolderViewContainerActivityAction, AccountsActivityActionViewItem, ProfilesActivityActionViewItem, IProfileActivity } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { IBadge, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { ToggleActivityBarVisibilityAction, ToggleSidebarPositionAction } from 'vs/workbench/browser/actions/layoutActions';
import { IThemeService, IColorTheme, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_SETTINGS_PROFILE_FOREGROUND } from 'vs/workbench/common/theme';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { CompositeBar, ICompositeBarItem, CompositeDragAndDrop } from 'vs/workbench/browser/parts/compositeBar';
import { Dimension, createCSSRule, asCSSUrl, addDisposableListener, EventType, isAncestor } from 'vs/base/browser/dom';
import { IStorageService, StorageScope, IStorageValueChangeEvent, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ToggleCompositePinnedAction, ICompositeBarColors, ActivityAction, ICompositeActivity, IActivityHoverOptions } from 'vs/workbench/browser/parts/compositeBarActions';
import { IViewDescriptorService, ViewContainer, IViewContainerModel, ViewContainerLocation } from 'vs/workbench/common/views';
import { getEnabledViewContainerContextKey } from 'vs/workbench/common/contextkeys';
import { IContextKeyService, ContextKeyExpr, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { assertIsDefined, isString } from 'vs/base/common/types';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getMenuBarVisibility } from 'vs/platform/window/common/window';
import { isNative } from 'vs/base/common/platform';
import { Before2D } from 'vs/workbench/browser/dnd';
import { Codicon } from 'vs/base/common/codicons';
import { IAction, Separator, toAction } from 'vs/base/common/actions';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { StringSHA1 } from 'vs/base/common/hash';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { GestureEvent } from 'vs/base/browser/touch';
import { IPaneCompositePart, IPaneCompositeSelectorPart } from 'vs/workbench/browser/parts/paneCompositePart';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IProfileStorageRegistry } from 'vs/workbench/services/userDataProfile/common/userDataProfileStorageRegistry';
import { IUserDataProfileService, PROFILES_TTILE } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

interface IPlaceholderViewContainer {
	readonly id: string;
	readonly name?: string;
	readonly iconUrl?: UriComponents;
	readonly themeIcon?: ThemeIcon;
	readonly isBuiltin?: boolean;
	readonly views?: { when?: string }[];
}

interface IPinnedViewContainer {
	readonly id: string;
	readonly pinned: boolean;
	readonly order?: number;
	readonly visible: boolean;
}

interface ICachedViewContainer {
	readonly id: string;
	name?: string;
	icon?: URI | ThemeIcon;
	readonly pinned: boolean;
	readonly order?: number;
	visible: boolean;
	isBuiltin?: boolean;
	views?: { when?: string }[];
}

export class ActivitybarPart extends Part implements IPaneCompositeSelectorPart {

	declare readonly _serviceBrand: undefined;

	private static readonly PINNED_VIEW_CONTAINERS = 'workbench.activity.pinnedViewlets2';
	private static readonly PLACEHOLDER_VIEW_CONTAINERS = 'workbench.activity.placeholderViewlets';
	private static readonly ACTION_HEIGHT = 48;
	private static readonly ACCOUNTS_ACTION_INDEX = 0;

	private static readonly GEAR_ICON = registerIcon('settings-view-bar-icon', Codicon.settingsGear, localize('settingsViewBarIcon', "Settings icon in the view bar."));
	private static readonly ACCOUNTS_ICON = registerIcon('accounts-view-bar-icon', Codicon.account, localize('accountsViewBarIcon', "Accounts icon in the view bar."));

	//#region IView

	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 48;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	private content: HTMLElement | undefined;

	private menuBar: CustomMenubarControl | undefined;
	private menuBarContainer: HTMLElement | undefined;

	private compositeBar: CompositeBar;
	private compositeBarContainer: HTMLElement | undefined;

	private globalActivityAction: ActivityAction | undefined;
	private globalActivityActionBar: ActionBar | undefined;
	private globalActivitiesContainer: HTMLElement | undefined;
	private readonly globalActivity: ICompositeActivity[] = [];

	private accountsActivityAction: ActivityAction | undefined;
	private profilesActivityAction: ActivityAction | undefined;

	private readonly accountsActivity: ICompositeActivity[] = [];

	private readonly compositeActions = new Map<string, { activityAction: ViewContainerActivityAction; pinnedAction: ToggleCompositePinnedAction }>();
	private readonly viewContainerDisposables = new Map<string, IDisposable>();

	private readonly keyboardNavigationDisposables = this._register(new DisposableStore());

	private readonly location = ViewContainerLocation.Sidebar;
	private hasExtensionsRegistered: boolean = false;

	private readonly enabledViewContainersContextKeys: Map<string, IContextKey<boolean>> = new Map<string, IContextKey<boolean>>();

	constructor(
		private readonly paneCompositePart: IPaneCompositePart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);

		for (const cachedViewContainer of this.cachedViewContainers) {
			cachedViewContainer.visible = !this.shouldBeHidden(cachedViewContainer.id, cachedViewContainer);
		}
		this.compositeBar = this.createCompositeBar();

		this.onDidRegisterViewContainers(this.getViewContainers());

		this.registerListeners();

		Registry.as<IProfileStorageRegistry>(Extensions.ProfileStorageRegistry)
			.registerKeys([{
				key: ActivitybarPart.PINNED_VIEW_CONTAINERS,
				description: localize('pinned view containers', "Activity bar entries visibility customizations")
			}, {
				key: AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY,
				description: localize('accounts visibility key', "Accounts entry visibility customization in the activity bar.")
			}]);
	}

	private createCompositeBar() {
		const cachedItems = this.cachedViewContainers
			.map(container => ({
				id: container.id,
				name: container.name,
				visible: container.visible,
				order: container.order,
				pinned: container.pinned
			}));

		return this._register(this.instantiationService.createInstance(CompositeBar, cachedItems, {
			icon: true,
			orientation: ActionsOrientation.VERTICAL,
			activityHoverOptions: this.getActivityHoverOptions(),
			preventLoopNavigation: true,
			openComposite: async (compositeId, preserveFocus) => {
				return (await this.paneCompositePart.openPaneComposite(compositeId, !preserveFocus)) ?? null;
			},
			getActivityAction: compositeId => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: compositeId => this.getCompositeActions(compositeId).pinnedAction,
			getOnCompositeClickAction: compositeId => toAction({ id: compositeId, label: '', run: async () => this.paneCompositePart.getActivePaneComposite()?.getId() === compositeId ? this.paneCompositePart.hideActivePaneComposite() : this.paneCompositePart.openPaneComposite(compositeId) }),
			fillExtraContextMenuActions: (actions, e?: MouseEvent | GestureEvent) => {
				// Menu
				const menuBarVisibility = getMenuBarVisibility(this.configurationService);
				if (menuBarVisibility === 'compact' || menuBarVisibility === 'hidden' || menuBarVisibility === 'toggle') {
					actions.unshift(...[toAction({ id: 'toggleMenuVisibility', label: localize('menu', "Menu"), checked: menuBarVisibility === 'compact', run: () => this.configurationService.updateValue('window.menuBarVisibility', menuBarVisibility === 'compact' ? 'toggle' : 'compact') }), new Separator()]);
				}

				if (menuBarVisibility === 'compact' && this.menuBarContainer && e?.target) {
					if (isAncestor(e.target as Node, this.menuBarContainer)) {
						actions.unshift(...[toAction({ id: 'hideCompactMenu', label: localize('hideMenu', "Hide Menu"), run: () => this.configurationService.updateValue('window.menuBarVisibility', 'toggle') }), new Separator()]);
					}
				}

				// Accounts
				actions.push(new Separator());
				actions.push(toAction({ id: 'toggleAccountsVisibility', label: localize('accounts', "Accounts"), checked: this.accountsVisibilityPreference, run: () => this.accountsVisibilityPreference = !this.accountsVisibilityPreference }));
				if (this.userDataProfilesService.isEnabled()) {
					actions.push(toAction({ id: 'toggleProfilesVisibility', label: PROFILES_TTILE.value, checked: this.profilesVisibilityPreference, run: () => this.profilesVisibilityPreference = !this.profilesVisibilityPreference }));
				}
				actions.push(new Separator());

				// Toggle Sidebar
				actions.push(toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarPositionAction().run(accessor)) }));

				// Toggle Activity Bar
				actions.push(toAction({ id: ToggleActivityBarVisibilityAction.ID, label: localize('hideActivitBar', "Hide Activity Bar"), run: () => this.instantiationService.invokeFunction(accessor => new ToggleActivityBarVisibilityAction().run(accessor)) }));
			},
			getContextMenuActionsForComposite: compositeId => this.getContextMenuActionsForComposite(compositeId),
			getDefaultCompositeId: () => this.viewDescriptorService.getDefaultViewContainer(this.location)?.id,
			hidePart: () => this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART),
			dndHandler: new CompositeDragAndDrop(this.viewDescriptorService, ViewContainerLocation.Sidebar,
				async (id: string, focus?: boolean) => { return await this.paneCompositePart.openPaneComposite(id, focus) ?? null; },
				(from: string, to: string, before?: Before2D) => this.compositeBar.move(from, to, before?.verticallyBefore),
				() => this.compositeBar.getCompositeBarItems(),
			),
			compositeSize: 52,
			colors: (theme: IColorTheme) => this.getActivitybarItemColors(theme),
			overflowActionSize: ActivitybarPart.ACTION_HEIGHT
		}));
	}

	private getActivityHoverOptions(): IActivityHoverOptions {
		return {
			position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT,
		};
	}

	private getContextMenuActionsForComposite(compositeId: string): IAction[] {
		const actions: IAction[] = [];

		const viewContainer = this.viewDescriptorService.getViewContainerById(compositeId)!;
		const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer)!;
		if (defaultLocation !== this.viewDescriptorService.getViewContainerLocation(viewContainer)) {
			actions.push(toAction({ id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => this.viewDescriptorService.moveViewContainerToLocation(viewContainer, defaultLocation) }));
		} else {
			const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			if (viewContainerModel.allViewDescriptors.length === 1) {
				const viewToReset = viewContainerModel.allViewDescriptors[0];
				const defaultContainer = this.viewDescriptorService.getDefaultContainerById(viewToReset.id)!;
				if (defaultContainer !== viewContainer) {
					actions.push(toAction({ id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => this.viewDescriptorService.moveViewsToContainer([viewToReset], defaultContainer) }));
				}
			}
		}

		return actions;
	}

	private registerListeners(): void {

		// View Container Changes
		this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeViewContainers(added, removed)));
		this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeViewContainerLocation(viewContainer, from, to)));

		// View Container Visibility Changes
		this.paneCompositePart.onDidPaneCompositeOpen(e => this.onDidChangeViewContainerVisibility(e.getId(), true));
		this.paneCompositePart.onDidPaneCompositeClose(e => this.onDidChangeViewContainerVisibility(e.getId(), false));

		// Extension registration
		const disposables = this._register(new DisposableStore());
		this._register(this.extensionService.onDidRegisterExtensions(() => {
			disposables.clear();
			this.onDidRegisterExtensions();
			this.compositeBar.onDidChange(() => this.saveCachedViewContainers(), this, disposables);
			this.storageService.onDidChangeValue(e => this.onDidStorageValueChange(e), this, disposables);
		}));

		// Register for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.menuBarVisibility')) {
				if (getMenuBarVisibility(this.configurationService) === 'compact') {
					this.installMenubar();
				} else {
					this.uninstallMenubar();
				}
			}
		}));

		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.toggleProfilesActivityAction()));
		this._register(Event.any(this.userDataProfileService.onDidChangeCurrentProfile, this.userDataProfileService.onDidUpdateCurrentProfile)(() => this.updateProfilesActivityAction()));
	}

	private onDidChangeViewContainers(added: readonly { container: ViewContainer; location: ViewContainerLocation }[], removed: readonly { container: ViewContainer; location: ViewContainerLocation }[]) {
		removed.filter(({ location }) => location === ViewContainerLocation.Sidebar).forEach(({ container }) => this.onDidDeregisterViewContainer(container));
		this.onDidRegisterViewContainers(added.filter(({ location }) => location === ViewContainerLocation.Sidebar).map(({ container }) => container));
	}

	private onDidChangeViewContainerLocation(container: ViewContainer, from: ViewContainerLocation, to: ViewContainerLocation) {
		if (from === this.location) {
			this.onDidDeregisterViewContainer(container);
		}

		if (to === this.location) {
			this.onDidRegisterViewContainers([container]);
		}
	}

	private onDidChangeViewContainerVisibility(id: string, visible: boolean) {
		if (visible) {
			// Activate view container action on opening of a view container
			this.onDidViewContainerVisible(id);
		} else {
			// Deactivate view container action on close
			this.compositeBar.deactivateComposite(id);
		}
	}

	private onDidRegisterExtensions(): void {
		this.hasExtensionsRegistered = true;

		// show/hide/remove composites
		for (const { id } of this.cachedViewContainers) {
			const viewContainer = this.getViewContainer(id);
			if (viewContainer) {
				this.showOrHideViewContainer(viewContainer);
			} else {
				if (this.viewDescriptorService.isViewContainerRemovedPermanently(id)) {
					this.removeComposite(id);
				} else {
					this.hideComposite(id);
				}
			}
		}

		this.saveCachedViewContainers();
	}

	private onDidViewContainerVisible(id: string): void {
		const viewContainer = this.getViewContainer(id);
		if (viewContainer) {

			// Update the composite bar by adding
			this.addComposite(viewContainer);
			this.compositeBar.activateComposite(viewContainer.id);

			if (this.shouldBeHidden(viewContainer)) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				if (viewContainerModel.activeViewDescriptors.length === 0) {
					// Update the composite bar by hiding
					this.hideComposite(viewContainer.id);
				}
			}
		}
	}

	showActivity(viewContainerOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (this.getViewContainer(viewContainerOrActionId)) {
			return this.compositeBar.showActivity(viewContainerOrActionId, badge, clazz, priority);
		}

		if (viewContainerOrActionId === GLOBAL_ACTIVITY_ID) {
			return this.showGlobalActivity(GLOBAL_ACTIVITY_ID, badge, clazz, priority);
		}

		if (viewContainerOrActionId === ACCOUNTS_ACTIVITY_ID) {
			return this.showGlobalActivity(ACCOUNTS_ACTIVITY_ID, badge, clazz, priority);
		}

		return Disposable.None;
	}

	private showGlobalActivity(activityId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (typeof priority !== 'number') {
			priority = 0;
		}

		const activity: ICompositeActivity = { badge, clazz, priority };
		const activityCache = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivity : this.accountsActivity;

		for (let i = 0; i <= activityCache.length; i++) {
			if (i === activityCache.length) {
				activityCache.push(activity);
				break;
			} else if (activityCache[i].priority <= priority) {
				activityCache.splice(i, 0, activity);
				break;
			}
		}
		this.updateGlobalActivity(activityId);

		return toDisposable(() => this.removeGlobalActivity(activityId, activity));
	}

	private removeGlobalActivity(activityId: string, activity: ICompositeActivity): void {
		const activityCache = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivity : this.accountsActivity;
		const index = activityCache.indexOf(activity);
		if (index !== -1) {
			activityCache.splice(index, 1);
			this.updateGlobalActivity(activityId);
		}
	}

	private updateGlobalActivity(activityId: string): void {
		const activityAction = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivityAction : this.accountsActivityAction;
		if (!activityAction) {
			return;
		}

		const activityCache = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivity : this.accountsActivity;
		if (activityCache.length) {
			const [{ badge, clazz, priority }] = activityCache;
			if (badge instanceof NumberBadge && activityCache.length > 1) {
				const cumulativeNumberBadge = this.getCumulativeNumberBadge(activityCache, priority);
				activityAction.setBadge(cumulativeNumberBadge);
			} else {
				activityAction.setBadge(badge, clazz);
			}
		} else {
			activityAction.setBadge(undefined);
		}
	}

	private getCumulativeNumberBadge(activityCache: ICompositeActivity[], priority: number): NumberBadge {
		const numberActivities = activityCache.filter(activity => activity.badge instanceof NumberBadge && activity.priority === priority);
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

	private uninstallMenubar() {
		if (this.menuBar) {
			this.menuBar.dispose();
			this.menuBar = undefined;
		}

		if (this.menuBarContainer) {
			this.menuBarContainer.remove();
			this.menuBarContainer = undefined;
			this.registerKeyboardNavigationListeners();
		}
	}

	private installMenubar() {
		if (this.menuBar) {
			return; // prevent menu bar from installing twice #110720
		}

		this.menuBarContainer = document.createElement('div');
		this.menuBarContainer.classList.add('menubar');

		const content = assertIsDefined(this.content);
		content.prepend(this.menuBarContainer);

		// Menubar: install a custom menu bar depending on configuration
		this.menuBar = this._register(this.instantiationService.createInstance(CustomMenubarControl));
		this.menuBar.create(this.menuBarContainer);

		this.registerKeyboardNavigationListeners();
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		this.content = document.createElement('div');
		this.content.classList.add('content');
		parent.appendChild(this.content);

		// Install menubar if compact
		if (getMenuBarVisibility(this.configurationService) === 'compact') {
			this.installMenubar();
		}

		// View Containers action bar
		this.compositeBarContainer = this.compositeBar.create(this.content);

		// Global action bar
		this.globalActivitiesContainer = document.createElement('div');
		this.content.appendChild(this.globalActivitiesContainer);

		this.createGlobalActivityActionBar(this.globalActivitiesContainer);

		// Keyboard Navigation
		this.registerKeyboardNavigationListeners();

		return this.content;
	}

	private registerKeyboardNavigationListeners(): void {
		this.keyboardNavigationDisposables.clear();

		// Up/Down arrow on compact menu
		if (this.menuBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.compositeBar?.focus();
				}
			}));
		}

		// Up/Down on Activity Icons
		if (this.compositeBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.globalActivityActionBar?.focus(true);
				} else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.menuBar?.toggleFocus();
				}
			}));
		}

		// Up arrow on global icons
		if (this.globalActivitiesContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.globalActivitiesContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.compositeBar?.focus(this.getVisiblePaneCompositeIds().length - 1);
				}
			}));
		}
	}

	private createGlobalActivityActionBar(container: HTMLElement): void {
		this.globalActivityActionBar = this._register(new ActionBar(container, {
			actionViewItemProvider: action => {
				if (action.id === 'workbench.actions.manage') {
					return this.instantiationService.createInstance(GlobalActivityActionViewItem, action as ActivityAction, () => this.compositeBar.getContextMenuActions(), (theme: IColorTheme) => this.getActivitybarItemColors(theme), this.getActivityHoverOptions());
				}

				if (action.id === 'workbench.actions.accounts') {
					return this.instantiationService.createInstance(AccountsActivityActionViewItem, action as ActivityAction, () => this.compositeBar.getContextMenuActions(), (theme: IColorTheme) => this.getActivitybarItemColors(theme), this.getActivityHoverOptions());
				}

				if (action.id === 'workbench.actions.profiles') {
					return this.instantiationService.createInstance(ProfilesActivityActionViewItem, action as ActivityAction, () => this.compositeBar.getContextMenuActions(), (theme: IColorTheme) => this.getSettingsProfileItemColors(theme), this.getActivityHoverOptions());
				}

				throw new Error(`No view item for action '${action.id}'`);
			},
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: localize('manage', "Manage"),
			animated: false,
			preventLoopNavigation: true
		}));

		this.globalActivityAction = this._register(new ActivityAction({
			id: 'workbench.actions.manage',
			name: localize('manage', "Manage"),
			cssClass: ThemeIcon.asClassName(ActivitybarPart.GEAR_ICON)
		}));

		if (this.accountsVisibilityPreference) {
			this.accountsActivityAction = this._register(new ActivityAction({
				id: 'workbench.actions.accounts',
				name: localize('accounts', "Accounts"),
				cssClass: ThemeIcon.asClassName(ActivitybarPart.ACCOUNTS_ICON)
			}));

			this.globalActivityActionBar.push(this.accountsActivityAction, { index: ActivitybarPart.ACCOUNTS_ACTION_INDEX });
		}

		this.globalActivityActionBar.push(this.globalActivityAction);

		if (this.profilesVisibilityPreference) {
			this.globalActivityActionBar.push(this.profilesActivityAction = new ActivityAction(this.createProfilesActivity()));
		}
	}

	private toggleAccountsActivity() {
		if (!!this.accountsActivityAction === this.accountsVisibilityPreference) {
			return;
		}
		if (this.globalActivityActionBar) {
			if (this.accountsActivityAction) {
				this.globalActivityActionBar.pull(ActivitybarPart.ACCOUNTS_ACTION_INDEX);
				this.accountsActivityAction = undefined;
			} else {
				this.accountsActivityAction = this._register(new ActivityAction({
					id: 'workbench.actions.accounts',
					name: localize('accounts', "Accounts"),
					cssClass: Codicon.account.classNames
				}));
				this.globalActivityActionBar.push(this.accountsActivityAction, { index: ActivitybarPart.ACCOUNTS_ACTION_INDEX });
			}
		}

		this.updateGlobalActivity(ACCOUNTS_ACTIVITY_ID);
	}

	private toggleProfilesActivityAction() {
		if (!!this.profilesActivityAction === this.profilesVisibilityPreference) {
			return;
		}
		if (this.globalActivityActionBar) {
			if (this.profilesActivityAction) {
				this.globalActivityActionBar.pull(this.globalActivityActionBar.length() - 1);
				this.profilesActivityAction = undefined;
			} else {
				this.globalActivityActionBar.push(this.profilesActivityAction = new ActivityAction(this.createProfilesActivity()));
			}
		}
	}

	private updateProfilesActivityAction() {
		if (!!this.profilesActivityAction !== this.profilesVisibilityPreference) {
			this.toggleProfilesActivityAction();
			return;
		}
		if (this.profilesActivityAction) {
			const activity = this.createProfilesActivity();
			if ((<IProfileActivity>this.profilesActivityAction.activity).icon === activity.icon) {
				this.profilesActivityAction.activity = activity;
			}
			// the icon has changed, so we need to recreate the action
			else if (this.globalActivityActionBar) {
				this.globalActivityActionBar.pull(this.globalActivityActionBar.length() - 1);
				this.globalActivityActionBar.push(this.profilesActivityAction = new ActivityAction(activity));
			}
		}
	}

	private createProfilesActivity(): IProfileActivity {
		const shortName = this.userDataProfileService.getShortName(this.userDataProfileService.currentProfile);
		const icon = ThemeIcon.fromString(shortName);
		return {
			id: 'workbench.actions.profiles',
			name: icon ? this.userDataProfileService.currentProfile.name : shortName,
			cssClass: icon ? `${ThemeIcon.asClassName(icon)} profile-activity-item` : 'profile-activity-item',
			icon: !!icon
		};
	}

	private getCompositeActions(compositeId: string): { activityAction: ViewContainerActivityAction; pinnedAction: ToggleCompositePinnedAction } {
		let compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			const viewContainer = this.getViewContainer(compositeId);
			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				compositeActions = {
					activityAction: this.instantiationService.createInstance(ViewContainerActivityAction, this.toActivity(viewContainerModel), this.paneCompositePart),
					pinnedAction: new ToggleCompositePinnedAction(this.toActivity(viewContainerModel), this.compositeBar)
				};
			} else {
				const cachedComposite = this.cachedViewContainers.filter(c => c.id === compositeId)[0];
				compositeActions = {
					activityAction: this.instantiationService.createInstance(PlaceHolderViewContainerActivityAction, ActivitybarPart.toActivity(compositeId, compositeId, cachedComposite?.icon, undefined), this.paneCompositePart),
					pinnedAction: new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar)
				};
			}

			this.compositeActions.set(compositeId, compositeActions);
		}

		return compositeActions;
	}

	private onDidRegisterViewContainers(viewContainers: readonly ViewContainer[]): void {
		for (const viewContainer of viewContainers) {
			this.addComposite(viewContainer);

			// Pin it by default if it is new
			const cachedViewContainer = this.cachedViewContainers.filter(({ id }) => id === viewContainer.id)[0];
			if (!cachedViewContainer) {
				this.compositeBar.pin(viewContainer.id);
			}

			// Active
			const visibleViewContainer = this.paneCompositePart.getActivePaneComposite();
			if (visibleViewContainer?.getId() === viewContainer.id) {
				this.compositeBar.activateComposite(viewContainer.id);
			}

			const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			this.updateActivity(viewContainer, viewContainerModel);
			this.showOrHideViewContainer(viewContainer);

			const disposables = new DisposableStore();
			disposables.add(viewContainerModel.onDidChangeContainerInfo(() => this.updateActivity(viewContainer, viewContainerModel)));
			disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.showOrHideViewContainer(viewContainer)));

			this.viewContainerDisposables.set(viewContainer.id, disposables);
		}
	}

	private onDidDeregisterViewContainer(viewContainer: ViewContainer): void {
		const disposable = this.viewContainerDisposables.get(viewContainer.id);
		disposable?.dispose();

		this.viewContainerDisposables.delete(viewContainer.id);
		this.removeComposite(viewContainer.id);
	}

	private updateActivity(viewContainer: ViewContainer, viewContainerModel: IViewContainerModel): void {
		const activity: IActivity = this.toActivity(viewContainerModel);
		const { activityAction, pinnedAction } = this.getCompositeActions(viewContainer.id);
		activityAction.updateActivity(activity);

		if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
			pinnedAction.setActivity(activity);
		}

		this.saveCachedViewContainers();
	}

	private toActivity(viewContainerModel: IViewContainerModel): IActivity {
		return ActivitybarPart.toActivity(viewContainerModel.viewContainer.id, viewContainerModel.title, viewContainerModel.icon, viewContainerModel.keybindingId);
	}

	private static toActivity(id: string, name: string, icon: URI | ThemeIcon | undefined, keybindingId: string | undefined): IActivity {
		let cssClass: string | undefined = undefined;
		let iconUrl: URI | undefined = undefined;
		if (URI.isUri(icon)) {
			iconUrl = icon;
			const cssUrl = asCSSUrl(icon);
			const hash = new StringSHA1();
			hash.update(cssUrl);
			cssClass = `activity-${id.replace(/\./g, '-')}-${hash.digest()}`;
			const iconClass = `.monaco-workbench .activitybar .monaco-action-bar .action-label.${cssClass}`;
			createCSSRule(iconClass, `
				mask: ${cssUrl} no-repeat 50% 50%;
				mask-size: 24px;
				-webkit-mask: ${cssUrl} no-repeat 50% 50%;
				-webkit-mask-size: 24px;
			`);
		} else if (ThemeIcon.isThemeIcon(icon)) {
			cssClass = ThemeIcon.asClassName(icon);
		}

		return { id, name, cssClass, iconUrl, keybindingId };
	}

	private showOrHideViewContainer(viewContainer: ViewContainer): void {
		let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
		if (!contextKey) {
			contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
			this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
		}
		if (this.shouldBeHidden(viewContainer)) {
			contextKey.set(false);
			this.hideComposite(viewContainer.id);
		} else {
			contextKey.set(true);
			this.addComposite(viewContainer);
		}
	}

	private shouldBeHidden(viewContainerOrId: string | ViewContainer, cachedViewContainer?: ICachedViewContainer): boolean {
		const viewContainer = isString(viewContainerOrId) ? this.getViewContainer(viewContainerOrId) : viewContainerOrId;
		const viewContainerId = isString(viewContainerOrId) ? viewContainerOrId : viewContainerOrId.id;

		if (viewContainer) {
			if (viewContainer.hideIfEmpty) {
				if (this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0) {
					return false;
				}
			} else {
				return false;
			}
		}

		// Check cache only if extensions are not yet registered and current window is not native (desktop) remote connection window
		if (!this.hasExtensionsRegistered && !(this.environmentService.remoteAuthority && isNative)) {
			cachedViewContainer = cachedViewContainer || this.cachedViewContainers.find(({ id }) => id === viewContainerId);

			// Show builtin ViewContainer if not registered yet
			if (!viewContainer && cachedViewContainer?.isBuiltin) {
				return false;
			}

			if (cachedViewContainer?.views?.length) {
				return cachedViewContainer.views.every(({ when }) => !!when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)));
			}
		}

		return true;
	}

	private addComposite(viewContainer: ViewContainer): void {
		this.compositeBar.addComposite({ id: viewContainer.id, name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value, order: viewContainer.order, requestedIndex: viewContainer.requestedIndex });
	}

	private hideComposite(compositeId: string): void {
		this.compositeBar.hideComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.delete(compositeId);
		}
	}

	private removeComposite(compositeId: string): void {
		this.compositeBar.removeComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.delete(compositeId);
		}
	}

	getPinnedPaneCompositeIds(): string[] {
		const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(v => v.id);
		return this.getViewContainers()
			.filter(v => this.compositeBar.isPinned(v.id))
			.sort((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id))
			.map(v => v.id);
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.compositeBar.getVisibleComposites()
			.filter(v => this.paneCompositePart.getActivePaneComposite()?.getId() === v.id || this.compositeBar.isPinned(v.id))
			.map(v => v.id);
	}

	focus(): void {
		this.compositeBar.focus();
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || '';
		container.style.backgroundColor = background;

		const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || '';
		container.classList.toggle('bordered', !!borderColor);
		container.style.borderColor = borderColor ? borderColor : '';
	}

	private getActivitybarItemColors(theme: IColorTheme): ICompositeBarColors {
		return {
			activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
			inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
			activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
			activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
			badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
			badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
			dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
			activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
		};
	}

	private getSettingsProfileItemColors(theme: IColorTheme): ICompositeBarColors {
		return {
			...this.getActivitybarItemColors(theme),
			activeForegroundColor: theme.getColor(ACTIVITY_BAR_SETTINGS_PROFILE_FOREGROUND),
			inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_SETTINGS_PROFILE_FOREGROUND),
		};
	}

	override layout(width: number, height: number): void {
		if (!this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			return;
		}

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout composite bar
		let availableHeight = contentAreaSize.height;
		if (this.menuBarContainer) {
			availableHeight -= this.menuBarContainer.clientHeight;
		}
		if (this.globalActivityActionBar) {
			availableHeight -= (this.globalActivityActionBar.viewItems.length * ActivitybarPart.ACTION_HEIGHT); // adjust height for global actions showing
		}
		this.compositeBar.layout(new Dimension(width, availableHeight));
	}

	private getViewContainer(id: string): ViewContainer | undefined {
		const viewContainer = this.viewDescriptorService.getViewContainerById(id);
		return viewContainer && this.viewDescriptorService.getViewContainerLocation(viewContainer) === this.location ? viewContainer : undefined;
	}

	private getViewContainers(): readonly ViewContainer[] {
		return this.viewDescriptorService.getViewContainersByLocation(this.location);
	}

	private onDidStorageValueChange(e: IStorageValueChangeEvent): void {
		if (e.key === ActivitybarPart.PINNED_VIEW_CONTAINERS && e.scope === StorageScope.PROFILE
			&& this.pinnedViewContainersValue !== this.getStoredPinnedViewContainersValue() /* This checks if current window changed the value or not */) {
			this._pinnedViewContainersValue = undefined;
			this._cachedViewContainers = undefined;

			const newCompositeItems: ICompositeBarItem[] = [];
			const compositeItems = this.compositeBar.getCompositeBarItems();

			for (const cachedViewContainer of this.cachedViewContainers) {
				newCompositeItems.push({
					id: cachedViewContainer.id,
					name: cachedViewContainer.name,
					order: cachedViewContainer.order,
					pinned: cachedViewContainer.pinned,
					visible: !!compositeItems.find(({ id }) => id === cachedViewContainer.id)
				});
			}

			for (let index = 0; index < compositeItems.length; index++) {
				// Add items currently exists but does not exist in new.
				if (!newCompositeItems.some(({ id }) => id === compositeItems[index].id)) {
					const viewContainer = this.viewDescriptorService.getViewContainerById(compositeItems[index].id);
					newCompositeItems.splice(index, 0, {
						...compositeItems[index],
						pinned: true,
						visible: true,
						order: viewContainer?.order,
					});
				}
			}

			this.compositeBar.setCompositeBarItems(newCompositeItems);
		}

		if (e.key === AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY && e.scope === StorageScope.PROFILE) {
			this.toggleAccountsActivity();
		}
		if (e.key === ProfilesActivityActionViewItem.PROFILES_VISIBILITY_PREFERENCE_KEY && e.scope === StorageScope.PROFILE) {
			this.toggleProfilesActivityAction();
		}
	}

	private saveCachedViewContainers(): void {
		const state: ICachedViewContainer[] = [];

		const compositeItems = this.compositeBar.getCompositeBarItems();
		for (const compositeItem of compositeItems) {
			const viewContainer = this.getViewContainer(compositeItem.id);
			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				const views: { when: string | undefined }[] = [];
				for (const { when } of viewContainerModel.allViewDescriptors) {
					views.push({ when: when ? when.serialize() : undefined });
				}
				state.push({
					id: compositeItem.id,
					name: viewContainerModel.title,
					icon: URI.isUri(viewContainerModel.icon) && this.environmentService.remoteAuthority ? undefined : viewContainerModel.icon, /* Donot cache uri icons with remote connection */
					views,
					pinned: compositeItem.pinned,
					order: compositeItem.order,
					visible: compositeItem.visible,
					isBuiltin: !viewContainer.extensionId
				});
			} else {
				state.push({ id: compositeItem.id, pinned: compositeItem.pinned, order: compositeItem.order, visible: false, isBuiltin: false });
			}
		}

		this.storeCachedViewContainersState(state);
	}

	private _cachedViewContainers: ICachedViewContainer[] | undefined = undefined;
	private get cachedViewContainers(): ICachedViewContainer[] {
		if (this._cachedViewContainers === undefined) {
			this._cachedViewContainers = this.getPinnedViewContainers();
			for (const placeholderViewContainer of this.getPlaceholderViewContainers()) {
				const cachedViewContainer = this._cachedViewContainers.filter(cached => cached.id === placeholderViewContainer.id)[0];
				if (cachedViewContainer) {
					cachedViewContainer.name = placeholderViewContainer.name;
					cachedViewContainer.icon = placeholderViewContainer.themeIcon ? placeholderViewContainer.themeIcon :
						placeholderViewContainer.iconUrl ? URI.revive(placeholderViewContainer.iconUrl) : undefined;
					if (URI.isUri(cachedViewContainer.icon) && this.environmentService.remoteAuthority) {
						cachedViewContainer.icon = undefined; /* Donot cache uri icons with remote connection */
					}
					cachedViewContainer.views = placeholderViewContainer.views;
					cachedViewContainer.isBuiltin = placeholderViewContainer.isBuiltin;
				}
			}
		}

		return this._cachedViewContainers;
	}

	private storeCachedViewContainersState(cachedViewContainers: ICachedViewContainer[]): void {
		this.setPinnedViewContainers(cachedViewContainers.map(({ id, pinned, visible, order }) => (<IPinnedViewContainer>{
			id,
			pinned,
			visible,
			order
		})));

		this.setPlaceholderViewContainers(cachedViewContainers.map(({ id, icon, name, views, isBuiltin }) => (<IPlaceholderViewContainer>{
			id,
			iconUrl: URI.isUri(icon) ? icon : undefined,
			themeIcon: ThemeIcon.isThemeIcon(icon) ? icon : undefined,
			name,
			isBuiltin,
			views
		})));
	}

	private getPinnedViewContainers(): IPinnedViewContainer[] {
		return JSON.parse(this.pinnedViewContainersValue);
	}

	private setPinnedViewContainers(pinnedViewContainers: IPinnedViewContainer[]): void {
		this.pinnedViewContainersValue = JSON.stringify(pinnedViewContainers);
	}

	private _pinnedViewContainersValue: string | undefined;
	private get pinnedViewContainersValue(): string {
		if (!this._pinnedViewContainersValue) {
			this._pinnedViewContainersValue = this.getStoredPinnedViewContainersValue();
		}

		return this._pinnedViewContainersValue;
	}

	private set pinnedViewContainersValue(pinnedViewContainersValue: string) {
		if (this.pinnedViewContainersValue !== pinnedViewContainersValue) {
			this._pinnedViewContainersValue = pinnedViewContainersValue;
			this.setStoredPinnedViewContainersValue(pinnedViewContainersValue);
		}
	}

	private getStoredPinnedViewContainersValue(): string {
		return this.storageService.get(ActivitybarPart.PINNED_VIEW_CONTAINERS, StorageScope.PROFILE, '[]');
	}

	private setStoredPinnedViewContainersValue(value: string): void {
		this.storageService.store(ActivitybarPart.PINNED_VIEW_CONTAINERS, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	private getPlaceholderViewContainers(): IPlaceholderViewContainer[] {
		return JSON.parse(this.placeholderViewContainersValue);
	}

	private setPlaceholderViewContainers(placeholderViewContainers: IPlaceholderViewContainer[]): void {
		this.placeholderViewContainersValue = JSON.stringify(placeholderViewContainers);
	}

	private _placeholderViewContainersValue: string | undefined;
	private get placeholderViewContainersValue(): string {
		if (!this._placeholderViewContainersValue) {
			this._placeholderViewContainersValue = this.getStoredPlaceholderViewContainersValue();
		}

		return this._placeholderViewContainersValue;
	}

	private set placeholderViewContainersValue(placeholderViewContainesValue: string) {
		if (this.placeholderViewContainersValue !== placeholderViewContainesValue) {
			this._placeholderViewContainersValue = placeholderViewContainesValue;
			this.setStoredPlaceholderViewContainersValue(placeholderViewContainesValue);
		}
	}

	private getStoredPlaceholderViewContainersValue(): string {
		return this.storageService.get(ActivitybarPart.PLACEHOLDER_VIEW_CONTAINERS, StorageScope.PROFILE, '[]');
	}

	private setStoredPlaceholderViewContainersValue(value: string): void {
		this.storageService.store(ActivitybarPart.PLACEHOLDER_VIEW_CONTAINERS, value, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private get accountsVisibilityPreference(): boolean {
		return this.storageService.getBoolean(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, StorageScope.PROFILE, true);
	}

	private set accountsVisibilityPreference(value: boolean) {
		this.storageService.store(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	private get profilesVisibilityPreference(): boolean {
		return this.userDataProfilesService.isEnabled() && this.storageService.getBoolean(ProfilesActivityActionViewItem.PROFILES_VISIBILITY_PREFERENCE_KEY, StorageScope.PROFILE, this.userDataProfilesService.profiles.length > 1);
	}

	private set profilesVisibilityPreference(value: boolean) {
		this.storageService.store(ProfilesActivityActionViewItem.PROFILES_VISIBILITY_PREFERENCE_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	toJSON(): object {
		return {
			type: Parts.ACTIVITYBAR_PART
		};
	}
}
