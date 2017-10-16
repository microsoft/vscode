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
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ActionBar, IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import Event, { Emitter } from 'vs/base/common/event';
import { CompositeActionItem, CompositeOverflowActivityAction, ICompositeActivity, CompositeOverflowActivityActionItem, ActivityAction } from 'vs/workbench/browser/parts/compositebar/compositeBarActions';

export interface ICompositeBarOptions {
	label: 'icon' | 'name';
	storageId: string;
	orientation: ActionsOrientation;
	composites: { id: string, name: string }[];
	getActivityAction: (compositeId: string) => ActivityAction;
	getCompositePinnedAction: (compositeId: string) => Action;
	getOpenCompositeAction: (compositeId: string) => Action;
	getCompositeSize: (compositeId: string) => number;
}

export class CompositeBar {

	private _onDidContextMenu: Emitter<MouseEvent>;
	private _onDidDropComposite: Emitter<{ compositeId: string, toCompositeId: string }>;

	private dimension: Dimension;
	private toDispose: IDisposable[];

	private compositeSwitcherBar: ActionBar;
	private compositeOverflowAction: CompositeOverflowActivityAction;
	private compositeOverflowActionItem: CompositeOverflowActivityActionItem;

	private compositeIdToActions: { [compositeId: string]: ActivityAction; };
	private compositeIdToActionItems: { [compositeId: string]: IActionItem; };
	private compositeIdToActivityStack: { [compositeId: string]: ICompositeActivity[]; };

	private pinnedComposites: string[];
	private activeCompositeId: string;
	private activeUnpinnedCompositeId: string;

	constructor(
		private options: ICompositeBarOptions,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IPartService private partService: IPartService,
		@IThemeService themeService: IThemeService,
	) {
		this.toDispose = [];
		this.compositeIdToActionItems = Object.create(null);
		this.compositeIdToActions = Object.create(null);
		this.compositeIdToActivityStack = Object.create(null);

		this._onDidContextMenu = new Emitter<MouseEvent>();
		this._onDidDropComposite = new Emitter<{ compositeId: string, toCompositeId: string }>();

		const pinnedComposites = JSON.parse(this.storageService.get(this.options.storageId, StorageScope.GLOBAL, null)) as string[];
		if (pinnedComposites) {
			this.pinnedComposites = pinnedComposites;
		} else {
			this.pinnedComposites = this.options.composites.map(c => c.id);
		}
	}

	public get onDidContextMenu(): Event<MouseEvent> {
		return this._onDidContextMenu.event;
	}

	public get onDidDropComposite(): Event<{ compositeId: string, toCompositeId: string }> {
		return this._onDidDropComposite.event;
	}

	public activateComposite(id: string): void {
		if (this.compositeIdToActions[id]) {
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

	public showActivity(compositeId: string, badge: IBadge, clazz?: string): IDisposable {
		if (!badge) {
			throw illegalArgument('badge');
		}

		const activity = <ICompositeActivity>{ badge, clazz };
		const stack = this.compositeIdToActivityStack[compositeId] || (this.compositeIdToActivityStack[compositeId] = []);
		stack.unshift(activity);

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

	public create(container: HTMLElement): void {
		this.compositeSwitcherBar = new ActionBar(container, {
			actionItemProvider: (action: Action) => action instanceof CompositeOverflowActivityAction ? this.compositeOverflowActionItem : this.compositeIdToActionItems[action.id],
			orientation: this.options.orientation,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher"),
			animated: false
		});
		this.updateCompositeSwitcher();

		// Contextmenu for composites
		this.toDispose.push(dom.addDisposableListener(container, dom.EventType.CONTEXT_MENU, (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			this._onDidContextMenu.fire(e);
		}));

		// Allow to drop at the end to move composites to the end
		this.toDispose.push(dom.addDisposableListener(container, dom.EventType.DROP, (e: DragEvent) => {
			const draggedCompositeId = CompositeActionItem.getDraggedCompositeId();
			if (draggedCompositeId) {
				dom.EventHelper.stop(e, true);
				CompositeActionItem.clearDraggedComposite();

				const targetId = this.pinnedComposites[this.pinnedComposites.length - 1];
				if (targetId !== draggedCompositeId) {
					this._onDidDropComposite.fire({ compositeId: draggedCompositeId, toCompositeId: this.pinnedComposites[this.pinnedComposites.length - 1] });
				}
			}
		}));
	}

	private updateCompositeSwitcher(): void {
		if (!this.compositeSwitcherBar) {
			return; // We have not been rendered yet so there is nothing to update.
		}

		let compositesToShow = this.pinnedComposites;

		// Always show the active composite even if it is marked to be hidden
		if (this.activeCompositeId && !compositesToShow.some(id => id === this.activeCompositeId)) {
			this.activeUnpinnedCompositeId = this.activeCompositeId;
			compositesToShow = compositesToShow.concat(this.activeUnpinnedCompositeId);
		} else {
			this.activeUnpinnedCompositeId = void 0;
		}

		// Ensure we are not showing more composites than we have height for
		let overflows = false;
		if (this.dimension) {
			let maxVisible = compositesToShow.length;
			let size = 0;
			const limit = this.options.orientation === ActionsOrientation.VERTICAL ? this.dimension.height : this.dimension.width;
			for (let i = 0; i < compositesToShow.length && size <= limit; i++) {
				size += this.options.getCompositeSize(compositesToShow[i]);
				if (size > limit) {
					maxVisible = i;
				}
			}
			overflows = compositesToShow.length > maxVisible;

			if (overflows) {
				compositesToShow = compositesToShow.slice(0, maxVisible - 1 /* make room for overflow action */);
			}
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

		// Pull out composites that overflow or got hidden
		visibleComposites.forEach(compositeId => {
			if (compositesToShow.indexOf(compositeId) === -1) {
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
			this.compositeSwitcherBar.push(newCompositesToShow, { label: true, icon: true });

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
		if (visibleCompositesChange && overflows) {
			this.compositeOverflowAction = this.instantiationService.createInstance(CompositeOverflowActivityAction, () => this.compositeOverflowActionItem.showMenu());
			this.compositeOverflowActionItem = this.instantiationService.createInstance(
				CompositeOverflowActivityActionItem,
				this.compositeOverflowAction,
				() => this.getOverflowingComposites(),
				() => this.activeCompositeId,
				(compositeId: string) => this.compositeIdToActivityStack[compositeId] && this.compositeIdToActivityStack[compositeId][0].badge,
				this.options.getOpenCompositeAction
			);

			this.compositeSwitcherBar.push(this.compositeOverflowAction, { label: true, icon: true });
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

	public getVisibleComposites(): string[] {
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
		const compositeActivityAction = this.options.getActivityAction(compositeId);
		const pinnedAction = this.options.getCompositePinnedAction(compositeId);
		this.compositeIdToActionItems[compositeId] = this.instantiationService.createInstance(CompositeActionItem, compositeActivityAction, pinnedAction);
		this.compositeIdToActions[compositeId] = compositeActivityAction;

		return compositeActivityAction;
	}

	public unpin(compositeId: string): void {
		const index = this.pinnedComposites.indexOf(compositeId);
		this.pinnedComposites.splice(index, 1);

		this.updateCompositeSwitcher();
	}

	public isPinned(compositeId: string): boolean {
		return this.pinnedComposites.indexOf(compositeId) >= 0;
	}

	public pin(compositeId: string, update = true): void {
		this.pinnedComposites.push(compositeId);
		this.pinnedComposites = arrays.distinct(this.pinnedComposites);

		if (update) {
			this.updateCompositeSwitcher();
		}
	}

	public move(compositeId: string, toCompositeId: string): void {

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
	}

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.updateCompositeSwitcher();
	}

	public store(): void {
		this.storageService.store(this.options.storageId, JSON.stringify(this.pinnedComposites), StorageScope.GLOBAL);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}
