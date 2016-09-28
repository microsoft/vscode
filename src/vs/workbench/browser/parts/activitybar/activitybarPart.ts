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
import {Registry} from 'vs/platform/platform';
import {IComposite} from 'vs/workbench/common/composite';
import {ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions} from 'vs/workbench/browser/viewlet';
import {Part} from 'vs/workbench/browser/part';
import {ActivityAction, ActivityActionItem} from 'vs/workbench/browser/parts/activitybar/activityAction';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IActivityService, IBadge} from 'vs/workbench/services/activity/common/activityService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';

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

		// Composite switcher is on top
		this.viewletSwitcherBar = new ActionBar(div, {
			actionItemProvider: (action: Action) => this.activityActionItems[action.id],
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher")
		});
		this.viewletSwitcherBar.getContainer().addClass('position-top');

		// Build Viewlet Actions in correct order
		const allViewlets = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).getViewlets();
		const viewletActions = allViewlets.sort((v1, v2) => v1.order - v2.order).map(viewlet => this.toAction(viewlet));

		this.viewletSwitcherBar.push(viewletActions, { label: true, icon: true });
	}

	private toAction(composite: ViewletDescriptor): ActivityAction {
		const activeViewlet = this.viewletService.getActiveViewlet();
		const action = this.instantiationService.createInstance(ViewletActivityAction, composite.id + '.activity-bar-action', composite);

		this.activityActionItems[action.id] = new ActivityActionItem(action, composite.name, this.getKeybindingLabel(composite.id));
		this.compositeIdToActions[composite.id] = action;

		// Mark active viewlet as active
		if (activeViewlet && activeViewlet.getId() === composite.id) {
			action.activate();
		}

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
		id: string, private viewlet: ViewletDescriptor,
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

		const sideBarHidden = this.partService.isSideBarHidden();
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (!sideBarHidden && activeViewlet && activeViewlet.getId() === this.viewlet.id) {
			this.partService.setSideBarHidden(true);
		} else {
			this.viewletService.openViewlet(this.viewlet.id, true).done(null, errors.onUnexpectedError);
			this.activate();
		}

		return TPromise.as(true);
	}
}
