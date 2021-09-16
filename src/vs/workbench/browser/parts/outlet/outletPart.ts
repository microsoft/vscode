/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/outletPart';

import { Event } from 'vs/base/common/event';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { toAction, IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
// import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { Before2D } from 'vs/workbench/browser/dnd';
import { Part } from 'vs/workbench/browser/part';
import { PlaceHolderToggleCompositePinnedAction, PlaceHolderViewContainerActivityAction, ViewContainerActivityAction } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { CompositeBar, CompositeDragAndDrop, ICompositeBarItem } from 'vs/workbench/browser/parts/compositeBar';
import { ICompositeBarColors, ToggleCompositePinnedAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER } from 'vs/workbench/common/theme';
import { getEnabledViewContainerContextKey, IViewContainerModel, IViewDescriptorService, IViewsService, ViewContainer, ViewContainerLocation } from 'vs/workbench/common/views';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
// import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IActivityBarService, IOutletBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';
import { IActivity } from 'vs/workbench/common/activity';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Dimension } from 'vs/base/browser/dom';
import { assertIsDefined } from 'vs/base/common/types';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';

import './outletActions';

interface IPlaceholderViewContainer {
	themeIcon: any;
	iconUrl: any;
	readonly id: string;
	readonly name?: string;
	readonly isBuiltin?: boolean;
	readonly views?: { when?: string; }[];
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
	readonly pinned: boolean;
	readonly order?: number;
	visible: boolean;
	isBuiltin?: boolean;
	views?: { when?: string; }[];

}

export class OutletPart extends Part implements IActivityBarService {
	declare readonly _serviceBrand: undefined;

	private static readonly PINNED_VIEW_CONTAINERS = 'workbench.activity.pinnedViewlets3';
	private static readonly PLACEHOLDER_VIEW_CONTAINER = 'workbench.activity.placeholderViewlets2';

	private readonly viewContainerDisposables = new Map<string, IDisposable>();

	//#region IView
	readonly minimumWidth: number = 20;
	readonly maximumWidth: number = 20;

	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	private content: HTMLElement | undefined;
	// private compositeBarContainer: HTMLElement | undefined;
	private compositeBar: CompositeBar;
	private readonly location = ViewContainerLocation.ThirdPanel;

	private static toActivity(id: string, name: string, keybindingId: string | undefined): IActivity {
		return { id, name, keybindingId };
	}

	private readonly compositeActions = new Map<string, { activityAction: ViewContainerActivityAction, pinnedAction: ToggleCompositePinnedAction; }>();

	// private hasExtensionsRegistered: boolean = false;

	private readonly enabledViewContainersContextKeys: Map<string, IContextKey<boolean>> = new Map<string, IContextKey<boolean>>();

	constructor(

		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IViewsService private readonly viewsService: IViewsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		// @IConfigurationService private readonly configurationService: IConfigurationService,
		// @IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super(Parts.OUTLET_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.compositeBar = this.createCompositeBar();

		this.registerListeners();
	}

	showActivity(viewletOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (this.getViewContainer(viewletOrActionId)) {
			return this.compositeBar.showActivity(viewletOrActionId, badge, clazz, priority);
		}

		return Disposable.None;
	}

	getPinnedViewContainerIds(): string[] {
		const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(v => v.id);
		return this.getViewContainers()
			.filter(v => this.compositeBar.isPinned(v.id))
			.sort((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id))
			.map(v => v.id);
	}

	private registerListeners(): void {

		// View Container Changes
		this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => {
			this.onDidChangeViewContainers(added, removed);
		}));
		this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => {
			this.onDidChangeViewContainerLocation(viewContainer, from, to);
		}));

		// View Container Visibility Changes
		this._register(
			Event.filter(this.viewsService.onDidChangeViewContainerVisibility, e => e.location === this.location)(
				({ id, visible }) => this.onDidChangeViewContainerVisibility(id, visible)
			)
		);

		// Extension registration
		let disposables = this._register(new DisposableStore());
		this._register(this.extensionService.onDidRegisterExtensions(() => {
			disposables.clear();
			this.onDidRegisterExtensions();
			this.compositeBar.onDidChange(() => this.saveCachedViewContainers(), this, disposables);
			this.storageService.onDidChangeValue(e => this.onDidStorageValueChange(e), this, disposables);
		}));
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

	private onDidViewContainerVisible(id: string): void {
		const viewContainer = this.getViewContainer(id);
		if (viewContainer) {

			// Update the composite bar by adding
			this.addComposite(viewContainer);
			this.compositeBar.activateComposite(viewContainer.id);

			// if (this.shouldBeHidden(viewContainer)) {
			// 	const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			// 	if (viewContainerModel.activeViewDescriptors.length === 0) {
			// 		// Update the composite bar by hiding
			// 		this.hideComposite(viewContainer.id);
			// 	}
			// }
		}
	}

	private onDidStorageValueChange(e: IStorageValueChangeEvent): void {
		if (e.key === OutletPart.PINNED_VIEW_CONTAINERS && e.scope === StorageScope.GLOBAL
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
					newCompositeItems.splice(index, 0, compositeItems[index]);
				}
			}

			this.compositeBar.setCompositeBarItems(newCompositeItems);
		}
	}

	private onDidChangeViewContainers(added: readonly { container: ViewContainer, location: ViewContainerLocation; }[], removed: readonly { container: ViewContainer, location: ViewContainerLocation; }[]) {
		removed.filter(({ location }) => location === ViewContainerLocation.ThirdPanel).forEach(({ container }) => this.onDidDeregisterViewContainer(container));
		this.onDidRegisterViewContainers(added.filter(({ location }) => location === ViewContainerLocation.ThirdPanel).map(({ container }) => container));
	}

	private onDidChangeViewContainerLocation(container: ViewContainer, from: ViewContainerLocation, to: ViewContainerLocation) {
		if (from === this.location) {
			this.onDidDeregisterViewContainer(container);
		}

		if (to === this.location) {
			this.onDidRegisterViewContainers([container]);
		}
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
			const visibleViewContainer = this.viewsService.getVisibleViewContainer(this.location);
			if (visibleViewContainer?.id === viewContainer.id) {
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

	private updateActivity(viewContainer: ViewContainer, viewContainerModel: IViewContainerModel): void {
		const activity: IActivity = this.toActivity(viewContainerModel);
		const { activityAction, pinnedAction } = this.getCompositeActions(viewContainer.id);
		activityAction.updateActivity(activity);

		if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
			pinnedAction.setActivity(activity);
		}

		this.saveCachedViewContainers();
	}

	private showOrHideViewContainer(viewContainer: ViewContainer): void {
		let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
		if (!contextKey) {
			contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
			this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
		}
		contextKey.set(true);
		this.addComposite(viewContainer);
	}

	private onDidDeregisterViewContainer(viewContainer: ViewContainer): void {
		// composite bar menu not updated
		const disposable = this.viewContainerDisposables.get(viewContainer.id);
		if (disposable) {
			disposable.dispose();
		}

		this.removeComposite(viewContainer.id);
		this.viewContainerDisposables.delete(viewContainer.id);
	}

	private addComposite(viewContainer: ViewContainer): void {
		this.compositeBar.addComposite({ id: viewContainer.id, name: viewContainer.title, order: viewContainer.order, requestedIndex: viewContainer.requestedIndex });
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

	private onDidRegisterExtensions(): void {
		// this.hasExtensionsRegistered = true;

		// show/hide/remove composites
		for (const { id } of this.cachedViewContainers) {
			const viewContainer = this.getViewContainer(id);
			if (viewContainer) {
				this.showOrHideViewContainer(viewContainer);
			} else {
				if (this.viewDescriptorService.isViewContainerRemovedPermanently(id)) {
					this.removeComposite(id);
				}
			}
		}

		this.saveCachedViewContainers();
	}

	private getViewContainers(): readonly ViewContainer[] {
		return this.viewDescriptorService.getViewContainersByLocation(this.location);
	}


	getVisibleViewContainerIds(): string[] {
		throw new Error('Method not implemented.');
	}

	focusActivityBar(): void {
		throw new Error('Method not implemented.');
	}

	private createCompositeBar() {
		// cached viewlets
		const cachedItems = this.cachedViewContainers
			.map(container => ({
				id: container.id,
				name: container.name,
				visible: container.visible,
				order: container.order,
				pinned: container.pinned
			}));
		// .filter(container => container.id !== THIRD_PANEL_VIEWLET_ID);

		return this._register(this.instantiationService.createInstance(CompositeBar, cachedItems, {
			icon: false,
			orientation: ActionsOrientation.VERTICAL,
			activityHoverOptions: {
				position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT
			},
			openViewContainerEvenIfEmpty: true,
			showIndicator: true,
			preventLoopNavigation: true,
			openComposite: compositeId => this.viewsService.openViewContainer(compositeId, true),
			getActivityAction: compositeId => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: compositeId => this.getCompositeActions(compositeId).pinnedAction,
			getOnCompositeClickAction: compositeId => toAction({ id: compositeId, label: '', run: async () => this.viewsService.isViewContainerVisible(compositeId) ? this.viewsService.closeViewContainer(compositeId) : this.viewsService.openViewContainer(compositeId) }),
			fillExtraContextMenuActions: () => { /** do nothing */ },
			getContextMenuActionsForComposite: compositeId => this.getContextMenuActionsForComposite(compositeId),
			getDefaultCompositeId: () => this.viewDescriptorService.getDefaultViewContainer(this.location)?.id || '',
			hidePart: () => this.layoutService.setThirdLayoutHidden(true),
			dndHandler: new CompositeDragAndDrop(this.viewDescriptorService, ViewContainerLocation.ThirdPanel,
				(id: string, focus?: boolean) => this.viewsService.openViewContainer(id, focus),
				(from: string, to: string, before?: Before2D) => this.compositeBar.move(from, to, before?.verticallyBefore),
				() => this.compositeBar.getCompositeBarItems(),
			),
			compositeSize: 20,
			colors: (theme: IColorTheme) => this.getActivitybarItemColors(theme),
			overflowActionSize: 50
		}));
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

	private getCompositeActions(compositeId: string): { activityAction: ViewContainerActivityAction, pinnedAction: ToggleCompositePinnedAction; } {
		let compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			const viewContainer = this.getViewContainer(compositeId);
			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				compositeActions = {
					activityAction: this.instantiationService.createInstance(ViewContainerActivityAction, this.toActivity(viewContainerModel), ViewContainerLocation.ThirdPanel),
					pinnedAction: new ToggleCompositePinnedAction(this.toActivity(viewContainerModel), this.compositeBar)
				};
			} else {
				// const cachedComposite = this.cachedViewContainers.filter(c => c.id === compositeId)[0];
				compositeActions = {
					activityAction: this.instantiationService.createInstance(PlaceHolderViewContainerActivityAction, OutletPart.toActivity(compositeId, compositeId, undefined), ViewContainerLocation.ThirdPanel),
					pinnedAction: new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar)
				};
			}

			this.compositeActions.set(compositeId, compositeActions);
		}

		return compositeActions;
	}

	private getViewContainer(id: string) {
		const viewContainer = this.viewDescriptorService.getViewContainerById(id);
		return viewContainer && this.viewDescriptorService.getViewContainerLocation(viewContainer) === this.location ? viewContainer : undefined;
	}

	private toActivity(viewContainerModel: IViewContainerModel): IActivity {
		return OutletPart.toActivity(viewContainerModel.viewContainer.id, viewContainerModel.title, viewContainerModel.keybindingId);
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

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		this.content = document.createElement('div');
		this.content.classList.add('content');
		parent.appendChild(this.content);

		// Create composite bar
		this.compositeBar.create(this.content);

		return this.content;
	}

	override layout(width: number, height: number): void {
		if (!this.layoutService.isVisible(Parts.OUTLET_PART)) {
			return;
		}

		const contentAreaSize = super.layoutContents(width, height).contentSize;
		this.compositeBar.layout(new Dimension(width, contentAreaSize.height));
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

	private saveCachedViewContainers(): void {
		const state: ICachedViewContainer[] = [];

		const compositeItems = this.compositeBar.getCompositeBarItems();
		for (const compositeItem of compositeItems) {
			const viewContainer = this.getViewContainer(compositeItem.id);
			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				const views: { when: string | undefined; }[] = [];
				for (const { when } of viewContainerModel.allViewDescriptors) {
					views.push({ when: when ? when.serialize() : undefined });
				}
				state.push({
					id: compositeItem.id,
					name: viewContainerModel.title,
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

		this.setPlaceholderViewContainers(cachedViewContainers.map(({ id, name, views, isBuiltin }) => (<IPlaceholderViewContainer>{
			id,
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
		return this.storageService.get(OutletPart.PINNED_VIEW_CONTAINERS, StorageScope.GLOBAL, '[]');
	}

	private setStoredPinnedViewContainersValue(value: string): void {
		this.storageService.store(OutletPart.PINNED_VIEW_CONTAINERS, value, StorageScope.GLOBAL, StorageTarget.USER);
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

	private set placeholderViewContainersValue(placeholderViewContainersValue: string) {
		if (this.placeholderViewContainersValue !== placeholderViewContainersValue) {
			this._placeholderViewContainersValue = placeholderViewContainersValue;
			this.setStoredPlaceholderViewContainersValue(placeholderViewContainersValue);
		}
	}

	private getStoredPlaceholderViewContainersValue(): string {
		return this.storageService.get(OutletPart.PLACEHOLDER_VIEW_CONTAINER, StorageScope.GLOBAL, '[]');
	}

	private setStoredPlaceholderViewContainersValue(value: string): void {
		this.storageService.store(OutletPart.PLACEHOLDER_VIEW_CONTAINER, value, StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	toJSON(): object {
		return {
			type: Parts.OUTLET_PART
		};
	}
}

registerSingleton(IOutletBarService, OutletPart);
