/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activitybarpart';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, $} from 'vs/base/browser/builder';
import {Action} from 'vs/base/common/actions';
import errors = require('vs/base/common/errors');
import {ActionsOrientation, ActionBar, IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {Registry} from 'vs/platform/platform';
import {IViewlet} from 'vs/workbench/common/viewlet';
import {ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions} from 'vs/workbench/browser/viewlet';
import {Part} from 'vs/workbench/browser/part';
import {ActivityAction, ActivityActionItem} from 'vs/workbench/browser/parts/activitybar/activityAction';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IActivityService, IBadge} from 'vs/workbench/services/activity/common/activityService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';

export class ActivitybarPart extends Part implements IActivityService {
	public _serviceBrand: any;
	private viewletSwitcherBar: ActionBar;
	private globalToolBar: ToolBar;
	private activityActionItems: { [actionId: string]: IActionItem; };
	private viewletIdToActions: { [viewletId: string]: ActivityAction; };

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id);

		this.activityActionItems = {};
		this.viewletIdToActions = {};

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onActiveViewletChanged(viewlet)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onViewletClosed(viewlet)));
	}

	private onActiveViewletChanged(viewlet: IViewlet): void {
		if (this.viewletIdToActions[viewlet.getId()]) {
			this.viewletIdToActions[viewlet.getId()].activate();

			// There can only be one active viewlet action
			for (let key in this.viewletIdToActions) {
				if (this.viewletIdToActions.hasOwnProperty(key) && key !== viewlet.getId()) {
					this.viewletIdToActions[key].deactivate();
				}
			}
		}
	}

	private onViewletClosed(viewlet: IViewlet): void {
		if (this.viewletIdToActions[viewlet.getId()]) {
			this.viewletIdToActions[viewlet.getId()].deactivate();
		}
	}

	public showActivity(viewletId: string, badge: IBadge, clazz?: string): void {
		let action = this.viewletIdToActions[viewletId];
		if (action) {
			action.setBadge(badge);
			if (clazz) {
				action.class = clazz;
			}
		}
	}

	public clearActivity(viewletId: string): void {
		this.showActivity(viewletId, null);
	}

	public createContentArea(parent: Builder): Builder {
		let $el = $(parent);
		let $result = $('.content').appendTo($el);

		// Top Actionbar with action items for each viewlet action
		this.createViewletSwitcher($result.clone());

		return $result;
	}

	private createViewletSwitcher(div: Builder): void {

		// Viewlet switcher is on top
		this.viewletSwitcherBar = new ActionBar(div, {
			actionItemProvider: (action: Action) => this.activityActionItems[action.id],
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher")
		});
		this.viewletSwitcherBar.getContainer().addClass('position-top');

		// Build Viewlet Actions in correct order
		const activeViewlet = this.viewletService.getActiveViewlet();
		const registry = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets));
		const allViewletActions = registry.getViewlets();
		const actionOptions = { label: true, icon: true };

		const toAction = (viewlet: ViewletDescriptor) => {
			let action = this.instantiationService.createInstance(ViewletActivityAction, viewlet.id + '.activity-bar-action', viewlet);

			let keybinding: string = null;
			let keys = this.keybindingService.lookupKeybindings(viewlet.id).map(k => this.keybindingService.getLabelFor(k));
			if (keys && keys.length) {
				keybinding = keys[0];
			}

			this.activityActionItems[action.id] = new ActivityActionItem(action, viewlet.name, keybinding);
			this.viewletIdToActions[viewlet.id] = action;

			// Mark active viewlet action as active
			if (activeViewlet && activeViewlet.getId() === viewlet.id) {
				action.activate();
			}

			return action;
		};

		// Add to viewlet switcher
		this.viewletSwitcherBar.push(allViewletActions
			.filter(v => !v.isGlobal)
			.sort((v1, v2) => v1.order - v2.order)
			.map(toAction)
			, actionOptions);
	}

	public dispose(): void {
		if (this.viewletSwitcherBar) {
			this.viewletSwitcherBar.dispose();
			this.viewletSwitcherBar = null;
		}

		if (this.globalToolBar) {
			this.globalToolBar.dispose();
			this.globalToolBar = null;
		}

		super.dispose();
	}
}

class ViewletActivityAction extends ActivityAction {
	private static preventDoubleClickDelay = 300;
	private lastRun: number = 0;

	private viewlet: ViewletDescriptor;

	constructor(
		id: string, viewlet: ViewletDescriptor,
		@IViewletService private viewletService: IViewletService,
		@IPartService private partService: IPartService
	) {
		super(id, viewlet.name, viewlet.cssClass);

		this.viewlet = viewlet;
	}

	public run(): TPromise<any> {

		// prevent accident trigger on a doubleclick (to help nervous people)
		let now = Date.now();
		if (now - this.lastRun < ViewletActivityAction.preventDoubleClickDelay) {
			return TPromise.as(true);
		}
		this.lastRun = now;

		let sideBarHidden = this.partService.isSideBarHidden();
		let activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (!sideBarHidden && activeViewlet && activeViewlet.getId() === this.viewlet.id) {
			this.partService.setSideBarHidden(true);
		}

		// Open viewlet and focus it
		else {
			this.viewletService.openViewlet(this.viewlet.id, true).done(null, errors.onUnexpectedError);
			this.activate();
		}

		return TPromise.as(true);
	}
}