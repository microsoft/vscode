/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activitybarpart';
import nls = require('vs/nls');
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import { Action } from 'vs/base/common/actions';
import { ActionsOrientation, ActionBar, IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IComposite } from 'vs/workbench/common/composite';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { Part } from 'vs/workbench/browser/part';
import { ViewletActivityAction, ActivityAction, ActivityActionItem, ViewletOverflowActivityAction, ViewletOverflowActivityActionItem } from 'vs/workbench/browser/parts/activitybar/activityAction';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IActivityService, IBadge } from 'vs/workbench/services/activity/common/activityService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

interface IViewletActivity {
	badge: IBadge;
	clazz: string;
}

export class ActivitybarPart extends Part implements IActivityService {

	private static ACTIVITY_ACTION_HEIGHT = 50;

	public _serviceBrand: any;

	private dimension: Dimension;

	private viewletSwitcherBar: ActionBar;
	private viewletOverflowAction: ViewletOverflowActivityAction;
	private viewletOverflowActionItem: ViewletOverflowActivityActionItem;

	private activityActionItems: { [actionId: string]: IActionItem; };
	private viewletIdToActions: { [viewletId: string]: ActivityAction; };
	private viewletIdToActivity: { [viewletId: string]: IViewletActivity; };

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IExtensionService private extensionService: IExtensionService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService
	) {
		super(id);

		this.activityActionItems = Object.create(null);
		this.viewletIdToActions = Object.create(null);
		this.viewletIdToActivity = Object.create(null);

		// Update viewlet switcher when external viewlets become ready
		this.extensionService.onReady().then(() => this.updateViewletSwitcher());

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onActiveCompositeChanged(viewlet)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onCompositeClosed(viewlet)));
	}

	private onActiveCompositeChanged(composite: IComposite): void {
		if (this.viewletIdToActions[composite.getId()]) {
			this.viewletIdToActions[composite.getId()].activate();
		}
	}

	private onCompositeClosed(composite: IComposite): void {
		if (this.viewletIdToActions[composite.getId()]) {
			this.viewletIdToActions[composite.getId()].deactivate();
		}
	}

	public showActivity(viewletId: string, badge?: IBadge, clazz?: string): void {

		// Update Action with activity
		const action = this.viewletIdToActions[viewletId];
		if (action) {
			action.setBadge(badge);
			if (clazz) {
				action.class = clazz;
			}
		}

		// Keep for future use
		if (badge) {
			this.viewletIdToActivity[viewletId] = { badge, clazz };
		} else {
			delete this.viewletIdToActivity[viewletId];
		}
	}

	public clearActivity(viewletId: string): void {
		this.showActivity(viewletId, null);
	}

	public createContentArea(parent: Builder): Builder {
		const $el = $(parent);
		const $result = $('.content').appendTo($el);

		// Top Actionbar with action items for each viewlet action
		this.createViewletSwitcher($result.clone());

		return $result;
	}

	private createViewletSwitcher(div: Builder): void {
		this.viewletSwitcherBar = new ActionBar(div, {
			actionItemProvider: (action: Action) => action instanceof ViewletOverflowActivityAction ? this.viewletOverflowActionItem : this.activityActionItems[action.id],
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher"),
			animated: false
		});

		this.updateViewletSwitcher();
	}

	private updateViewletSwitcher() {
		let viewlets = this.viewletService.getViewlets();
		let viewletsToShow = viewlets;

		// Ensure we are not showing more viewlets than we have height for
		let overflows = false;
		if (this.dimension) {
			const maxVisible = Math.floor(this.dimension.height / ActivitybarPart.ACTIVITY_ACTION_HEIGHT);
			overflows = viewlets.length > maxVisible;

			if (overflows) {
				viewletsToShow = viewlets.slice(0, maxVisible - 1 /* make room for overflow action */);
			}
		}

		const visibleViewlets = Object.keys(this.viewletIdToActions);
		const visibleViewletsChange = (viewletsToShow.length !== visibleViewlets.length);

		// Pull out overflow action if there is a viewlet change so that we can add it to the end later
		if (this.viewletOverflowAction && visibleViewletsChange) {
			this.viewletSwitcherBar.pull(this.viewletSwitcherBar.length() - 1);

			this.viewletOverflowAction.dispose();
			this.viewletOverflowAction = null;

			this.viewletOverflowActionItem.dispose();
			this.viewletOverflowActionItem = null;
		}

		// Pull out viewlets that overflow
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
				const activity = this.viewletIdToActivity[viewletId];
				if (activity) {
					this.showActivity(viewletId, activity.badge, activity.clazz);
				} else {
					this.showActivity(viewletId);
				}
			});
		}

		// Add overflow action as needed
		if (visibleViewletsChange && overflows) {
			const viewletsOverflowing = viewlets.slice(viewletsToShow.length);

			this.viewletOverflowAction = this.instantiationService.createInstance(ViewletOverflowActivityAction, viewletsOverflowing, () => this.viewletOverflowActionItem.showMenu());
			this.viewletOverflowActionItem = this.instantiationService.createInstance(ViewletOverflowActivityActionItem, this.viewletOverflowAction, viewletsOverflowing, viewlet => this.viewletIdToActivity[viewlet.id] && this.viewletIdToActivity[viewlet.id].badge);

			this.viewletSwitcherBar.push(this.viewletOverflowAction, { label: true, icon: true });
		}
	}

	private pullViewlet(viewletId: string): void {
		const index = Object.keys(this.viewletIdToActions).indexOf(viewletId);
		this.viewletSwitcherBar.pull(index);

		const action = this.viewletIdToActions[viewletId];
		action.dispose();
		delete this.viewletIdToActions[viewletId];

		const actionItem = this.activityActionItems[action.id];
		actionItem.dispose();
		delete this.activityActionItems[action.id];
	}

	private toAction(viewlet: ViewletDescriptor): ActivityAction {
		const action = this.instantiationService.createInstance(ViewletActivityAction, viewlet);

		this.activityActionItems[action.id] = this.instantiationService.createInstance(ActivityActionItem, action, viewlet);
		this.viewletIdToActions[viewlet.id] = action;

		return action;
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
}