/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activitybarpart';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { Builder, $ } from 'vs/base/browser/builder';
import { Action } from 'vs/base/common/actions';
import errors = require('vs/base/common/errors');
import { ActionsOrientation, ActionBar, IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { Registry } from 'vs/platform/platform';
import { IComposite } from 'vs/workbench/common/composite';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { Part } from 'vs/workbench/browser/part';
import { ActivityAction, ActivityActionItem } from 'vs/workbench/browser/parts/activitybar/activityAction';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IActivityService, IBadge } from 'vs/workbench/services/activity/common/activityService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

export class ActivitybarPart extends Part implements IActivityService {
	public _serviceBrand: any;

	private viewletSwitcherBar: ActionBar;
	private activityActionItems: { [actionId: string]: IActionItem; };
	private compositeIdToActions: { [compositeId: string]: ActivityAction; };

	private enabledExternalViewlets: string[];
	private registeredViewlets: { [viewletId: string]: ViewletDescriptor; };

	private externalViewletIdToOpen: string;

	private static ENABLED_EXTERNAL_VIEWLETS = 'workbench.activityBar.enabledExternalViewlets';

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super(id);

		this.activityActionItems = {};
		this.compositeIdToActions = {};

		const enabledExternalViewletsJson = this.storageService.get(ActivitybarPart.ENABLED_EXTERNAL_VIEWLETS);
		this.enabledExternalViewlets = enabledExternalViewletsJson ? JSON.parse(enabledExternalViewletsJson) : [];
		this.registeredViewlets = {};

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onActiveCompositeChanged(viewlet)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onCompositeClosed(viewlet)));

		// Update activity bar on registering external viewlets
		this.extensionService.onReady().then(() => {
			const viewlets = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).getViewlets();
			this.onDidRegisterExternalViewlets(viewlets);
		});
	}

	private onDidRegisterExternalViewlets(viewlets: ViewletDescriptor[]): void {
		viewlets.forEach(v => {
			this.registeredViewlets[v.id] = v;
		});

		this.viewletSwitcherBar.push(this.getAllEnabledExternalViewlets().map(d => this.toAction(d)), { label: true, icon: true });
		if (this.externalViewletIdToOpen) {
			this.compositeIdToActions[this.externalViewletIdToOpen].run().done();
		}
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

	public getInfoForRegisteredViewlets(): {
		[viewletId: string]: {
			isEnabled: boolean;
			treeLabel: string;
		}
	} {
		const result = {};
		for (let viewletId in this.registeredViewlets) {
			result[viewletId] = {
				isEnabled: (this.enabledExternalViewlets.indexOf(viewletId) !== -1),
				treeLabel: this.registeredViewlets[viewletId].name
			};
		}
		return result;
	}

	public toggleViewlet(viewletId: string): void {
		const index = this.enabledExternalViewlets.indexOf(viewletId);
		if (index === -1) {
			this.enabledExternalViewlets.push(viewletId);
		} else {
			this.enabledExternalViewlets.splice(index, 1);
		}

		this.setEnabledExternalViewlets();
		this.refreshViewletSwitcher();
	}

	private setEnabledExternalViewlets(): void {
		this.storageService.store(ActivitybarPart.ENABLED_EXTERNAL_VIEWLETS, JSON.stringify(this.enabledExternalViewlets));
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

		const allStockViewlets = this.getAllStockViewlets();
		this.fillViewletSwitcher(allStockViewlets);
	}

	private refreshViewletSwitcher(): void {
		this.viewletSwitcherBar.clear();

		const allStockViewlets = this.getAllStockViewlets();
		const allEnabledExternalViewlets = this.getAllEnabledExternalViewlets();
		this.fillViewletSwitcher(allStockViewlets.concat(allEnabledExternalViewlets));
	}

	private fillViewletSwitcher(viewlets: ViewletDescriptor[]) {
		const viewletActions = viewlets.map(v => this.toAction(v));
		this.viewletSwitcherBar.push(viewletActions, { label: true, icon: true });
	}

	// Get an ordered list of all stock viewlets
	private getAllStockViewlets(): ViewletDescriptor[] {
		return (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets))
			.getViewlets()
			.filter(viewlet => !viewlet.isExternal)
			.sort((v1, v2) => v1.order - v2.order);
	}

	// Get a list of all enabled external viewlets, ordered by the enabling sequence
	private getAllEnabledExternalViewlets(): ViewletDescriptor[] {
		const externalViewletsToShow: ViewletDescriptor[] = [];
		this.enabledExternalViewlets.forEach(viewletId => {
			if (this.registeredViewlets[viewletId]) {
				externalViewletsToShow.push(this.registeredViewlets[viewletId]);
			}
		});
		return externalViewletsToShow;
	}

	private toAction(composite: ViewletDescriptor): ActivityAction {
		const action = this.instantiationService.createInstance(ViewletActivityAction, composite.id + '.activity-bar-action', composite);
		// Store the viewletId of the external viewlet that is about to open.
		// Later retrieved by TreeExplorerViewlet, which wouldn't know its id until
		// its construction at runtime.
		action.onOpenExternalViewlet((viewletId) => {
			this.externalViewletIdToOpen = viewletId;
		});

		this.activityActionItems[action.id] = new ActivityActionItem(action, composite.name, this.getKeybindingLabel(composite.id));
		this.compositeIdToActions[composite.id] = action;

		return action;
	};

	setExternalViewletIdToOpen(viewletId: string): void {
		this.externalViewletIdToOpen = viewletId;
	}

	getExternalViewletIdToOpen(): string {
		return this.externalViewletIdToOpen;
	}

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

	private _onOpenExternalViewlet = new Emitter<string>();
	public get onOpenExternalViewlet(): Event<string> { return this._onOpenExternalViewlet.event; };

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

		const sideBarHidden = this.partService.isSideBarHidden();
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (!sideBarHidden && activeViewlet && activeViewlet.getId() === this.viewlet.id) {
			this.partService.setSideBarHidden(true);
		} else {
			if (this.viewlet.isExternal) {
				this._onOpenExternalViewlet.fire(this.viewlet.id);
			}
			this.viewletService.openViewlet(this.viewlet.id, true).done(null, errors.onUnexpectedError);
			this.activate();
		}

		return TPromise.as(true);
	}
}
