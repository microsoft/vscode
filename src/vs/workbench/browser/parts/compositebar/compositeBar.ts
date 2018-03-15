/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { illegalArgument } from 'vs/base/common/errors';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { Dimension } from 'vs/base/browser/builder';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ActionBar, IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { Event, Emitter } from 'vs/base/common/event';
import { CompositeActionItem, CompositeOverflowActivityAction, ICompositeActivity, CompositeOverflowActivityActionItem, ActivityAction, ICompositeBar, ICompositeBarColors } from 'vs/workbench/browser/parts/compositebar/compositeBarActions';
import { TPromise } from 'vs/base/common/winjs.base';

export interface ICompositeBarOptions {
	icon: boolean;
	storageId: string;
	orientation: ActionsOrientation;
	composites: { id: string, name: string, order: number }[];
	colors: ICompositeBarColors;
	overflowActionSize: number;
	getActivityAction: (compositeId: string) => ActivityAction;
	getCompositePinnedAction: (compositeId: string) => Action;
	getOnCompositeClickAction: (compositeId: string) => Action;
	openComposite: (compositeId: string) => TPromise<any>;
	getDefaultCompositeId: () => string;
	hidePart: () => TPromise<any>;
}

export class CompositeBar implements ICompositeBar {

	private readonly _onDidContextMenu: Emitter<MouseEvent>;

	private dimension: Dimension;
	private toDispose: IDisposable[];

	private compositeSwitcherBar: ActionBar;
	private compositeOverflowAction: CompositeOverflowActivityAction;
	private compositeOverflowActionItem: CompositeOverflowActivityActionItem;

	private compositeIdToActions: { [compositeId: string]: ActivityAction; };
	private compositeIdToActionItems: { [compositeId: string]: IActionItem; };
	private compositeIdToActivityStack: { [compositeId: string]: ICompositeActivity[]; };
	private compositeSizeInBar: Map<string, number>;

	private pinnedComposites: string[];
	private activeCompositeId: string;
	private activeUnpinnedCompositeId: string;

	constructor(
		private options: ICompositeBarOptions,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
	) {
		this.toDispose = [];
		this.compositeIdToActionItems = Object.create(null);
		this.compositeIdToActions = Object.create(null);
		this.compositeIdToActivityStack = Object.create(null);
		this.compositeSizeInBar = new Map<string, number>();

		this._onDidContextMenu = new Emitter<MouseEvent>();

		const pinnedComposites = JSON.parse(this.storageService.get(this.options.storageId, StorageScope.GLOBAL, null)) as string[];
		if (pinnedComposites) {
			const compositeIds = this.options.composites.map(c => c.id);
			this.pinnedComposites = pinnedComposites.filter(pcid => compositeIds.indexOf(pcid) >= 0);
		} else {
			this.pinnedComposites = this.options.composites.map(c => c.id);
		}
	}

	public get onDidContextMenu(): Event<MouseEvent> {
		return this._onDidContextMenu.event;
	}

	public addComposite(compositeData: { id: string; name: string, order: number }): void {
		if (this.options.composites.filter(c => c.id === compositeData.id).length) {
			return;
		}
		let i = 0;
		while (i < this.options.composites.length && this.options.composites[i].order < compositeData.order) {
			i++;
		}
		this.options.composites.push(compositeData);
		this.pin(compositeData.id, true, i);
	}

	public removeComposite(id: string): void {
		if (this.options.composites.filter(c => c.id === id).length === 0) {
			return;
		}

		this.options.composites = this.options.composites.filter(c => c.id !== id);
		this.unpin(id);
		this.pullComposite(id);
	}

	public activateComposite(id: string): void {
		if (this.compositeIdToActions[id]) {
			if (this.compositeIdToActions[this.activeCompositeId]) {
				this.compositeIdToActions[this.activeCompositeId].deactivate();
			}
			this.compositeIdToActions[id].activate();
		}
		this.activeCompositeId = id;

		const activeUnpinnedCompositeShouldClose = this.activeUnpinnedCompositeId && this.activeUnpinnedCompositeId !== id;
		const activeUnpinnedCompositeShouldShow = !this.pinnedComposites.some(pid => pid === id);
		if (activeUnpinnedCompositeShouldShow || activeUnpinnedCompositeShouldClose) {
			this.updateCompositeSwitcher();
		}
	}

	public deactivateComposite(id: string): void {
		if (this.compositeIdToActions[id]) {
			this.compositeIdToActions[id].deactivate();
		}
	}

	public showActivity(compositeId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (!badge) {
			throw illegalArgument('badge');
		}

		if (typeof priority !== 'number') {
			priority = 0;
		}

		const activity: ICompositeActivity = { badge, clazz, priority };
		const stack = this.compositeIdToActivityStack[compositeId] || (this.compositeIdToActivityStack[compositeId] = []);

		for (let i = 0; i <= stack.length; i++) {
			if (i === stack.length) {
				stack.push(activity);
				break;
			} else if (stack[i].priority <= priority) {
				stack.splice(i, 0, activity);
				break;
			}
		}

		this.updateActivity(compositeId);

		return {
			dispose: () => {
				const stack = this.compositeIdToActivityStack[compositeId];
				if (!stack) {
					return;
				}

				const idx = stack.indexOf(activity);
				if (idx < 0) {
					return;
				}

				stack.splice(idx, 1);
				if (stack.length === 0) {
					delete this.compositeIdToActivityStack[compositeId];
				}

				this.updateActivity(compositeId);
			}
		};
	}

	private updateActivity(compositeId: string) {
		const action = this.compositeIdToActions[compositeId];
		if (!action) {
			return;
		}

		const stack = this.compositeIdToActivityStack[compositeId];

		// reset
		if (!stack || !stack.length) {
			action.setBadge(undefined);
		}

		// update
		else {
			const [{ badge, clazz }] = stack;
			action.setBadge(badge);
			if (clazz) {
				action.class = clazz;
			}
		}
	}

	public create(parent: HTMLElement): HTMLElement {
		const actionBarDiv = parent.appendChild(dom.$('.composite-bar'));
		this.compositeSwitcherBar = new ActionBar(actionBarDiv, {
			actionItemProvider: (action: Action) => action instanceof CompositeOverflowActivityAction ? this.compositeOverflowActionItem : this.compositeIdToActionItems[action.id],
			orientation: this.options.orientation,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher"),
			animated: false,
		});
		this.toDispose.push(this.compositeSwitcherBar);

		// Contextmenu for composites
		this.toDispose.push(dom.addDisposableListener(parent, dom.EventType.CONTEXT_MENU, (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			this._onDidContextMenu.fire(e);
		}));

		// Allow to drop at the end to move composites to the end
		this.toDispose.push(dom.addDisposableListener(parent, dom.EventType.DROP, (e: DragEvent) => {
			const draggedCompositeId = CompositeActionItem.getDraggedCompositeId();
			if (draggedCompositeId) {
				dom.EventHelper.stop(e, true);
				CompositeActionItem.clearDraggedComposite();

				const targetId = this.pinnedComposites[this.pinnedComposites.length - 1];
				if (targetId !== draggedCompositeId) {
					this.move(draggedCompositeId, this.pinnedComposites[this.pinnedComposites.length - 1]);
				}
			}
		}));

		return actionBarDiv;
	}

	public getAction(compositeId): ActivityAction {
		return this.compositeIdToActions[compositeId];
	}

	private updateCompositeSwitcher(): void {
		if (!this.compositeSwitcherBar || !this.dimension) {
			return; // We have not been rendered yet so there is nothing to update.
		}

		let compositesToShow = this.pinnedComposites.slice(0); // never modify original array

		// Always show the active composite even if it is marked to be hidden
		if (this.activeCompositeId && !compositesToShow.some(id => id === this.activeCompositeId)) {
			this.activeUnpinnedCompositeId = this.activeCompositeId;
			compositesToShow = compositesToShow.concat(this.activeUnpinnedCompositeId);
		} else {
			this.activeUnpinnedCompositeId = void 0;
		}

		// Ensure we are not showing more composites than we have height for
		let overflows = false;
		let maxVisible = compositesToShow.length;
		let size = 0;
		const limit = this.options.orientation === ActionsOrientation.VERTICAL ? this.dimension.height : this.dimension.width;
		for (let i = 0; i < compositesToShow.length && size <= limit; i++) {
			size += this.compositeSizeInBar.get(compositesToShow[i]);
			if (size > limit) {
				maxVisible = i;
			}
		}
		overflows = compositesToShow.length > maxVisible;

		if (overflows) {
			size -= this.compositeSizeInBar.get(compositesToShow[maxVisible]);
			compositesToShow = compositesToShow.slice(0, maxVisible);
			size += this.options.overflowActionSize;
		}
		// Check if we need to make extra room for the overflow action
		if (size > limit) {
			size -= this.compositeSizeInBar.get(compositesToShow.pop());
		}
		// We always try show the active composite
		if (this.activeCompositeId && compositesToShow.length && compositesToShow.indexOf(this.activeCompositeId) === -1) {
			const removedComposite = compositesToShow.pop();
			size = size - this.compositeSizeInBar.get(removedComposite) + this.compositeSizeInBar.get(this.activeCompositeId);
			compositesToShow.push(this.activeCompositeId);
		}
		// The active composite might have bigger size than the removed composite, check for overflow again
		if (size > limit) {
			compositesToShow.length ? compositesToShow.splice(compositesToShow.length - 2, 1) : compositesToShow.pop();
		}

		const visibleComposites = Object.keys(this.compositeIdToActions);
		const visibleCompositesChange = !arrays.equals(compositesToShow, visibleComposites);

		// Pull out overflow action if there is a composite change so that we can add it to the end later
		if (this.compositeOverflowAction && visibleCompositesChange) {
			this.compositeSwitcherBar.pull(this.compositeSwitcherBar.length() - 1);

			this.compositeOverflowAction.dispose();
			this.compositeOverflowAction = null;

			this.compositeOverflowActionItem.dispose();
			this.compositeOverflowActionItem = null;
		}

		// Pull out composites that overflow, got hidden or changed position
		visibleComposites.forEach((compositeId, index) => {
			if (compositesToShow.indexOf(compositeId) !== index) {
				this.pullComposite(compositeId);
			}
		});

		// Built actions for composites to show
		const newCompositesToShow = compositesToShow
			.filter(compositeId => !this.compositeIdToActions[compositeId])
			.map(compositeId => this.toAction(compositeId));

		// Update when we have new composites to show
		if (newCompositesToShow.length) {

			// Add to composite switcher
			this.compositeSwitcherBar.push(newCompositesToShow, { label: true, icon: this.options.icon });

			// Make sure to activate the active one
			if (this.activeCompositeId) {
				const activeCompositeEntry = this.compositeIdToActions[this.activeCompositeId];
				if (activeCompositeEntry) {
					activeCompositeEntry.activate();
				}
			}

			// Make sure to restore activity
			Object.keys(this.compositeIdToActions).forEach(compositeId => {
				this.updateActivity(compositeId);
			});
		}

		// Add overflow action as needed
		if ((visibleCompositesChange && overflows) || this.compositeSwitcherBar.length() === 0) {
			this.compositeOverflowAction = this.instantiationService.createInstance(CompositeOverflowActivityAction, () => this.compositeOverflowActionItem.showMenu());
			this.compositeOverflowActionItem = this.instantiationService.createInstance(
				CompositeOverflowActivityActionItem,
				this.compositeOverflowAction,
				() => this.getOverflowingComposites(),
				() => this.activeCompositeId,
				(compositeId: string) => this.compositeIdToActivityStack[compositeId] && this.compositeIdToActivityStack[compositeId][0].badge,
				this.options.getOnCompositeClickAction,
				this.options.colors
			);

			this.compositeSwitcherBar.push(this.compositeOverflowAction, { label: false, icon: true });
		}
	}

	private getOverflowingComposites(): { id: string, name: string }[] {
		let overflowingIds = this.pinnedComposites;
		if (this.activeUnpinnedCompositeId) {
			overflowingIds = overflowingIds.concat(this.activeUnpinnedCompositeId);
		}
		const visibleComposites = Object.keys(this.compositeIdToActions);

		overflowingIds = overflowingIds.filter(compositeId => visibleComposites.indexOf(compositeId) === -1);
		return this.options.composites.filter(c => overflowingIds.indexOf(c.id) !== -1);
	}

	private getVisibleComposites(): string[] {
		return Object.keys(this.compositeIdToActions);
	}

	private pullComposite(compositeId: string): void {
		const index = Object.keys(this.compositeIdToActions).indexOf(compositeId);
		if (index >= 0) {
			this.compositeSwitcherBar.pull(index);

			const action = this.compositeIdToActions[compositeId];
			action.dispose();
			delete this.compositeIdToActions[compositeId];

			const actionItem = this.compositeIdToActionItems[action.id];
			actionItem.dispose();
			delete this.compositeIdToActionItems[action.id];
		}
	}

	private toAction(compositeId: string): ActivityAction {
		if (this.compositeIdToActions[compositeId]) {
			return this.compositeIdToActions[compositeId];
		}

		const compositeActivityAction = this.options.getActivityAction(compositeId);
		const pinnedAction = this.options.getCompositePinnedAction(compositeId);
		this.compositeIdToActionItems[compositeId] = this.instantiationService.createInstance(CompositeActionItem, compositeActivityAction, pinnedAction, this.options.colors, this.options.icon, this);
		this.compositeIdToActions[compositeId] = compositeActivityAction;

		return compositeActivityAction;
	}

	public unpin(compositeId: string): void {
		if (!this.isPinned(compositeId)) {
			return;
		}

		const defaultCompositeId = this.options.getDefaultCompositeId();
		const visibleComposites = this.getVisibleComposites();

		let unpinPromise: TPromise<any>;

		// remove from pinned
		const index = this.pinnedComposites.indexOf(compositeId);
		this.pinnedComposites.splice(index, 1);

		// Case: composite is not the active one or the active one is a different one
		// Solv: we do nothing
		if (!this.activeCompositeId || this.activeCompositeId !== compositeId) {
			unpinPromise = TPromise.as(null);
		}

		// Case: composite is not the default composite and default composite is still showing
		// Solv: we open the default composite
		else if (defaultCompositeId !== compositeId && this.isPinned(defaultCompositeId)) {
			unpinPromise = this.options.openComposite(defaultCompositeId);
		}

		// Case: we closed the last visible composite
		// Solv: we hide the part
		else if (visibleComposites.length === 1) {
			unpinPromise = this.options.hidePart();
		}

		// Case: we closed the default composite
		// Solv: we open the next visible composite from top
		else {
			unpinPromise = this.options.openComposite(visibleComposites.filter(cid => cid !== compositeId)[0]);
		}

		unpinPromise.then(() => {
			this.updateCompositeSwitcher();
		});

		// Persist
		this.savePinnedComposites();
	}

	public isPinned(compositeId: string): boolean {
		return this.pinnedComposites.indexOf(compositeId) >= 0;
	}

	public pin(compositeId: string, update = true, index = this.pinnedComposites.length): void {
		if (this.isPinned(compositeId)) {
			return;
		}

		this.options.openComposite(compositeId).then(() => {
			this.pinnedComposites.splice(index, 0, compositeId);
			this.pinnedComposites = arrays.distinct(this.pinnedComposites);

			if (update) {
				this.updateCompositeSwitcher();
			}

			// Persist
			this.savePinnedComposites();
		});
	}

	public move(compositeId: string, toCompositeId: string): void {
		// Make sure both composites are known to this composite bar
		if (this.options.composites.filter(c => c.id === compositeId || c.id === toCompositeId).length !== 2) {
			return;
		}
		// Make sure a moved composite gets pinned
		if (!this.isPinned(compositeId)) {
			this.pin(compositeId, false /* defer update, we take care of it */);
		}

		const fromIndex = this.pinnedComposites.indexOf(compositeId);
		const toIndex = this.pinnedComposites.indexOf(toCompositeId);

		this.pinnedComposites.splice(fromIndex, 1);
		this.pinnedComposites.splice(toIndex, 0, compositeId);

		// Clear composites that are impacted by the move
		const visibleComposites = Object.keys(this.compositeIdToActions);
		for (let i = Math.min(fromIndex, toIndex); i < visibleComposites.length; i++) {
			this.pullComposite(visibleComposites[i]);
		}

		// timeout helps to prevent artifacts from showing up
		setTimeout(() => {
			this.updateCompositeSwitcher();
		}, 0);

		// Persist
		this.savePinnedComposites();
	}

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (dimension.height === 0 || dimension.width === 0) {
			// Do not layout if not visible. Otherwise the size measurment would be computed wrongly
			return;
		}

		if (this.compositeSizeInBar.size === 0) {
			// Compute size of each composite by getting the size from the css renderer
			// Size is later used for overflow computation
			this.compositeSwitcherBar.clear();
			this.compositeSwitcherBar.push(this.options.composites.map(c => this.options.getActivityAction(c.id)));
			this.options.composites.map((c, index) => this.compositeSizeInBar.set(c.id, this.options.orientation === ActionsOrientation.VERTICAL
				? this.compositeSwitcherBar.getHeight(index)
				: this.compositeSwitcherBar.getWidth(index)
			));
			this.compositeSwitcherBar.clear();
		}
		this.updateCompositeSwitcher();
	}

	private savePinnedComposites(): void {
		this.storageService.store(this.options.storageId, JSON.stringify(this.pinnedComposites), StorageScope.GLOBAL);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}
