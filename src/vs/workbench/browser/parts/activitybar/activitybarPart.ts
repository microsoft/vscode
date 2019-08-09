/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activitybarpart';
import * as nls from 'vs/nls';
import { illegalArgument } from 'vs/base/common/errors';
import { ActionsOrientation, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { Registry } from 'vs/platform/registry/common/platform';
import { Part } from 'vs/workbench/browser/part';
import { GlobalActivityActionViewItem, ViewletActivityAction, ToggleViewletAction, PlaceHolderToggleCompositePinnedAction, PlaceHolderViewletActivityAction } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchLayoutService, Parts, Position as SideBarPosition } from 'vs/workbench/services/layout/browser/layoutService';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ToggleActivityBarVisibilityAction } from 'vs/workbench/browser/actions/layoutActions';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { CompositeBar, ICompositeBarItem } from 'vs/workbench/browser/parts/compositeBar';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ToggleCompositePinnedAction, ICompositeBarColors, ActivityAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IViewsService, IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainer, TEST_VIEW_CONTAINER_ID, IViewDescriptorCollection } from 'vs/workbench/common/views';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IActivityBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Schemas } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

interface ICachedViewlet {
	id: string;
	name?: string;
	iconUrl?: UriComponents;
	pinned: boolean;
	order?: number;
	visible: boolean;
	views?: { when?: string }[];
}

export class ActivitybarPart extends Part implements IActivityBarService {

	_serviceBrand!: ServiceIdentifier<any>;

	private static readonly ACTION_HEIGHT = 48;
	private static readonly PINNED_VIEWLETS = 'workbench.activity.pinnedViewlets';

	//#region IView

	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 48;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	private globalActivityAction: ActivityAction;
	private globalActivityActionBar: ActionBar;

	private cachedViewlets: ICachedViewlet[] = [];

	private compositeBar: CompositeBar;
	private compositeActions: Map<string, { activityAction: ViewletActivityAction, pinnedAction: ToggleCompositePinnedAction }> = new Map();

	private readonly viewletDisposables: Map<string, IDisposable> = new Map<string, IDisposable>();

	constructor(
		@IViewletService private readonly viewletService: IViewletService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewsService private readonly viewsService: IViewsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService workbenchEnvironmentService: IWorkbenchEnvironmentService,
	) {
		super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.cachedViewlets = this.getCachedViewlets();
		for (const cachedViewlet of this.cachedViewlets) {
			if (workbenchEnvironmentService.configuration.remoteAuthority // In remote window, hide activity bar entries until registered.
				|| this.shouldBeHidden(cachedViewlet.id, cachedViewlet)
			) {
				cachedViewlet.visible = false;
			}
		}

		const cachedItems = this.cachedViewlets
			.map(v => ({ id: v.id, name: v.name, visible: v.visible, order: v.order, pinned: v.pinned }));
		this.compositeBar = this._register(this.instantiationService.createInstance(CompositeBar, cachedItems, {
			icon: true,
			orientation: ActionsOrientation.VERTICAL,
			openComposite: (compositeId: string) => this.viewletService.openViewlet(compositeId, true),
			getActivityAction: (compositeId: string) => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: (compositeId: string) => this.getCompositeActions(compositeId).pinnedAction,
			getOnCompositeClickAction: (compositeId: string) => this.instantiationService.createInstance(ToggleViewletAction, this.viewletService.getViewlet(compositeId)),
			getContextMenuActions: () => [this.instantiationService.createInstance(ToggleActivityBarVisibilityAction, ToggleActivityBarVisibilityAction.ID, nls.localize('hideActivitBar', "Hide Activity Bar"))],
			getDefaultCompositeId: () => this.viewletService.getDefaultViewletId(),
			hidePart: () => this.layoutService.setSideBarHidden(true),
			compositeSize: 50,
			colors: (theme: ITheme) => this.getActivitybarItemColors(theme),
			overflowActionSize: ActivitybarPart.ACTION_HEIGHT
		}));

		this.registerListeners();
		this.onDidRegisterViewlets(viewletService.getViewlets());
	}

	private registerListeners(): void {

		// Viewlet registration
		this._register(this.viewletService.onDidViewletRegister(viewlet => this.onDidRegisterViewlets([viewlet])));
		this._register(this.viewletService.onDidViewletDeregister(({ id }) => this.onDidDeregisterViewlet(id)));

		// Activate viewlet action on opening of a viewlet
		this._register(this.viewletService.onDidViewletOpen(viewlet => this.onDidViewletOpen(viewlet)));

		// Deactivate viewlet action on close
		this._register(this.viewletService.onDidViewletClose(viewlet => this.compositeBar.deactivateComposite(viewlet.getId())));

		// Extension registration
		let disposables = this._register(new DisposableStore());
		this._register(this.extensionService.onDidRegisterExtensions(() => {
			disposables.clear();
			this.onDidRegisterExtensions();
			this.compositeBar.onDidChange(() => this.saveCachedViewlets(), this, disposables);
			this.storageService.onDidChangeStorage(e => this.onDidStorageChange(e), this, disposables);
		}));
	}

	private onDidRegisterExtensions(): void {
		this.removeNotExistingComposites();

		this.saveCachedViewlets();
	}

	private onDidViewletOpen(viewlet: IViewlet): void {

		// Update the composite bar by adding
		const foundViewlet = this.viewletService.getViewlet(viewlet.getId());
		if (foundViewlet) {
			this.compositeBar.addComposite(foundViewlet);
		}
		this.compositeBar.activateComposite(viewlet.getId());
		const viewletDescriptor = this.viewletService.getViewlet(viewlet.getId());
		if (viewletDescriptor) {
			const viewContainer = this.getViewContainer(viewletDescriptor.id);
			if (viewContainer && viewContainer.hideIfEmpty) {
				const viewDescriptors = this.viewsService.getViewDescriptors(viewContainer);
				if (viewDescriptors && viewDescriptors.activeViewDescriptors.length === 0) {
					this.hideComposite(viewletDescriptor.id); // Update the composite bar by hiding
				}
			}
		}
	}

	showActivity(viewletOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (this.viewletService.getViewlet(viewletOrActionId)) {
			return this.compositeBar.showActivity(viewletOrActionId, badge, clazz, priority);
		}

		if (viewletOrActionId === GLOBAL_ACTIVITY_ID) {
			return this.showGlobalActivity(badge, clazz);
		}

		throw illegalArgument('globalActivityId');
	}

	private showGlobalActivity(badge: IBadge, clazz?: string): IDisposable {
		this.globalActivityAction.setBadge(badge, clazz);

		return toDisposable(() => this.globalActivityAction.setBadge(undefined));
	}

	createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		const content = document.createElement('div');
		addClass(content, 'content');
		parent.appendChild(content);

		// Viewlets action bar
		this.compositeBar.create(content);

		// Global action bar
		const globalActivities = document.createElement('div');
		addClass(globalActivities, 'global-activity');
		content.appendChild(globalActivities);

		this.createGlobalActivityActionBar(globalActivities);

		return content;
	}

	updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();
		const background = this.getColor(ACTIVITY_BAR_BACKGROUND);
		container.style.backgroundColor = background;

		const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder);
		const isPositionLeft = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style.boxSizing = borderColor && isPositionLeft ? 'border-box' : '';
		container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : null;
		container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : null;
		container.style.borderRightColor = isPositionLeft ? borderColor : null;
		container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : null;
		container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : null;
		container.style.borderLeftColor = !isPositionLeft ? borderColor : null;
	}

	private getActivitybarItemColors(theme: ITheme): ICompositeBarColors {
		return {
			activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
			inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
			badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
			badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
			dragAndDropBackground: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BACKGROUND),
			activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
		};
	}

	private createGlobalActivityActionBar(container: HTMLElement): void {
		this.globalActivityActionBar = this._register(new ActionBar(container, {
			actionViewItemProvider: a => this.instantiationService.createInstance(GlobalActivityActionViewItem, a, (theme: ITheme) => this.getActivitybarItemColors(theme)),
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('manage', "Manage"),
			animated: false
		}));

		this.globalActivityAction = new ActivityAction({
			id: 'workbench.actions.manage',
			name: nls.localize('manage', "Manage"),
			cssClass: 'update-activity'
		});
		this.globalActivityActionBar.push(this.globalActivityAction);
	}

	private getCompositeActions(compositeId: string): { activityAction: ViewletActivityAction, pinnedAction: ToggleCompositePinnedAction } {
		let compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			const viewlet = this.viewletService.getViewlet(compositeId);
			if (viewlet) {
				compositeActions = {
					activityAction: this.instantiationService.createInstance(ViewletActivityAction, viewlet),
					pinnedAction: new ToggleCompositePinnedAction(viewlet, this.compositeBar)
				};
			} else {
				const cachedComposite = this.cachedViewlets.filter(c => c.id === compositeId)[0];
				compositeActions = {
					activityAction: this.instantiationService.createInstance(PlaceHolderViewletActivityAction, compositeId, cachedComposite && cachedComposite.name ? cachedComposite.name : compositeId, cachedComposite && cachedComposite.iconUrl ? URI.revive(cachedComposite.iconUrl) : undefined),
					pinnedAction: new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar)
				};
			}

			this.compositeActions.set(compositeId, compositeActions);
		}

		return compositeActions;
	}

	private onDidRegisterViewlets(viewlets: ViewletDescriptor[]): void {
		for (const viewlet of viewlets) {
			const cachedViewlet = this.cachedViewlets.filter(({ id }) => id === viewlet.id)[0];
			const activeViewlet = this.viewletService.getActiveViewlet();
			const isActive = activeViewlet && activeViewlet.getId() === viewlet.id;

			if (isActive || !this.shouldBeHidden(viewlet.id, cachedViewlet)) {
				this.compositeBar.addComposite(viewlet);

				// Pin it by default if it is new
				if (!cachedViewlet) {
					this.compositeBar.pin(viewlet.id);
				}

				if (isActive) {
					this.compositeBar.activateComposite(viewlet.id);
				}
			}
		}
		for (const viewlet of viewlets) {
			this.enableCompositeActions(viewlet);
			const viewContainer = this.getViewContainer(viewlet.id);
			if (viewContainer && viewContainer.hideIfEmpty) {
				const viewDescriptors = this.viewsService.getViewDescriptors(viewContainer);
				if (viewDescriptors) {
					this.onDidChangeActiveViews(viewlet, viewDescriptors);
					this.viewletDisposables.set(viewlet.id, viewDescriptors.onDidChangeActiveViews(() => this.onDidChangeActiveViews(viewlet, viewDescriptors)));
				}
			}
		}
	}

	private onDidDeregisterViewlet(viewletId: string): void {
		const disposable = this.viewletDisposables.get(viewletId);
		if (disposable) {
			disposable.dispose();
		}
		this.viewletDisposables.delete(viewletId);
		this.hideComposite(viewletId);
	}

	private onDidChangeActiveViews(viewlet: ViewletDescriptor, viewDescriptors: IViewDescriptorCollection): void {
		if (viewDescriptors.activeViewDescriptors.length) {
			this.compositeBar.addComposite(viewlet);
		} else {
			this.hideComposite(viewlet.id);
		}
	}

	private shouldBeHidden(viewletId: string, cachedViewlet?: ICachedViewlet): boolean {
		const viewContainer = this.getViewContainer(viewletId);
		if (!viewContainer || !viewContainer.hideIfEmpty) {
			return false;
		}
		return cachedViewlet && cachedViewlet.views && cachedViewlet.views.length
			? cachedViewlet.views.every(({ when }) => !!when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)))
			: viewletId === TEST_VIEW_CONTAINER_ID /* Hide Test viewlet for the first time or it had no views registered before */;
	}

	private removeNotExistingComposites(): void {
		const viewlets = this.viewletService.getViewlets();
		for (const { id } of this.cachedViewlets) {
			if (viewlets.every(viewlet => viewlet.id !== id)) {
				this.hideComposite(id);
			}
		}
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

	private enableCompositeActions(viewlet: ViewletDescriptor): void {
		const { activityAction, pinnedAction } = this.getCompositeActions(viewlet.id);
		if (activityAction instanceof PlaceHolderViewletActivityAction) {
			activityAction.setActivity(viewlet);
		}

		if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
			pinnedAction.setActivity(viewlet);
		}
	}

	getPinnedViewletIds(): string[] {
		const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(v => v.id);

		return this.viewletService.getViewlets()
			.filter(v => this.compositeBar.isPinned(v.id))
			.sort((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id))
			.map(v => v.id);
	}

	layout(width: number, height: number): void {
		if (!this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			return;
		}

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout composite bar
		let availableHeight = contentAreaSize.height;
		if (this.globalActivityActionBar) {
			availableHeight -= (this.globalActivityActionBar.viewItems.length * ActivitybarPart.ACTION_HEIGHT); // adjust height for global actions showing
		}
		this.compositeBar.layout(new Dimension(width, availableHeight));
	}

	private onDidStorageChange(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === ActivitybarPart.PINNED_VIEWLETS && e.scope === StorageScope.GLOBAL
			&& this.cachedViewletsValue !== this.getStoredCachedViewletsValue() /* This checks if current window changed the value or not */) {
			this._cachedViewletsValue = null;
			const newCompositeItems: ICompositeBarItem[] = [];
			const compositeItems = this.compositeBar.getCompositeBarItems();
			const cachedViewlets = this.getCachedViewlets();

			for (const cachedViewlet of cachedViewlets) {
				// Add and update existing items
				const existingItem = compositeItems.filter(({ id }) => id === cachedViewlet.id)[0];
				if (existingItem) {
					newCompositeItems.push({
						id: existingItem.id,
						name: existingItem.name,
						order: existingItem.order,
						pinned: cachedViewlet.pinned,
						visible: existingItem.visible
					});
				}
			}

			for (let index = 0; index < compositeItems.length; index++) {
				// Add items currently exists but does not exist in new.
				if (!newCompositeItems.some(({ id }) => id === compositeItems[index].id)) {
					newCompositeItems.splice(index, 0, compositeItems[index]);
				}
			}

			this.compositeBar.setCompositeBarItems(newCompositeItems);
		}
	}

	private saveCachedViewlets(): void {
		const state: ICachedViewlet[] = [];
		const allViewlets = this.viewletService.getViewlets();

		const compositeItems = this.compositeBar.getCompositeBarItems();
		for (const compositeItem of compositeItems) {
			const viewContainer = this.getViewContainer(compositeItem.id);
			const viewlet = allViewlets.filter(({ id }) => id === compositeItem.id)[0];
			if (viewlet) {
				const views: { when: string | undefined }[] = [];
				if (viewContainer) {
					const viewDescriptors = this.viewsService.getViewDescriptors(viewContainer);
					if (viewDescriptors) {
						for (const { when } of viewDescriptors.allViewDescriptors) {
							views.push({ when: when ? when.serialize() : undefined });
						}
					}
				}
				state.push({ id: compositeItem.id, name: viewlet.name, iconUrl: viewlet.iconUrl && viewlet.iconUrl.scheme === Schemas.file ? viewlet.iconUrl : undefined, views, pinned: compositeItem.pinned, order: compositeItem.order, visible: compositeItem.visible });
			} else {
				state.push({ id: compositeItem.id, pinned: compositeItem.pinned, order: compositeItem.order, visible: false });
			}
		}

		this.cachedViewletsValue = JSON.stringify(state);
	}

	private getCachedViewlets(): ICachedViewlet[] {
		const storedStates: Array<string | ICachedViewlet> = JSON.parse(this.cachedViewletsValue);
		const cachedViewlets = storedStates.map(c => {
			const serialized: ICachedViewlet = typeof c === 'string' /* migration from pinned states to composites states */ ? { id: c, pinned: true, order: undefined, visible: true, name: undefined, iconUrl: undefined, views: undefined } : c;
			serialized.visible = isUndefinedOrNull(serialized.visible) ? true : serialized.visible;
			return serialized;
		});

		for (const old of this.loadOldCachedViewlets()) {
			const cachedViewlet = cachedViewlets.filter(cached => cached.id === old.id)[0];
			if (cachedViewlet) {
				cachedViewlet.name = old.name;
				cachedViewlet.iconUrl = old.iconUrl;
				cachedViewlet.views = old.views;
			}
		}

		return cachedViewlets;
	}

	private loadOldCachedViewlets(): ICachedViewlet[] {
		const previousState = this.storageService.get('workbench.activity.placeholderViewlets', StorageScope.GLOBAL, '[]');
		const result: ICachedViewlet[] = JSON.parse(previousState);
		this.storageService.remove('workbench.activity.placeholderViewlets', StorageScope.GLOBAL);

		return result;
	}

	private _cachedViewletsValue: string | null;
	private get cachedViewletsValue(): string {
		if (!this._cachedViewletsValue) {
			this._cachedViewletsValue = this.getStoredCachedViewletsValue();
		}

		return this._cachedViewletsValue;
	}

	private set cachedViewletsValue(cachedViewletsValue: string) {
		if (this.cachedViewletsValue !== cachedViewletsValue) {
			this._cachedViewletsValue = cachedViewletsValue;
			this.setStoredCachedViewletsValue(cachedViewletsValue);
		}
	}

	private getStoredCachedViewletsValue(): string {
		return this.storageService.get(ActivitybarPart.PINNED_VIEWLETS, StorageScope.GLOBAL, '[]');
	}

	private setStoredCachedViewletsValue(value: string): void {
		this.storageService.store(ActivitybarPart.PINNED_VIEWLETS, value, StorageScope.GLOBAL);
	}

	private getViewContainer(viewletId: string): ViewContainer | undefined {
		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		return viewContainerRegistry.get(viewletId);
	}

	toJSON(): object {
		return {
			type: Parts.ACTIVITYBAR_PART
		};
	}
}

registerSingleton(IActivityBarService, ActivitybarPart);
