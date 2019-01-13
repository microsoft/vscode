/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activitybarpart';
import * as nls from 'vs/nls';
import { illegalArgument } from 'vs/base/common/errors';
import { ActionsOrientation, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { GlobalActivityExtensions, IGlobalActivityRegistry } from 'vs/workbench/common/activity';
import { Registry } from 'vs/platform/registry/common/platform';
import { Part } from 'vs/workbench/browser/part';
import { GlobalActivityActionItem, GlobalActivityAction, ViewletActivityAction, ToggleViewletAction, PlaceHolderToggleCompositePinnedAction, PlaceHolderViewletActivityAction } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IPartService, Parts, Position as SideBarPosition } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { ToggleActivityBarVisibilityAction } from 'vs/workbench/browser/actions/toggleActivityBarVisibility';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { CompositeBar, ICompositeBarItem } from 'vs/workbench/browser/parts/compositeBar';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ToggleCompositePinnedAction, ICompositeBarColors } from 'vs/workbench/browser/parts/compositeBarActions';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IViewsService, IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainer, TEST_VIEW_CONTAINER_ID, IViewDescriptorCollection } from 'vs/workbench/common/views';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { isUndefinedOrNull } from 'vs/base/common/types';

const SCM_VIEWLET_ID = 'workbench.view.scm';

interface ICachedViewlet {
	id: string;
	iconUrl: UriComponents;
	pinned: boolean;
	order: number;
	visible: boolean;
	views?: { when: string }[];
}

export class ActivitybarPart extends Part {

	private static readonly ACTION_HEIGHT = 50;
	private static readonly PINNED_VIEWLETS = 'workbench.activity.pinnedViewlets';

	private dimension: Dimension;

	private globalActionBar: ActionBar;
	private globalActivityIdToActions: { [globalActivityId: string]: GlobalActivityAction; } = Object.create(null);

	private cachedViewlets: ICachedViewlet[] = [];
	private compositeBar: CompositeBar;
	private compositeActions: { [compositeId: string]: { activityAction: ViewletActivityAction, pinnedAction: ToggleCompositePinnedAction } } = Object.create(null);

	constructor(
		id: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPartService private readonly partService: IPartService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewsService private readonly viewsService: IViewsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super(id, { hasTitle: false }, themeService, storageService);

		this.cachedViewlets = this.getCachedViewlets();
		for (const cachedViewlet of this.cachedViewlets) {
			if (this.shouldBeHidden(cachedViewlet.id, cachedViewlet)) {
				cachedViewlet.visible = false;
			}
		}

		this.compositeBar = this._register(this.instantiationService.createInstance(CompositeBar, this.cachedViewlets.map(v => (<ICompositeBarItem>{ id: v.id, name: undefined, visible: v.visible, order: v.order, pinned: v.pinned })), {
			icon: true,
			orientation: ActionsOrientation.VERTICAL,
			openComposite: (compositeId: string) => this.viewletService.openViewlet(compositeId, true),
			getActivityAction: (compositeId: string) => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: (compositeId: string) => this.getCompositeActions(compositeId).pinnedAction,
			getOnCompositeClickAction: (compositeId: string) => this.instantiationService.createInstance(ToggleViewletAction, this.viewletService.getViewlet(compositeId)),
			getContextMenuActions: () => [this.instantiationService.createInstance(ToggleActivityBarVisibilityAction, ToggleActivityBarVisibilityAction.ID, nls.localize('hideActivitBar', "Hide Activity Bar"))],
			getDefaultCompositeId: () => this.viewletService.getDefaultViewletId(),
			hidePart: () => this.partService.setSideBarHidden(true),
			compositeSize: 50,
			colors: theme => this.getActivitybarItemColors(theme),
			overflowActionSize: ActivitybarPart.ACTION_HEIGHT
		}));

		this.registerListeners();
		this.onDidRegisterViewlets(viewletService.getAllViewlets());
	}

	private registerListeners(): void {

		this._register(this.viewletService.onDidViewletRegister(viewlet => this.onDidRegisterViewlets([viewlet])));

		// Activate viewlet action on opening of a viewlet
		this._register(this.viewletService.onDidViewletOpen(viewlet => this.onDidViewletOpen(viewlet)));

		// Deactivate viewlet action on close
		this._register(this.viewletService.onDidViewletClose(viewlet => this.compositeBar.deactivateComposite(viewlet.getId())));
		this._register(this.viewletService.onDidViewletEnablementChange(({ id, enabled }) => {
			if (enabled) {
				this.compositeBar.addComposite(this.viewletService.getViewlet(id));
			} else {
				this.removeComposite(id, true);
			}
		}));

		let disposables: IDisposable[] = [];
		this._register(this.extensionService.onDidRegisterExtensions(() => {
			disposables = dispose(disposables);
			this.onDidRegisterExtensions();
			this.compositeBar.onDidChange(() => this.saveCachedViewlets(), this, disposables);
			this.storageService.onDidChangeStorage(e => this.onDidStorageChange(e), this, disposables);
		}));
		this._register(toDisposable(() => dispose(disposables)));
	}

	private onDidRegisterExtensions(): void {
		this.removeNotExistingComposites();
		for (const viewlet of this.viewletService.getAllViewlets()) {
			this.enableCompositeActions(viewlet);
			const viewContainer = this.getViewContainer(viewlet.id);
			if (viewContainer) {
				const viewDescriptors = this.viewsService.getViewDescriptors(viewContainer);
				this.onDidChangeActiveViews(viewlet, viewDescriptors);
				viewDescriptors.onDidChangeActiveViews(() => this.onDidChangeActiveViews(viewlet, viewDescriptors));
			}
		}
		this.saveCachedViewlets();
	}

	private onDidChangeActiveViews(viewlet: ViewletDescriptor, viewDescriptors: IViewDescriptorCollection): void {
		if (viewDescriptors.activeViewDescriptors.length) {
			this.compositeBar.addComposite(viewlet);
		} else {
			this.removeComposite(viewlet.id, true);
		}
	}

	private onDidViewletOpen(viewlet: IViewlet): void {
		// Update the composite bar by adding
		this.compositeBar.addComposite(this.viewletService.getViewlet(viewlet.getId()));
		this.compositeBar.activateComposite(viewlet.getId());
		const viewletDescriptor = this.viewletService.getViewlet(viewlet.getId());
		const viewContainer = this.getViewContainer(viewletDescriptor.id);
		if (viewContainer && this.viewsService.getViewDescriptors(viewContainer).activeViewDescriptors.length === 0) {
			// Update the composite bar by hiding
			this.removeComposite(viewletDescriptor.id, true);
		}
	}

	showActivity(viewletOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (this.viewletService.getViewlet(viewletOrActionId)) {
			return this.compositeBar.showActivity(viewletOrActionId, badge, clazz, priority);
		}

		return this.showGlobalActivity(viewletOrActionId, badge, clazz);
	}

	private showGlobalActivity(globalActivityId: string, badge: IBadge, clazz?: string): IDisposable {
		if (!badge) {
			throw illegalArgument('badge');
		}

		const action = this.globalActivityIdToActions[globalActivityId];
		if (!action) {
			throw illegalArgument('globalActivityId');
		}

		action.setBadge(badge, clazz);

		return toDisposable(() => action.setBadge(undefined));
	}

	createContentArea(parent: HTMLElement): HTMLElement {
		const content = document.createElement('div');
		addClass(content, 'content');
		parent.appendChild(content);

		// Top Actionbar with action items for each viewlet action
		this.compositeBar.create(content);

		// Top Actionbar with action items for each viewlet action
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
		const isPositionLeft = this.partService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style.boxSizing = borderColor && isPositionLeft ? 'border-box' : null;
		container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : null;
		container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : null;
		container.style.borderRightColor = isPositionLeft ? borderColor : null;
		container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : null;
		container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : null;
		container.style.borderLeftColor = !isPositionLeft ? borderColor : null;
	}

	private getActivitybarItemColors(theme: ITheme): ICompositeBarColors {
		return <ICompositeBarColors>{
			activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
			inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
			badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
			badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
			dragAndDropBackground: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BACKGROUND),
			activeBackgroundColor: null, inactiveBackgroundColor: null, activeBorderBottomColor: null,
		};
	}

	private createGlobalActivityActionBar(container: HTMLElement): void {
		const activityRegistry = Registry.as<IGlobalActivityRegistry>(GlobalActivityExtensions);
		const descriptors = activityRegistry.getActivities();
		const actions = descriptors
			.map(d => this.instantiationService.createInstance(d))
			.map(a => new GlobalActivityAction(a));

		this.globalActionBar = this._register(new ActionBar(container, {
			actionItemProvider: a => this.instantiationService.createInstance(GlobalActivityActionItem, a, theme => this.getActivitybarItemColors(theme)),
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('globalActions', "Global Actions"),
			animated: false
		}));

		actions.forEach(a => {
			this.globalActivityIdToActions[a.id] = a;
			this.globalActionBar.push(a);
		});
	}

	private getCompositeActions(compositeId: string): { activityAction: ViewletActivityAction, pinnedAction: ToggleCompositePinnedAction } {
		let compositeActions = this.compositeActions[compositeId];
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
					activityAction: this.instantiationService.createInstance(PlaceHolderViewletActivityAction, compositeId, cachedComposite ? URI.revive(cachedComposite.iconUrl) : undefined),
					pinnedAction: new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar)
				};
			}

			this.compositeActions[compositeId] = compositeActions;
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
	}

	private shouldBeHidden(viewletId: string, cachedViewlet: ICachedViewlet): boolean {
		return cachedViewlet && cachedViewlet.views && cachedViewlet.views.length
			? cachedViewlet.views.every(({ when }) => when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)))
			: viewletId === TEST_VIEW_CONTAINER_ID /* Hide Test viewlet for the first time or it had no views registered before */;
	}

	private removeNotExistingComposites(): void {
		const viewlets = this.viewletService.getAllViewlets();
		for (const { id } of this.cachedViewlets) {
			if (viewlets.every(viewlet => viewlet.id !== id)) {
				this.removeComposite(id, false);
			}
		}
	}

	private removeComposite(compositeId: string, hide: boolean): void {
		if (hide) {
			this.compositeBar.hideComposite(compositeId);
		} else {
			this.compositeBar.removeComposite(compositeId);
		}
		const compositeActions = this.compositeActions[compositeId];
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			delete this.compositeActions[compositeId];
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

	layout(dimension: Dimension): Dimension[] {
		if (!this.partService.isVisible(Parts.ACTIVITYBAR_PART)) {
			return [dimension];
		}

		// Pass to super
		const sizes = super.layout(dimension);

		this.dimension = sizes[1];

		let availableHeight = this.dimension.height;
		if (this.globalActionBar) {
			// adjust height for global actions showing
			availableHeight -= (this.globalActionBar.items.length * ActivitybarPart.ACTION_HEIGHT);
		}
		this.compositeBar.layout(new Dimension(dimension.width, availableHeight));

		return sizes;
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
		const compositeItems = this.compositeBar.getCompositeBarItems();
		const allViewlets = this.viewletService.getAllViewlets();
		for (const compositeItem of compositeItems) {
			const viewContainer = this.getViewContainer(compositeItem.id);
			const viewlet = allViewlets.filter(({ id }) => id === compositeItem.id)[0];
			if (viewlet) {
				const views: { when: string }[] = [];
				if (viewContainer) {
					for (const { when } of this.viewsService.getViewDescriptors(viewContainer).allViewDescriptors) {
						views.push({ when: when ? when.serialize() : undefined });
					}
				}
				state.push({ id: compositeItem.id, iconUrl: viewlet.iconUrl, views, pinned: compositeItem && compositeItem.pinned, order: compositeItem ? compositeItem.order : undefined, visible: compositeItem && compositeItem.visible });
			}
		}
		this.cachedViewletsValue = JSON.stringify(state);
	}

	private getCachedViewlets(): ICachedViewlet[] {
		const storedStates = <Array<string | ICachedViewlet>>JSON.parse(this.cachedViewletsValue);
		const cachedViewlets = <ICachedViewlet[]>storedStates.map(c => {
			const serialized: ICachedViewlet = typeof c === 'string' /* migration from pinned states to composites states */ ? <ICachedViewlet>{ id: c, pinned: true, order: undefined, visible: true, iconUrl: undefined, views: undefined } : c;
			serialized.visible = isUndefinedOrNull(serialized.visible) ? true : serialized.visible;
			return serialized;
		});
		for (const old of this.loadOldCachedViewlets()) {
			const cachedViewlet = cachedViewlets.filter(cached => cached.id === old.id)[0];
			if (cachedViewlet) {
				cachedViewlet.iconUrl = old.iconUrl;
				cachedViewlet.views = old.views;
			}
		}
		return cachedViewlets;
	}

	private loadOldCachedViewlets(): ICachedViewlet[] {
		const previousState = this.storageService.get('workbench.activity.placeholderViewlets', StorageScope.GLOBAL, '[]');
		const result = (<ICachedViewlet[]>JSON.parse(previousState));
		this.storageService.remove('workbench.activity.placeholderViewlets', StorageScope.GLOBAL);
		return result;
	}

	private _cachedViewletsValue: string;
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
		// TODO: @Joao Remove this after moving SCM Viewlet to ViewContainerViewlet - https://github.com/Microsoft/vscode/issues/49054
		if (viewletId === SCM_VIEWLET_ID) {
			return null;
		}
		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		return viewContainerRegistry.get(viewletId);
	}
}
