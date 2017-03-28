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
import { Part } from 'vs/workbench/browser/part';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { ToggleViewletPinnedAction, ViewletActivityAction, ActivityAction, ActivityActionItem, ViewletOverflowActivityAction, ViewletOverflowActivityActionItem } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IActivityBarService, IBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IPartService, Position as SideBarPosition } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Scope as MementoScope } from 'vs/workbench/common/memento';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ToggleActivityBarVisibilityAction } from 'vs/workbench/browser/actions/toggleActivityBarVisibility';
import SCMPreview from 'vs/workbench/parts/scm/browser/scmPreview';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { highContrastBorder, highContrastOutline, focus } from 'vs/platform/theme/common/colorRegistry';

interface IViewletActivity {
	badge: IBadge;
	clazz: string;
}

export class ActivitybarPart extends Part implements IActivityBarService {

	private static readonly ACTIVITY_ACTION_HEIGHT = 50;
	private static readonly PINNED_VIEWLETS = 'workbench.activity.pinnedViewlets';

	public _serviceBrand: any;

	private dimension: Dimension;

	private viewletSwitcherBar: ActionBar;
	private viewletOverflowAction: ViewletOverflowActivityAction;
	private viewletOverflowActionItem: ViewletOverflowActivityActionItem;

	private viewletIdToActions: { [viewletId: string]: ActivityAction; };
	private viewletIdToActionItems: { [viewletId: string]: IActionItem; };
	private viewletIdToActivityStack: { [viewletId: string]: IViewletActivity[]; };

	private memento: any;
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

		this.viewletIdToActionItems = Object.create(null);
		this.viewletIdToActions = Object.create(null);
		this.viewletIdToActivityStack = Object.create(null);

		this.memento = this.getMemento(this.storageService, MementoScope.GLOBAL);

		const pinnedViewlets = this.memento[ActivitybarPart.PINNED_VIEWLETS] as string[];

		if (pinnedViewlets) {
			// TODO@Ben: Migrate git => scm viewlet

			const map = SCMPreview.enabled
				? (id => id === 'workbench.view.git' ? 'workbench.view.scm' : id)
				: (id => id === 'workbench.view.scm' ? 'workbench.view.git' : id);

			this.pinnedViewlets = pinnedViewlets
				.map(map)
				.filter(arrays.uniqueFilter<string>(str => str));

		} else {
			this.pinnedViewlets = this.viewletService.getViewlets().map(v => v.id);
		}

		// Update viewlet switcher when external viewlets become ready
		this.extensionService.onReady().then(() => this.updateViewletSwitcher());

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

		// Contextmenu for viewlets
		$(parent).on('contextmenu', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, true);

			this.showContextMenu(e);
		}, this.toUnbind);

		// Allow to drop at the end to move viewlet to the end
		$(parent).on(DOM.EventType.DROP, (e: DragEvent) => {
			const draggedViewlet = ActivityActionItem.getDraggedViewlet();
			if (draggedViewlet) {
				DOM.EventHelper.stop(e, true);

				ActivityActionItem.clearDraggedViewlet();

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
		container.style('background-color', this.getColor(ACTIVITY_BAR_BACKGROUND));

		const useBorder = this.isHighContrastTheme;
		const isPositionLeft = this.partService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style('box-sizing', useBorder && isPositionLeft ? 'border-box' : null);
		container.style('border-right-width', useBorder && isPositionLeft ? '1px' : null);
		container.style('border-right-style', useBorder && isPositionLeft ? 'solid' : null);
		container.style('border-right-color', useBorder && isPositionLeft ? this.getColor(highContrastBorder) : null);
		container.style('border-left-width', useBorder && !isPositionLeft ? '1px' : null);
		container.style('border-left-style', useBorder && !isPositionLeft ? 'solid' : null);
		container.style('border-left-color', useBorder && !isPositionLeft ? this.getColor(highContrastBorder) : null);
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
	}

	private updateViewletSwitcher() {
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
			const maxVisible = Math.floor(this.dimension.height / ActivitybarPart.ACTIVITY_ACTION_HEIGHT);
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

		this.viewletIdToActionItems[action.id] = this.instantiationService.createInstance(ActivityActionItem, action, viewlet);
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

		super.dispose();
	}

	public shutdown(): void {

		// Persist Hidden State
		this.memento[ActivitybarPart.PINNED_VIEWLETS] = this.pinnedViewlets;

		// Pass to super
		super.shutdown();
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// High Contrast Styling
	if (theme.type === 'hc') {
		const outline = theme.getColor(highContrastOutline);

		collector.addRule(`
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-label:before {
				content: "";
				position: absolute;
				top: 9px;
				left: 9px;
				height: 32px;
				width: 32px;
				opacity: 0.6;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar.global .action-item .action-label.active:before {
				border: none;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label.active:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label.active:hover:before {
				outline: 1px solid;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label:hover:before {
				outline: 1px dashed;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-label,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-label.active,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label.active:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:hover .action-label:before {
				opacity: 1;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label:focus:before {
				border-left-color: ${outline};
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label.active:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label.active:hover:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label:hover:before {
				outline-color: ${outline};
			}
		`);
	}

	// Non High Contrast Themes
	else {
		const focusBorder = theme.getColor(focus);

		collector.addRule(`
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-label {
				opacity: 0.6;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label:focus:before {
				border-left-color: ${focusBorder};
			}
		`);
	}
});