/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { IAction, toAction } from '../../../base/common/actions.js';
import { IActivity } from '../../services/activity/common/activity.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ActionBar, ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { CompositeActionViewItem, CompositeOverflowActivityAction, CompositeOverflowActivityActionViewItem, CompositeBarAction, ICompositeBar, ICompositeBarColors, IActivityHoverOptions } from './compositeBarActions.js';
import { Dimension, $, addDisposableListener, EventType, EventHelper, isAncestor, getWindow } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { Widget } from '../../../base/browser/ui/widget.js';
import { isUndefinedOrNull } from '../../../base/common/types.js';
import { IColorTheme } from '../../../platform/theme/common/themeService.js';
import { Emitter } from '../../../base/common/event.js';
import { ViewContainerLocation, IViewDescriptorService } from '../../common/views.js';
import { IPaneComposite } from '../../common/panecomposite.js';
import { IComposite } from '../../common/composite.js';
import { CompositeDragAndDropData, CompositeDragAndDropObserver, IDraggedCompositeData, ICompositeDragAndDrop, Before2D, toggleDropEffect, ICompositeDragAndDropObserverCallbacks } from '../dnd.js';
import { Gesture, EventType as TouchEventType, GestureEvent } from '../../../base/browser/touch.js';

export interface ICompositeBarItem {

	readonly id: string;

	name?: string;
	pinned: boolean;
	order?: number;
	visible: boolean;
}

export class CompositeDragAndDrop implements ICompositeDragAndDrop {

	constructor(
		private viewDescriptorService: IViewDescriptorService,
		private targetContainerLocation: ViewContainerLocation,
		private orientation: ActionsOrientation,
		private openComposite: (id: string, focus?: boolean) => Promise<IPaneComposite | null>,
		private moveComposite: (from: string, to: string, before?: Before2D) => void,
		private getItems: () => ICompositeBarItem[]
	) { }

	drop(data: CompositeDragAndDropData, targetCompositeId: string | undefined, originalEvent: DragEvent, before?: Before2D): void {
		const dragData = data.getData();

		if (dragData.type === 'composite') {
			const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id)!;
			const currentLocation = this.viewDescriptorService.getViewContainerLocation(currentContainer);
			let moved = false;

			// ... on the same composite bar
			if (currentLocation === this.targetContainerLocation) {
				if (targetCompositeId) {
					this.moveComposite(dragData.id, targetCompositeId, before);
					moved = true;
				}
			}
			// ... on a different composite bar
			else {
				this.viewDescriptorService.moveViewContainerToLocation(currentContainer, this.targetContainerLocation, this.getTargetIndex(targetCompositeId, before), 'dnd');
				moved = true;
			}

			if (moved) {
				this.openComposite(currentContainer.id, true);
			}
		}

		if (dragData.type === 'view') {
			const viewToMove = this.viewDescriptorService.getViewDescriptorById(dragData.id)!;
			if (viewToMove.canMoveView) {
				this.viewDescriptorService.moveViewToLocation(viewToMove, this.targetContainerLocation, 'dnd');

				const newContainer = this.viewDescriptorService.getViewContainerByViewId(viewToMove.id)!;

				if (targetCompositeId) {
					this.moveComposite(newContainer.id, targetCompositeId, before);
				}

				this.openComposite(newContainer.id, true).then(composite => {
					composite?.openView(viewToMove.id, true);
				});
			}
		}
	}

	onDragEnter(data: CompositeDragAndDropData, targetCompositeId: string | undefined, originalEvent: DragEvent): boolean {
		return this.canDrop(data, targetCompositeId);
	}

	onDragOver(data: CompositeDragAndDropData, targetCompositeId: string | undefined, originalEvent: DragEvent): boolean {
		return this.canDrop(data, targetCompositeId);
	}

	private getTargetIndex(targetId: string | undefined, before2d: Before2D | undefined): number | undefined {
		if (!targetId) {
			return undefined;
		}

		const items = this.getItems();
		const before = this.orientation === ActionsOrientation.HORIZONTAL ? before2d?.horizontallyBefore : before2d?.verticallyBefore;
		return items.filter(item => item.visible).findIndex(item => item.id === targetId) + (before ? 0 : 1);
	}

	private canDrop(data: CompositeDragAndDropData, targetCompositeId: string | undefined): boolean {
		const dragData = data.getData();

		if (dragData.type === 'composite') {

			// Dragging a composite
			const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id)!;
			const currentLocation = this.viewDescriptorService.getViewContainerLocation(currentContainer);

			// ... to the same composite location
			if (currentLocation === this.targetContainerLocation) {
				return dragData.id !== targetCompositeId;
			}

			return true;
		} else {

			// Dragging an individual view
			const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dragData.id);

			// ... that cannot move
			if (!viewDescriptor || !viewDescriptor.canMoveView) {
				return false;
			}

			// ... to create a view container
			return true;
		}
	}
}

export interface ICompositeBarOptions {

	readonly icon: boolean;
	readonly orientation: ActionsOrientation;
	readonly colors: (theme: IColorTheme) => ICompositeBarColors;
	readonly compact?: boolean;
	readonly compositeSize: number;
	readonly overflowActionSize: number;
	readonly dndHandler: ICompositeDragAndDrop;
	readonly activityHoverOptions: IActivityHoverOptions;
	readonly preventLoopNavigation?: boolean;

	readonly getActivityAction: (compositeId: string) => CompositeBarAction;
	readonly getCompositePinnedAction: (compositeId: string) => IAction;
	readonly getCompositeBadgeAction: (compositeId: string) => IAction;
	readonly getOnCompositeClickAction: (compositeId: string) => IAction;
	readonly fillExtraContextMenuActions: (actions: IAction[], e?: MouseEvent | GestureEvent) => void;
	readonly getContextMenuActionsForComposite: (compositeId: string) => IAction[];

	readonly openComposite: (compositeId: string, preserveFocus?: boolean) => Promise<IComposite | null>;
	readonly getDefaultCompositeId: () => string | undefined;
}

class CompositeBarDndCallbacks implements ICompositeDragAndDropObserverCallbacks {

	private insertDropBefore: Before2D | undefined = undefined;

	constructor(
		private readonly compositeBarContainer: HTMLElement,
		private readonly actionBarContainer: HTMLElement,
		private readonly compositeBarModel: CompositeBarModel,
		private readonly dndHandler: ICompositeDragAndDrop,
		private readonly orientation: ActionsOrientation,
	) { }

	onDragOver(e: IDraggedCompositeData) {

		// don't add feedback if this is over the composite bar actions or there are no actions
		const visibleItems = this.compositeBarModel.visibleItems;
		if (!visibleItems.length || (e.eventData.target && isAncestor(e.eventData.target as HTMLElement, this.actionBarContainer))) {
			this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, true);
			return;
		}

		const insertAtFront = this.insertAtFront(this.actionBarContainer, e.eventData);
		const target = insertAtFront ? visibleItems[0] : visibleItems[visibleItems.length - 1];
		const validDropTarget = this.dndHandler.onDragOver(e.dragAndDropData, target.id, e.eventData);
		toggleDropEffect(e.eventData.dataTransfer, 'move', validDropTarget);
		this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, validDropTarget, insertAtFront, true);
	}

	onDragLeave(e: IDraggedCompositeData) {
		this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
	}

	onDragEnd(e: IDraggedCompositeData) {
		this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
	}

	onDrop(e: IDraggedCompositeData) {
		const visibleItems = this.compositeBarModel.visibleItems;
		let targetId = undefined;
		if (visibleItems.length) {
			targetId = this.insertAtFront(this.actionBarContainer, e.eventData) ? visibleItems[0].id : visibleItems[visibleItems.length - 1].id;
		}
		this.dndHandler.drop(e.dragAndDropData, targetId, e.eventData, this.insertDropBefore);
		this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
	}

	private insertAtFront(element: HTMLElement, event: DragEvent): boolean {
		const rect = element.getBoundingClientRect();
		const posX = event.clientX;
		const posY = event.clientY;

		switch (this.orientation) {
			case ActionsOrientation.HORIZONTAL:
				return posX < rect.left;
			case ActionsOrientation.VERTICAL:
				return posY < rect.top;
		}
	}

	private updateFromDragging(element: HTMLElement, showFeedback: boolean, front: boolean, isDragging: boolean): Before2D | undefined {
		element.classList.toggle('dragged-over', isDragging);
		element.classList.toggle('dragged-over-head', showFeedback && front);
		element.classList.toggle('dragged-over-tail', showFeedback && !front);

		if (!showFeedback) {
			return undefined;
		}

		return { verticallyBefore: front, horizontallyBefore: front };
	}
}

export class CompositeBar extends Widget implements ICompositeBar {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private dimension: Dimension | undefined;

	private compositeSwitcherBar: ActionBar | undefined;
	private compositeOverflowAction: CompositeOverflowActivityAction | undefined;
	private compositeOverflowActionViewItem: CompositeOverflowActivityActionViewItem | undefined;

	private readonly model: CompositeBarModel;
	private readonly visibleComposites: string[];
	private readonly compositeSizeInBar: Map<string, number>;

	constructor(
		items: ICompositeBarItem[],
		private readonly options: ICompositeBarOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		this.model = new CompositeBarModel(items, options);
		this.visibleComposites = [];
		this.compositeSizeInBar = new Map<string, number>();
		this.computeSizes(this.model.visibleItems);
	}

	getCompositeBarItems(): ICompositeBarItem[] {
		return [...this.model.items];
	}

	setCompositeBarItems(items: ICompositeBarItem[]): void {
		this.model.setItems(items);
		this.updateCompositeSwitcher(true);
	}

	getPinnedComposites(): ICompositeBarItem[] {
		return this.model.pinnedItems;
	}

	getPinnedCompositeIds(): string[] {
		return this.getPinnedComposites().map(c => c.id);
	}

	getVisibleComposites(): ICompositeBarItem[] {
		return this.model.visibleItems;
	}

	create(parent: HTMLElement): HTMLElement {
		const actionBarDiv = parent.appendChild($('.composite-bar'));
		this.compositeSwitcherBar = this._register(new ActionBar(actionBarDiv, {
			actionViewItemProvider: (action, options) => {
				if (action instanceof CompositeOverflowActivityAction) {
					return this.compositeOverflowActionViewItem;
				}
				const item = this.model.findItem(action.id);
				return item && this.instantiationService.createInstance(
					CompositeActionViewItem,
					{ ...options, draggable: true, colors: this.options.colors, icon: this.options.icon, hoverOptions: this.options.activityHoverOptions, compact: this.options.compact },
					action as CompositeBarAction,
					item.pinnedAction,
					item.toggleBadgeAction,
					compositeId => this.options.getContextMenuActionsForComposite(compositeId),
					() => this.getContextMenuActions(),
					this.options.dndHandler,
					this
				);
			},
			orientation: this.options.orientation,
			ariaLabel: localize('activityBarAriaLabel', "Active View Switcher"),
			ariaRole: 'tablist',
			preventLoopNavigation: this.options.preventLoopNavigation,
			triggerKeys: { keyDown: true }
		}));

		// Contextmenu for composites
		this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, e => this.showContextMenu(getWindow(parent), e)));
		this._register(Gesture.addTarget(parent));
		this._register(addDisposableListener(parent, TouchEventType.Contextmenu, e => this.showContextMenu(getWindow(parent), e)));

		// Register a drop target on the whole bar to prevent forbidden feedback
		const dndCallback = new CompositeBarDndCallbacks(parent, actionBarDiv, this.model, this.options.dndHandler, this.options.orientation);
		this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(parent, dndCallback));

		return actionBarDiv;
	}

	focus(index?: number): void {
		this.compositeSwitcherBar?.focus(index);
	}

	recomputeSizes(): void {
		this.computeSizes(this.model.visibleItems);
		this.updateCompositeSwitcher();
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		if (dimension.height === 0 || dimension.width === 0) {
			// Do not layout if not visible. Otherwise the size measurment would be computed wrongly
			return;
		}

		if (this.compositeSizeInBar.size === 0) {
			// Compute size of each composite by getting the size from the css renderer
			// Size is later used for overflow computation
			this.computeSizes(this.model.visibleItems);
		}

		this.updateCompositeSwitcher();
	}

	addComposite({ id, name, order, requestedIndex }: { id: string; name: string; order?: number; requestedIndex?: number }): void {
		if (this.model.add(id, name, order, requestedIndex)) {
			this.computeSizes([this.model.findItem(id)]);
			this.updateCompositeSwitcher();
		}
	}

	removeComposite(id: string): void {

		// If it pinned, unpin it first
		if (this.isPinned(id)) {
			this.unpin(id);
		}

		// Remove from the model
		if (this.model.remove(id)) {
			this.updateCompositeSwitcher();
		}
	}

	hideComposite(id: string): void {
		if (this.model.hide(id)) {
			this.resetActiveComposite(id);
			this.updateCompositeSwitcher();
		}
	}

	activateComposite(id: string): void {
		const previousActiveItem = this.model.activeItem;
		if (this.model.activate(id)) {
			// Update if current composite is neither visible nor pinned
			// or previous active composite is not pinned
			if (this.visibleComposites.indexOf(id) === - 1 || (!!this.model.activeItem && !this.model.activeItem.pinned) || (previousActiveItem && !previousActiveItem.pinned)) {
				this.updateCompositeSwitcher();
			}
		}
	}

	deactivateComposite(id: string): void {
		const previousActiveItem = this.model.activeItem;
		if (this.model.deactivate()) {
			if (previousActiveItem && !previousActiveItem.pinned) {
				this.updateCompositeSwitcher();
			}
		}
	}

	async pin(compositeId: string, open?: boolean): Promise<void> {
		if (this.model.setPinned(compositeId, true)) {
			this.updateCompositeSwitcher();

			if (open) {
				await this.options.openComposite(compositeId);
				this.activateComposite(compositeId); // Activate after opening
			}
		}
	}

	unpin(compositeId: string): void {
		if (this.model.setPinned(compositeId, false)) {

			this.updateCompositeSwitcher();

			this.resetActiveComposite(compositeId);
		}
	}

	areBadgesEnabled(compositeId: string): boolean {
		return this.viewDescriptorService.getViewContainerBadgeEnablementState(compositeId);
	}

	toggleBadgeEnablement(compositeId: string): void {
		this.viewDescriptorService.setViewContainerBadgeEnablementState(compositeId, !this.areBadgesEnabled(compositeId));
		this.updateCompositeSwitcher();
		const item = this.model.findItem(compositeId);
		if (item) {
			// TODO @lramos15 how do we tell the activity to re-render the badge? This triggers an onDidChange but isn't the right way to do it.
			// I could add another specific function like `activity.updateBadgeEnablement` would then the activity store the sate?
			item.activityAction.activities = item.activityAction.activities;
		}
	}

	private resetActiveComposite(compositeId: string) {
		const defaultCompositeId = this.options.getDefaultCompositeId();

		// Case: composite is not the active one or the active one is a different one
		// Solv: we do nothing
		if (!this.model.activeItem || this.model.activeItem.id !== compositeId) {
			return;
		}

		// Deactivate itself
		this.deactivateComposite(compositeId);

		// Case: composite is not the default composite and default composite is still showing
		// Solv: we open the default composite
		if (defaultCompositeId && defaultCompositeId !== compositeId && this.isPinned(defaultCompositeId)) {
			this.options.openComposite(defaultCompositeId, true);
		}

		// Case: we closed the default composite
		// Solv: we open the next visible composite from top
		else {
			const visibleComposite = this.visibleComposites.find(cid => cid !== compositeId);
			if (visibleComposite) {
				this.options.openComposite(visibleComposite);
			}
		}
	}

	isPinned(compositeId: string): boolean {
		const item = this.model.findItem(compositeId);
		return item?.pinned;
	}

	move(compositeId: string, toCompositeId: string, before?: boolean): void {
		if (before !== undefined) {
			const fromIndex = this.model.items.findIndex(c => c.id === compositeId);
			let toIndex = this.model.items.findIndex(c => c.id === toCompositeId);

			if (fromIndex >= 0 && toIndex >= 0) {
				if (!before && fromIndex > toIndex) {
					toIndex++;
				}

				if (before && fromIndex < toIndex) {
					toIndex--;
				}

				if (toIndex < this.model.items.length && toIndex >= 0 && toIndex !== fromIndex) {
					if (this.model.move(this.model.items[fromIndex].id, this.model.items[toIndex].id)) {
						// timeout helps to prevent artifacts from showing up
						setTimeout(() => this.updateCompositeSwitcher(), 0);
					}
				}
			}
		} else {
			if (this.model.move(compositeId, toCompositeId)) {
				// timeout helps to prevent artifacts from showing up
				setTimeout(() => this.updateCompositeSwitcher(), 0);
			}
		}
	}

	getAction(compositeId: string): CompositeBarAction {
		const item = this.model.findItem(compositeId);

		return item?.activityAction;
	}

	private computeSizes(items: ICompositeBarModelItem[]): void {
		const size = this.options.compositeSize;
		if (size) {
			items.forEach(composite => this.compositeSizeInBar.set(composite.id, size));
		} else {
			const compositeSwitcherBar = this.compositeSwitcherBar;
			if (compositeSwitcherBar && this.dimension && this.dimension.height !== 0 && this.dimension.width !== 0) {

				// Compute sizes only if visible. Otherwise the size measurment would be computed wrongly.
				const currentItemsLength = compositeSwitcherBar.viewItems.length;
				compositeSwitcherBar.push(items.map(composite => composite.activityAction));
				items.map((composite, index) => this.compositeSizeInBar.set(composite.id, this.options.orientation === ActionsOrientation.VERTICAL
					? compositeSwitcherBar.getHeight(currentItemsLength + index)
					: compositeSwitcherBar.getWidth(currentItemsLength + index)
				));
				items.forEach(() => compositeSwitcherBar.pull(compositeSwitcherBar.viewItems.length - 1));
			}
		}
	}

	private updateCompositeSwitcher(donotTrigger?: boolean): void {
		const compositeSwitcherBar = this.compositeSwitcherBar;
		if (!compositeSwitcherBar || !this.dimension) {
			return; // We have not been rendered yet so there is nothing to update.
		}

		let compositesToShow = this.model.visibleItems.filter(item =>
			item.pinned
			|| (this.model.activeItem && this.model.activeItem.id === item.id) /* Show the active composite even if it is not pinned */
		).map(item => item.id);

		// Ensure we are not showing more composites than we have height for
		let maxVisible = compositesToShow.length;
		const totalComposites = compositesToShow.length;
		let size = 0;
		const limit = this.options.orientation === ActionsOrientation.VERTICAL ? this.dimension.height : this.dimension.width;

		// Add composites while they fit
		for (let i = 0; i < compositesToShow.length; i++) {
			const compositeSize = this.compositeSizeInBar.get(compositesToShow[i])!;
			// Adding this composite will overflow available size, so don't
			if (size + compositeSize > limit) {
				maxVisible = i;
				break;
			}

			size += compositeSize;
		}

		// Remove the tail of composites that did not fit
		if (totalComposites > maxVisible) {
			compositesToShow = compositesToShow.slice(0, maxVisible);
		}

		// We always try show the active composite, so re-add it if it was sliced out
		if (this.model.activeItem && compositesToShow.every(compositeId => !!this.model.activeItem && compositeId !== this.model.activeItem.id)) {
			size += this.compositeSizeInBar.get(this.model.activeItem.id)!;
			compositesToShow.push(this.model.activeItem.id);
		}

		// The active composite might have pushed us over the limit
		// Keep popping the composite before the active one until it fits
		// If even the active one doesn't fit, we will resort to overflow
		while (size > limit && compositesToShow.length) {
			const removedComposite = compositesToShow.length > 1 ? compositesToShow.splice(compositesToShow.length - 2, 1)[0] : compositesToShow.pop();
			size -= this.compositeSizeInBar.get(removedComposite!)!;
		}

		// We are overflowing, add the overflow size
		if (totalComposites > compositesToShow.length) {
			size += this.options.overflowActionSize;
		}

		// Check if we need to make extra room for the overflow action
		while (size > limit && compositesToShow.length) {
			const removedComposite = compositesToShow.length > 1 && compositesToShow[compositesToShow.length - 1] === this.model.activeItem?.id ?
				compositesToShow.splice(compositesToShow.length - 2, 1)[0] : compositesToShow.pop();
			size -= this.compositeSizeInBar.get(removedComposite!)!;
		}

		// Remove the overflow action if there are no overflows
		if (totalComposites === compositesToShow.length && this.compositeOverflowAction) {
			compositeSwitcherBar.pull(compositeSwitcherBar.length() - 1);

			this.compositeOverflowAction.dispose();
			this.compositeOverflowAction = undefined;

			this.compositeOverflowActionViewItem?.dispose();
			this.compositeOverflowActionViewItem = undefined;
		}

		// Pull out composites that overflow or got hidden
		const compositesToRemove: number[] = [];
		this.visibleComposites.forEach((compositeId, index) => {
			if (!compositesToShow.includes(compositeId)) {
				compositesToRemove.push(index);
			}
		});
		compositesToRemove.reverse().forEach(index => {
			compositeSwitcherBar.pull(index);
			this.visibleComposites.splice(index, 1);
		});

		// Update the positions of the composites
		compositesToShow.forEach((compositeId, newIndex) => {
			const currentIndex = this.visibleComposites.indexOf(compositeId);
			if (newIndex !== currentIndex) {
				if (currentIndex !== -1) {
					compositeSwitcherBar.pull(currentIndex);
					this.visibleComposites.splice(currentIndex, 1);
				}

				compositeSwitcherBar.push(this.model.findItem(compositeId).activityAction, { label: true, icon: this.options.icon, index: newIndex });
				this.visibleComposites.splice(newIndex, 0, compositeId);
			}
		});

		// Add overflow action as needed
		if (totalComposites > compositesToShow.length && !this.compositeOverflowAction) {
			this.compositeOverflowAction = this._register(this.instantiationService.createInstance(CompositeOverflowActivityAction, () => {
				this.compositeOverflowActionViewItem?.showMenu();
			}));
			this.compositeOverflowActionViewItem = this._register(this.instantiationService.createInstance(
				CompositeOverflowActivityActionViewItem,
				this.compositeOverflowAction,
				() => this.getOverflowingComposites(),
				() => this.model.activeItem ? this.model.activeItem.id : undefined,
				compositeId => {
					const item = this.model.findItem(compositeId);
					return item?.activity[0]?.badge;
				},
				this.options.getOnCompositeClickAction,
				this.options.colors,
				this.options.activityHoverOptions
			));

			compositeSwitcherBar.push(this.compositeOverflowAction, { label: false, icon: true });
		}

		if (!donotTrigger) {
			this._onDidChange.fire();
		}
	}

	private getOverflowingComposites(): { id: string; name?: string }[] {
		let overflowingIds = this.model.visibleItems.filter(item => item.pinned).map(item => item.id);

		// Show the active composite even if it is not pinned
		if (this.model.activeItem && !this.model.activeItem.pinned) {
			overflowingIds.push(this.model.activeItem.id);
		}

		overflowingIds = overflowingIds.filter(compositeId => !this.visibleComposites.includes(compositeId));
		return this.model.visibleItems.filter(c => overflowingIds.includes(c.id)).map(item => { return { id: item.id, name: this.getAction(item.id)?.label || item.name }; });
	}

	private showContextMenu(targetWindow: Window, e: MouseEvent | GestureEvent): void {
		EventHelper.stop(e, true);

		const event = new StandardMouseEvent(targetWindow, e);
		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			getActions: () => this.getContextMenuActions(e)
		});
	}

	getContextMenuActions(e?: MouseEvent | GestureEvent): IAction[] {
		const actions: IAction[] = this.model.visibleItems
			.map(({ id, name, activityAction }) => {
				const isPinned = this.isPinned(id);
				return toAction({
					id,
					label: this.getAction(id).label || name || id,
					checked: isPinned,
					enabled: activityAction.enabled && (!isPinned || this.getPinnedCompositeIds().length > 1),
					run: () => {
						if (this.isPinned(id)) {
							this.unpin(id);
						} else {
							this.pin(id, true);
						}
					}
				});
			});

		this.options.fillExtraContextMenuActions(actions, e);

		return actions;
	}
}

interface ICompositeBarModelItem extends ICompositeBarItem {
	readonly activityAction: CompositeBarAction;
	readonly pinnedAction: IAction;
	readonly toggleBadgeAction: IAction;
	readonly activity: IActivity[];
}

class CompositeBarModel {

	private _items: ICompositeBarModelItem[] = [];
	get items(): ICompositeBarModelItem[] { return this._items; }

	private readonly options: ICompositeBarOptions;

	activeItem?: ICompositeBarModelItem;

	constructor(
		items: ICompositeBarItem[],
		options: ICompositeBarOptions
	) {
		this.options = options;
		this.setItems(items);
	}

	setItems(items: ICompositeBarItem[]): void {
		this._items = [];
		this._items = items
			.map(i => this.createCompositeBarItem(i.id, i.name, i.order, i.pinned, i.visible));
	}

	get visibleItems(): ICompositeBarModelItem[] {
		return this.items.filter(item => item.visible);
	}

	get pinnedItems(): ICompositeBarModelItem[] {
		return this.items.filter(item => item.visible && item.pinned);
	}

	private createCompositeBarItem(id: string, name: string | undefined, order: number | undefined, pinned: boolean, visible: boolean): ICompositeBarModelItem {
		const options = this.options;
		return {
			id, name, pinned, order, visible,
			activity: [],
			get activityAction() {
				return options.getActivityAction(id);
			},
			get pinnedAction() {
				return options.getCompositePinnedAction(id);
			},
			get toggleBadgeAction() {
				return options.getCompositeBadgeAction(id);
			}
		};
	}

	add(id: string, name: string, order: number | undefined, requestedIndex: number | undefined): boolean {
		const item = this.findItem(id);
		if (item) {
			let changed = false;
			item.name = name;
			if (!isUndefinedOrNull(order)) {
				changed = item.order !== order;
				item.order = order;
			}
			if (!item.visible) {
				item.visible = true;
				changed = true;
			}

			return changed;
		} else {
			const item = this.createCompositeBarItem(id, name, order, true, true);
			if (!isUndefinedOrNull(requestedIndex)) {
				let index = 0;
				let rIndex = requestedIndex;
				while (rIndex > 0 && index < this.items.length) {
					if (this.items[index++].visible) {
						rIndex--;
					}
				}

				this.items.splice(index, 0, item);
			} else if (isUndefinedOrNull(order)) {
				this.items.push(item);
			} else {
				let index = 0;
				while (index < this.items.length && typeof this.items[index].order === 'number' && this.items[index].order! < order) {
					index++;
				}
				this.items.splice(index, 0, item);
			}

			return true;
		}
	}

	remove(id: string): boolean {
		for (let index = 0; index < this.items.length; index++) {
			if (this.items[index].id === id) {
				this.items.splice(index, 1);
				return true;
			}
		}
		return false;
	}

	hide(id: string): boolean {
		for (const item of this.items) {
			if (item.id === id) {
				if (item.visible) {
					item.visible = false;
					return true;
				}
				return false;
			}
		}
		return false;
	}

	move(compositeId: string, toCompositeId: string): boolean {

		const fromIndex = this.findIndex(compositeId);
		const toIndex = this.findIndex(toCompositeId);

		// Make sure both items are known to the model
		if (fromIndex === -1 || toIndex === -1) {
			return false;
		}

		const sourceItem = this.items.splice(fromIndex, 1)[0];
		this.items.splice(toIndex, 0, sourceItem);

		// Make sure a moved composite gets pinned
		sourceItem.pinned = true;

		return true;
	}

	setPinned(id: string, pinned: boolean): boolean {
		for (const item of this.items) {
			if (item.id === id) {
				if (item.pinned !== pinned) {
					item.pinned = pinned;
					return true;
				}
				return false;
			}
		}
		return false;
	}

	activate(id: string): boolean {
		if (!this.activeItem || this.activeItem.id !== id) {
			if (this.activeItem) {
				this.deactivate();
			}
			for (const item of this.items) {
				if (item.id === id) {
					this.activeItem = item;
					this.activeItem.activityAction.activate();
					return true;
				}
			}
		}
		return false;
	}

	deactivate(): boolean {
		if (this.activeItem) {
			this.activeItem.activityAction.deactivate();
			this.activeItem = undefined;
			return true;
		}
		return false;
	}

	findItem(id: string): ICompositeBarModelItem {
		return this.items.filter(item => item.id === id)[0];
	}

	private findIndex(id: string): number {
		for (let index = 0; index < this.items.length; index++) {
			if (this.items[index].id === id) {
				return index;
			}
		}

		return -1;
	}
}
