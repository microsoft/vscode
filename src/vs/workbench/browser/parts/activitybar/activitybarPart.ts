/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activitybarpart';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import DOM = require('vs/base/browser/dom');
import * as arrays from 'vs/base/common/arrays';
import { illegalArgument } from 'vs/base/common/errors';
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import { Action } from 'vs/base/common/actions';
import { ActionsOrientation, ActionBar, IActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { GlobalActivityExtensions, IGlobalActivityRegistry } from 'vs/workbench/browser/activity';
import { Registry } from 'vs/platform/registry/common/platform';
import { Part } from 'vs/workbench/browser/part';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { ToggleViewletPinnedAction, ViewletActivityAction, ActivityAction, GlobalActivityActionItem, ViewletActionItem, ViewletOverflowActivityAction, ViewletOverflowActivityActionItem, GlobalActivityAction, IViewletActivity } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IActivityBarService, IBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IPartService, Position as SideBarPosition } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Scope as MementoScope } from 'vs/workbench/common/memento';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ToggleActivityBarVisibilityAction } from 'vs/workbench/browser/actions/toggleActivityBarVisibility';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER } from 'vs/workbench/common/theme';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';

export class ActivitybarPart extends Part implements IActivityBarService {

	private static readonly ACTIVITY_ACTION_HEIGHT = 50;
	private static readonly PINNED_VIEWLETS = 'workbench.activity.pinnedViewlets';

	public _serviceBrand: any;

	private dimension: Dimension;

	private globalActionBar: ActionBar;
	private globalActivityIdToActions: { [globalActivityId: string]: GlobalActivityAction; };

	private viewletSwitcherBar: ActionBar;
	private viewletOverflowAction: ViewletOverflowActivityAction;
	private viewletOverflowActionItem: ViewletOverflowActivityActionItem;

	private viewletIdToActions: { [viewletId: string]: ActivityAction; };
	private viewletIdToActionItems: { [viewletId: string]: IActionItem; };
	private viewletIdToActivityStack: { [viewletId: string]: IViewletActivity[]; };

	private memento: object;
	private pinnedViewlets: string[];
	private activeUnpinnedViewlet: ViewletDescriptor;

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IExtensionService private extensionService: IExtensionService,
		@IStorageService private storageService: IStorageService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IThemeService themeService: IThemeService
	) {
		super(id, { hasTitle: false }, themeService);

		this.globalActivityIdToActions = Object.create(null);

		this.viewletIdToActionItems = Object.create(null);
		this.viewletIdToActions = Object.create(null);
		this.viewletIdToActivityStack = Object.create(null);

		this.memento = this.getMemento(this.storageService, MementoScope.GLOBAL);

		const pinnedViewlets = this.memento[ActivitybarPart.PINNED_VIEWLETS] as string[];

		if (pinnedViewlets) {
			this.pinnedViewlets = pinnedViewlets
				// TODO@Ben: Migrate git => scm viewlet
				.map(id => id === 'workbench.view.git' ? 'workbench.view.scm' : id)
				.filter(arrays.uniqueFilter<string>(str => str));
		} else {
			this.pinnedViewlets = this.viewletService.getViewlets().map(v => v.id);
		}

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onDidViewletOpen(viewlet)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onDidViewletClose(viewlet)));
	}

	private onDidViewletOpen(viewlet: IViewlet): void {
		const id = viewlet.getId();

		if (this.viewletIdToActions[id]) {
			this.viewletIdToActions[id].activate();
		}

		const activeUnpinnedViewletShouldClose = this.activeUnpinnedViewlet && this.activeUnpinnedViewlet.id !== viewlet.getId();
		const activeUnpinnedViewletShouldShow = !this.getPinnedViewlets().some(v => v.id === viewlet.getId());
		if (activeUnpinnedViewletShouldShow || activeUnpinnedViewletShouldClose) {
			this.updateViewletSwitcher();
		}
	}

	private onDidViewletClose(viewlet: IViewlet): void {
		const id = viewlet.getId();

		if (this.viewletIdToActions[id]) {
			this.viewletIdToActions[id].deactivate();
		}
	}

	public showGlobalActivity(globalActivityId: string, badge: IBadge): IDisposable {
		if (!badge) {
			throw illegalArgument('badge');
		}

		const action = this.globalActivityIdToActions[globalActivityId];
		if (!action) {
			throw illegalArgument('globalActivityId');
		}

		action.setBadge(badge);

		return toDisposable(() => action.setBadge(undefined));
	}

	public showActivity(viewletId: string, badge: IBadge, clazz?: string): IDisposable {
		if (!badge) {
			throw illegalArgument('badge');
		}

		const activity = <IViewletActivity>{ badge, clazz };
		const stack = this.viewletIdToActivityStack[viewletId] || (this.viewletIdToActivityStack[viewletId] = []);
		stack.unshift(activity);

		this.updateActivity(viewletId);

		return {
			dispose: () => {
				const stack = this.viewletIdToActivityStack[viewletId];
				if (!stack) {
					return;
				}
				const idx = stack.indexOf(activity);
				if (idx < 0) {
					return;
				}
				stack.splice(idx, 1);
				if (stack.length === 0) {
					delete this.viewletIdToActivityStack[viewletId];
				}
				this.updateActivity(viewletId);
			}
		};
	}

	private updateActivity(viewletId: string) {
		const action = this.viewletIdToActions[viewletId];
		if (!action) {
			return;
		}
		const stack = this.viewletIdToActivityStack[viewletId];
		if (!stack || !stack.length) {
			// reset
			action.setBadge(undefined);

		} else {
			// update
			const [{ badge, clazz }] = stack;
			action.setBadge(badge);
			if (clazz) {
				action.class = clazz;
			}
		}
	}

	public createContentArea(parent: Builder): Builder {
		const $el = $(parent);
		const $result = $('.content').appendTo($el);

		// Top Actionbar with action items for each viewlet action
		this.createViewletSwitcher($result.clone());

		// Top Actionbar with action items for each viewlet action
		this.createGlobalActivityActionBar($result.getHTMLElement());

		// Contextmenu for viewlets
		$(parent).on('contextmenu', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, true);

			this.showContextMenu(e);
		}, this.toUnbind);

		// Allow to drop at the end to move viewlet to the end
		$(parent).on(DOM.EventType.DROP, (e: DragEvent) => {
			const draggedViewlet = ViewletActionItem.getDraggedViewlet();
			if (draggedViewlet) {
				DOM.EventHelper.stop(e, true);

				ViewletActionItem.clearDraggedViewlet();

				const targetId = this.pinnedViewlets[this.pinnedViewlets.length - 1];
				if (targetId !== draggedViewlet.id) {
					this.move(draggedViewlet.id, this.pinnedViewlets[this.pinnedViewlets.length - 1]);
				}
			}
		});

		return $result;
	}

	public updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();
		const background = this.getColor(ACTIVITY_BAR_BACKGROUND);
		container.style('background-color', background);

		const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder);
		const isPositionLeft = this.partService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style('box-sizing', borderColor && isPositionLeft ? 'border-box' : null);
		container.style('border-right-width', borderColor && isPositionLeft ? '1px' : null);
		container.style('border-right-style', borderColor && isPositionLeft ? 'solid' : null);
		container.style('border-right-color', isPositionLeft ? borderColor : null);
		container.style('border-left-width', borderColor && !isPositionLeft ? '1px' : null);
		container.style('border-left-style', borderColor && !isPositionLeft ? 'solid' : null);
		container.style('border-left-color', !isPositionLeft ? borderColor : null);
	}

	private showContextMenu(e: MouseEvent): void {
		const event = new StandardMouseEvent(e);

		const actions: Action[] = this.viewletService.getViewlets().map(viewlet => this.instantiationService.createInstance(ToggleViewletPinnedAction, viewlet));
		actions.push(new Separator());
		actions.push(this.instantiationService.createInstance(ToggleActivityBarVisibilityAction, ToggleActivityBarVisibilityAction.ID, nls.localize('hideActivitBar', "Hide Activity Bar")));

		this.contextMenuService.showContextMenu({
			getAnchor: () => { return { x: event.posx + 1, y: event.posy }; },
			getActions: () => TPromise.as(actions),
			onHide: () => dispose(actions)
		});
	}

	private createViewletSwitcher(div: Builder): void {
		this.viewletSwitcherBar = new ActionBar(div, {
			actionItemProvider: (action: Action) => action instanceof ViewletOverflowActivityAction ? this.viewletOverflowActionItem : this.viewletIdToActionItems[action.id],
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher"),
			animated: false
		});

		this.updateViewletSwitcher();

		// Update viewlet switcher when external viewlets become ready
		this.extensionService.onReady().then(() => this.updateViewletSwitcher());
	}

	private createGlobalActivityActionBar(container: HTMLElement): void {
		const activityRegistry = Registry.as<IGlobalActivityRegistry>(GlobalActivityExtensions);
		const descriptors = activityRegistry.getActivities();
		const actions = descriptors
			.map(d => this.instantiationService.createInstance(d))
			.map(a => new GlobalActivityAction(a));

		this.globalActionBar = new ActionBar(container, {
			actionItemProvider: a => this.instantiationService.createInstance(GlobalActivityActionItem, a),
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('globalActions', "Global Actions"),
			animated: false
		});

		actions.forEach(a => {
			this.globalActivityIdToActions[a.id] = a;
			this.globalActionBar.push(a);
		});
	}

	private updateViewletSwitcher() {
		if (!this.viewletSwitcherBar) {
			return; // We have not been rendered yet so there is nothing to update.
		}

		let viewletsToShow = this.getPinnedViewlets();

		// Always show the active viewlet even if it is marked to be hidden
		const activeViewlet = this.viewletService.getActiveViewlet();
		if (activeViewlet && !viewletsToShow.some(viewlet => viewlet.id === activeViewlet.getId())) {
			this.activeUnpinnedViewlet = this.viewletService.getViewlet(activeViewlet.getId());
			viewletsToShow.push(this.activeUnpinnedViewlet);
		} else {
			this.activeUnpinnedViewlet = void 0;
		}

		// Ensure we are not showing more viewlets than we have height for
		let overflows = false;
		if (this.dimension) {
			let availableHeight = this.dimension.height;
			if (this.globalActionBar) {
				availableHeight -= (this.globalActionBar.items.length * ActivitybarPart.ACTIVITY_ACTION_HEIGHT); // adjust for global actions showing
			}

			const maxVisible = Math.floor(availableHeight / ActivitybarPart.ACTIVITY_ACTION_HEIGHT);
			overflows = viewletsToShow.length > maxVisible;

			if (overflows) {
				viewletsToShow = viewletsToShow.slice(0, maxVisible - 1 /* make room for overflow action */);
			}
		}

		const visibleViewlets = Object.keys(this.viewletIdToActions);
		const visibleViewletsChange = !arrays.equals(viewletsToShow.map(viewlet => viewlet.id), visibleViewlets);

		// Pull out overflow action if there is a viewlet change so that we can add it to the end later
		if (this.viewletOverflowAction && visibleViewletsChange) {
			this.viewletSwitcherBar.pull(this.viewletSwitcherBar.length() - 1);

			this.viewletOverflowAction.dispose();
			this.viewletOverflowAction = null;

			this.viewletOverflowActionItem.dispose();
			this.viewletOverflowActionItem = null;
		}

		// Pull out viewlets that overflow or got hidden
		const viewletIdsToShow = viewletsToShow.map(v => v.id);
		visibleViewlets.forEach(viewletId => {
			if (viewletIdsToShow.indexOf(viewletId) === -1) {
				this.pullViewlet(viewletId);
			}
		});

		// Built actions for viewlets to show
		const newViewletsToShow = viewletsToShow
			.filter(viewlet => !this.viewletIdToActions[viewlet.id])
			.map(viewlet => this.toAction(viewlet));

		// Update when we have new viewlets to show
		if (newViewletsToShow.length) {

			// Add to viewlet switcher
			this.viewletSwitcherBar.push(newViewletsToShow, { label: true, icon: true });

			// Make sure to activate the active one
			const activeViewlet = this.viewletService.getActiveViewlet();
			if (activeViewlet) {
				const activeViewletEntry = this.viewletIdToActions[activeViewlet.getId()];
				if (activeViewletEntry) {
					activeViewletEntry.activate();
				}
			}

			// Make sure to restore activity
			Object.keys(this.viewletIdToActions).forEach(viewletId => {
				this.updateActivity(viewletId);
			});
		}

		// Add overflow action as needed
		if (visibleViewletsChange && overflows) {
			this.viewletOverflowAction = this.instantiationService.createInstance(ViewletOverflowActivityAction, () => this.viewletOverflowActionItem.showMenu());
			this.viewletOverflowActionItem = this.instantiationService.createInstance(ViewletOverflowActivityActionItem, this.viewletOverflowAction, () => this.getOverflowingViewlets(), (viewlet: ViewletDescriptor) => this.viewletIdToActivityStack[viewlet.id] && this.viewletIdToActivityStack[viewlet.id][0].badge);

			this.viewletSwitcherBar.push(this.viewletOverflowAction, { label: true, icon: true });
		}
	}

	private getOverflowingViewlets(): ViewletDescriptor[] {
		const viewlets = this.getPinnedViewlets();
		if (this.activeUnpinnedViewlet) {
			viewlets.push(this.activeUnpinnedViewlet);
		}
		const visibleViewlets = Object.keys(this.viewletIdToActions);

		return viewlets.filter(viewlet => visibleViewlets.indexOf(viewlet.id) === -1);
	}

	private getVisibleViewlets(): ViewletDescriptor[] {
		const viewlets = this.viewletService.getViewlets();
		const visibleViewlets = Object.keys(this.viewletIdToActions);

		return viewlets.filter(viewlet => visibleViewlets.indexOf(viewlet.id) >= 0);
	}

	private getPinnedViewlets(): ViewletDescriptor[] {
		return this.pinnedViewlets.map(viewletId => this.viewletService.getViewlet(viewletId)).filter(v => !!v); // ensure to remove those that might no longer exist
	}

	private pullViewlet(viewletId: string): void {
		const index = Object.keys(this.viewletIdToActions).indexOf(viewletId);
		if (index >= 0) {
			this.viewletSwitcherBar.pull(index);

			const action = this.viewletIdToActions[viewletId];
			action.dispose();
			delete this.viewletIdToActions[viewletId];

			const actionItem = this.viewletIdToActionItems[action.id];
			actionItem.dispose();
			delete this.viewletIdToActionItems[action.id];
		}
	}

	private toAction(viewlet: ViewletDescriptor): ActivityAction {
		const action = this.instantiationService.createInstance(ViewletActivityAction, viewlet);

		this.viewletIdToActionItems[action.id] = this.instantiationService.createInstance(ViewletActionItem, action);
		this.viewletIdToActions[viewlet.id] = action;

		return action;
	}

	public getPinned(): string[] {
		return this.pinnedViewlets;
	}

	public unpin(viewletId: string): void {
		if (!this.isPinned(viewletId)) {
			return;
		}

		const activeViewlet = this.viewletService.getActiveViewlet();
		const defaultViewletId = this.viewletService.getDefaultViewletId();
		const visibleViewlets = this.getVisibleViewlets();

		let unpinPromise: TPromise<any>;

		// Case: viewlet is not the active one or the active one is a different one
		// Solv: we do nothing
		if (!activeViewlet || activeViewlet.getId() !== viewletId) {
			unpinPromise = TPromise.as(null);
		}

		// Case: viewlet is not the default viewlet and default viewlet is still showing
		// Solv: we open the default viewlet
		else if (defaultViewletId !== viewletId && this.isPinned(defaultViewletId)) {
			unpinPromise = this.viewletService.openViewlet(defaultViewletId, true);
		}

		// Case: we closed the last visible viewlet
		// Solv: we hide the sidebar
		else if (visibleViewlets.length === 1) {
			unpinPromise = this.partService.setSideBarHidden(true);
		}

		// Case: we closed the default viewlet
		// Solv: we open the next visible viewlet from top
		else {
			unpinPromise = this.viewletService.openViewlet(visibleViewlets.filter(viewlet => viewlet.id !== viewletId)[0].id, true);
		}

		unpinPromise.then(() => {

			// then remove from pinned and update switcher
			const index = this.pinnedViewlets.indexOf(viewletId);
			this.pinnedViewlets.splice(index, 1);

			this.updateViewletSwitcher();
		});
	}

	public isPinned(viewletId: string): boolean {
		return this.pinnedViewlets.indexOf(viewletId) >= 0;
	}

	public pin(viewletId: string, update = true): void {
		if (this.isPinned(viewletId)) {
			return;
		}

		// first open that viewlet
		this.viewletService.openViewlet(viewletId, true).then(() => {

			// then update
			this.pinnedViewlets.push(viewletId);
			this.pinnedViewlets = arrays.distinct(this.pinnedViewlets);

			if (update) {
				this.updateViewletSwitcher();
			}
		});
	}

	public move(viewletId: string, toViewletId: string): void {

		// Make sure a moved viewlet gets pinned
		if (!this.isPinned(viewletId)) {
			this.pin(viewletId, false /* defer update, we take care of it */);
		}

		const fromIndex = this.pinnedViewlets.indexOf(viewletId);
		const toIndex = this.pinnedViewlets.indexOf(toViewletId);

		this.pinnedViewlets.splice(fromIndex, 1);
		this.pinnedViewlets.splice(toIndex, 0, viewletId);

		// Clear viewlets that are impacted by the move
		const visibleViewlets = Object.keys(this.viewletIdToActions);
		for (let i = Math.min(fromIndex, toIndex); i < visibleViewlets.length; i++) {
			this.pullViewlet(visibleViewlets[i]);
		}

		// timeout helps to prevent artifacts from showing up
		setTimeout(() => {
			this.updateViewletSwitcher();
		}, 0);
	}

	/**
	 * Layout title, content and status area in the given dimension.
	 */
	public layout(dimension: Dimension): Dimension[] {

		// Pass to super
		const sizes = super.layout(dimension);

		this.dimension = sizes[1];

		// Update switcher to handle overflow issues
		this.updateViewletSwitcher();

		return sizes;
	}

	public dispose(): void {
		if (this.viewletSwitcherBar) {
			this.viewletSwitcherBar.dispose();
			this.viewletSwitcherBar = null;
		}

		if (this.globalActionBar) {
			this.globalActionBar.dispose();
			this.globalActionBar = null;
		}

		super.dispose();
	}

	public shutdown(): void {

		// Persist Hidden State
		this.memento[ActivitybarPart.PINNED_VIEWLETS] = this.pinnedViewlets;

		// Pass to super
		super.shutdown();
	}
}