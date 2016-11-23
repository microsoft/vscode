/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activitybarpart';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import { Action } from 'vs/base/common/actions';
import errors = require('vs/base/common/errors');
import { ActionsOrientation, ActionBar, IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IComposite } from 'vs/workbench/common/composite';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { Part } from 'vs/workbench/browser/part';
import { ActivityAction, ActivityActionItem } from 'vs/workbench/browser/parts/activitybar/activityAction';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IActivityService, IBadge } from 'vs/workbench/services/activity/common/activityService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class ActivitybarPart extends Part implements IActivityService {
	public _serviceBrand: any;

	private viewletSwitcherBar: ActionBar;
	private activityActionItems: { [actionId: string]: IActionItem; };
	private compositeIdToActions: { [compositeId: string]: ActivityAction; };

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService
	) {
		super(id);

		this.activityActionItems = {};
		this.compositeIdToActions = {};

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onActiveCompositeChanged(viewlet)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onCompositeClosed(viewlet)));

		// Update viewlet switcher when external viewlets become ready
		this.toUnbind.push(this.viewletService.onDidExtViewletsLoad(() => this.refreshViewletSwitcher()));

		// Update viewlet switcher on toggling of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletToggle(() => this.refreshViewletSwitcher()));
	}

	private onActiveCompositeChanged(composite: IComposite): void {
		if (this.compositeIdToActions[composite.getId()]) {
			this.compositeIdToActions[composite.getId()].activate();
		}
	}

	private onCompositeClosed(composite: IComposite): void {
		if (this.compositeIdToActions[composite.getId()]) {
			this.compositeIdToActions[composite.getId()].deactivate();
		}
	}

	public showActivity(compositeId: string, badge: IBadge, clazz?: string): void {
		const action = this.compositeIdToActions[compositeId];
		if (action) {
			action.setBadge(badge);
			if (clazz) {
				action.class = clazz;
			}
		}
	}

	public clearActivity(compositeId: string): void {
		this.showActivity(compositeId, null);
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
			actionItemProvider: (action: Action) => this.activityActionItems[action.id],
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher")
		});

		this.fillViewletSwitcher(this.viewletService.getAllViewletsToDisplay());
	}

	private refreshViewletSwitcher(): void {
		this.fillViewletSwitcher(this.viewletService.getAllViewletsToDisplay());
	}

	private fillViewletSwitcher(viewlets: ViewletDescriptor[]) {
		// Pull out viewlets no longer needed
		const newViewletIds = viewlets.map(v => v.id);
		const existingViewletIds = Object.keys(this.compositeIdToActions);
		existingViewletIds.forEach(viewletId => {
			if (newViewletIds.indexOf(viewletId) === -1) {
				this.pullViewlet(viewletId);
			}
		});

		const actionsToPush = viewlets
			.filter(viewlet => !this.compositeIdToActions[viewlet.id])
			.map(viewlet => this.toAction(viewlet));

		this.viewletSwitcherBar.push(actionsToPush, { label: true, icon: true });
	}

	private pullViewlet(viewletId: string): void {
		const index = Object.keys(this.compositeIdToActions).indexOf(viewletId);
		const action = this.compositeIdToActions[viewletId];
		const actionItem = this.activityActionItems[action.id];
		delete this.compositeIdToActions[viewletId];
		delete this.activityActionItems[action.id];
		action.dispose();
		actionItem.dispose();
		this.viewletSwitcherBar.pull(index);
	}

	private toAction(composite: ViewletDescriptor): ActivityAction {
		const action = this.instantiationService.createInstance(ViewletActivityAction, composite.id + '.activity-bar-action', composite);

		this.activityActionItems[action.id] = new ActivityActionItem(action, composite.name, this.getKeybindingLabel(composite.id));
		this.compositeIdToActions[composite.id] = action;

		return action;
	};

	private getKeybindingLabel(id: string): string {
		const keys = this.keybindingService.lookupKeybindings(id).map(k => this.keybindingService.getLabelFor(k));
		if (keys && keys.length) {
			return keys[0];
		}

		return null;
	}

	public dispose(): void {
		if (this.viewletSwitcherBar) {
			this.viewletSwitcherBar.dispose();
			this.viewletSwitcherBar = null;
		}

		super.dispose();
	}
}

class ViewletActivityAction extends ActivityAction {
	private static preventDoubleClickDelay = 300;
	private lastRun: number = 0;

	constructor(
		id: string,
		private viewlet: ViewletDescriptor,
		@IViewletService private viewletService: IViewletService,
		@IPartService private partService: IPartService
	) {
		super(id, viewlet.name, viewlet.cssClass);
	}

	public run(): TPromise<any> {

		// prevent accident trigger on a doubleclick (to help nervous people)
		const now = Date.now();
		if (now - this.lastRun < ViewletActivityAction.preventDoubleClickDelay) {
			return TPromise.as(true);
		}
		this.lastRun = now;

		const sideBarVisible = this.partService.isVisible(Parts.SIDEBAR_PART);
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (sideBarVisible && activeViewlet && activeViewlet.getId() === this.viewlet.id) {
			this.partService.setSideBarHidden(true);
		} else {
			this.viewletService.openViewlet(this.viewlet.id, true).done(null, errors.onUnexpectedError);
			this.activate();
		}

		return TPromise.as(true);
	}
}
