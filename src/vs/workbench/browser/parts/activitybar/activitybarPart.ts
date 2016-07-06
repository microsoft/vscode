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
import {/*CONTEXT,*/ ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {Registry} from 'vs/platform/platform';
import {CompositeEvent, EventType} from 'vs/workbench/common/events';
import {ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions} from 'vs/workbench/browser/viewlet';
import {Part} from 'vs/workbench/browser/part';
import {ActivityAction, ActivityActionItem} from 'vs/workbench/browser/parts/activitybar/activityAction';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IActivityService, IBadge} from 'vs/workbench/services/activity/common/activityService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
// import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, prepareActions} from 'vs/workbench/browser/actionBarRegistry';
// import Severity from 'vs/base/common/severity';
// import {IAction} from 'vs/base/common/actions';
// import events = require('vs/base/common/events');

export class ActivitybarPart extends Part implements IActivityService {
	public serviceId = IActivityService;
	private viewletSwitcherBar: ActionBar;
	// private globalViewletSwitcherBar: ActionBar;
	private globalToolBar: ToolBar;
	private activityActionItems: { [actionId: string]: IActionItem; };
	private viewletIdToActions: { [viewletId: string]: ActivityAction; };

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEventService private eventService: IEventService,
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
		this.toUnbind.push(this.eventService.addListener2(EventType.COMPOSITE_OPENING, (e: CompositeEvent) => this.onCompositeOpening(e)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.eventService.addListener2(EventType.COMPOSITE_CLOSED, (e: CompositeEvent) => this.onCompositeClosed(e)));
	}

	private onCompositeOpening(e: CompositeEvent): void {
		if (this.viewletIdToActions[e.compositeId]) {
			this.viewletIdToActions[e.compositeId].activate();

			// There can only be one active viewlet action
			for (let key in this.viewletIdToActions) {
				if (this.viewletIdToActions.hasOwnProperty(key) && key !== e.compositeId) {
					this.viewletIdToActions[key].deactivate();
				}
			}
		}
	}

	private onCompositeClosed(e: CompositeEvent): void {
		if (this.viewletIdToActions[e.compositeId]) {
			this.viewletIdToActions[e.compositeId].deactivate();
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

		// Bottom Toolbar with action items for global actions
		// this.createGlobalToolBarArea($result.clone()); // not used currently

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

		// Global viewlet switcher is right below
		// this.globalViewletSwitcherBar = new ActionBar(div, {
		// 	actionItemProvider: (action: Action) => this.activityActionItems[action.id],
		// 	orientation: ActionsOrientation.VERTICAL,
		// 	ariaLabel: nls.localize('globalActivityBarAriaLabel', "Active Global View Switcher")
		// });
		// this.globalViewletSwitcherBar.getContainer().addClass('position-bottom');

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

		// Add to viewlet switcher
		// this.globalViewletSwitcherBar.push(allViewletActions
		// 	.filter(v => v.isGlobal)
		// 	.sort((v1, v2) => v1.order - v2.order)
		// 	.map(toAction),
		// actionOptions);
	}

	// private createGlobalToolBarArea(div: Builder): void {

	// 	// Global action bar is on the bottom
	// 	this.globalToolBar = new ToolBar(div.getHTMLElement(), this.contextMenuService, {
	// 		actionItemProvider: (action: Action) => this.activityActionItems[action.id],
	// 		orientation: ActionsOrientation.VERTICAL
	// 	});
	// 	this.globalToolBar.getContainer().addClass('global');

	// 	this.globalToolBar.actionRunner.addListener2(events.EventType.RUN, (e: any) => {

	// 		// Check for Error
	// 		if (e.error && !errors.isPromiseCanceledError(e.error)) {
	// 			this.messageService.show(Severity.Error, e.error);
	// 		}

	// 		// Log in telemetry
	// 		if (this.telemetryService) {
	// 			this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'activityBar' });
	// 		}
	// 	});

	// 	// Build Global Actions in correct order
	// 	let primaryActions = this.getGlobalActions(true);
	// 	let secondaryActions = this.getGlobalActions(false);

	// 	if (primaryActions.length + secondaryActions.length > 0) {
	// 		this.globalToolBar.getContainer().addClass('position-bottom');
	// 	}

	// 	// Add to global action bar
	// 	this.globalToolBar.setActions(prepareActions(primaryActions), prepareActions(secondaryActions))();
	// }

	// private getGlobalActions(primary: boolean): IAction[] {
	// 	let actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);

	// 	// Collect actions from actionbar contributor
	// 	let actions: IAction[];
	// 	if (primary) {
	// 		actions = actionBarRegistry.getActionBarActionsForContext(Scope.GLOBAL, CONTEXT);
	// 	} else {
	// 		actions = actionBarRegistry.getSecondaryActionBarActionsForContext(Scope.GLOBAL, CONTEXT);
	// 	}

	// 	return actions.map((action: Action) => {
	// 		if (primary) {
	// 			let keybinding: string = null;
	// 			let keys = this.keybindingService.lookupKeybindings(action.id).map(k => this.keybindingService.getLabelFor(k));
	// 			if (keys && keys.length) {
	// 				keybinding = keys[0];
	// 			}

	// 			let actionItem = actionBarRegistry.getActionItemForContext(Scope.GLOBAL, CONTEXT, action);

	// 			if (!actionItem) {
	// 				actionItem = new ActivityActionItem(action, action.label, keybinding);
	// 			}

	// 			if (actionItem instanceof ActivityActionItem) {
	// 				(<ActivityActionItem> actionItem).keybinding = keybinding;
	// 			}

	// 			this.activityActionItems[action.id] = actionItem;
	// 		}

	// 		return action;
	// 	});
	// }

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