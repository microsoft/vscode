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

	private enabledExtViewlets: string[];
	private extViewlets: { [viewletId: string]: ViewletDescriptor; };

	// Serves two purposes:
	// 1. Expose the viewletId that will be assigned to an extension viewlet,
	//    which wouldn't know its viewletId until construction time.
	// 2. When workbench restores sidebar, if the last-opened viewlet is an extension viewlet,
	//    it'll set this value and defer restoration until all extensions are loaded.
	private _extViewletIdToOpen: string;
	public get extViewletIdToOpen() { return this._extViewletIdToOpen; };
	public set extViewletIdToOpen(viewletId: string) { this._extViewletIdToOpen = viewletId; };

	private static ENABLED_EXT_VIEWLETS = 'workbench.activityBar.enabledExtViewlets';

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

		const enabledExtViewletsJson = this.storageService.get(ActivitybarPart.ENABLED_EXT_VIEWLETS);
		this.enabledExtViewlets = enabledExtViewletsJson ? JSON.parse(enabledExtViewletsJson) : [];
		this.extViewlets = {};

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onActiveCompositeChanged(viewlet)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onCompositeClosed(viewlet)));

		// Update activity bar on registering extension viewlets
		this.extensionService.onReady().then(() => {
			const viewlets = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).getViewlets();
			this.onExtensionServiceReady(viewlets);
		});
	}

	private onExtensionServiceReady(viewlets: ViewletDescriptor[]): void {
		viewlets.forEach(v => {
			if (v.isExtension) {
				this.extViewlets[v.id] = v;
			}
		});

		this.viewletSwitcherBar.push(this.getAllEnabledExtViewlets().map(d => this.toAction(d)), { label: true, icon: true });
		if (this._extViewletIdToOpen) {
			this.compositeIdToActions[this._extViewletIdToOpen].run().done();
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

	public getInfoForExtViewlets(): {
		[viewletId: string]: {
			isEnabled: boolean;
			treeLabel: string;
		}
	} {
		const result = {};
		for (let viewletId in this.extViewlets) {
			result[viewletId] = {
				isEnabled: (this.enabledExtViewlets.indexOf(viewletId) !== -1),
				treeLabel: this.extViewlets[viewletId].name
			};
		}
		return result;
	}

	public toggleExtViewlet(viewletId: string): void {
		const index = this.enabledExtViewlets.indexOf(viewletId);
		if (index === -1) {
			this.enabledExtViewlets.push(viewletId);
		} else {
			this.enabledExtViewlets.splice(index, 1);
		}

		this.setEnabledExtViewlets();
		this.refreshViewletSwitcher();
	}

	private setEnabledExtViewlets(): void {
		this.storageService.store(ActivitybarPart.ENABLED_EXT_VIEWLETS, JSON.stringify(this.enabledExtViewlets));
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
		const allEnabledExtViewlets = this.getAllEnabledExtViewlets();
		this.fillViewletSwitcher(allStockViewlets.concat(allEnabledExtViewlets));
	}

	private fillViewletSwitcher(viewlets: ViewletDescriptor[]) {
		const viewletActions = viewlets.map(v => this.toAction(v));
		this.viewletSwitcherBar.push(viewletActions, { label: true, icon: true });
	}

	// Get an ordered list of all stock viewlets
	private getAllStockViewlets(): ViewletDescriptor[] {
		return (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets))
			.getViewlets()
			.filter(viewlet => !viewlet.isExtension)
			.sort((v1, v2) => v1.order - v2.order);
	}

	// Get a list of all enabled extension viewlets, ordered by the enabling sequence
	private getAllEnabledExtViewlets(): ViewletDescriptor[] {
		return this.enabledExtViewlets
			.filter(viewletId => this.extViewlets[viewletId])
			.map(viewletId => this.extViewlets[viewletId]);
	}

	private toAction(composite: ViewletDescriptor): ActivityAction {
		const action = this.instantiationService.createInstance(ViewletActivityAction, composite.id + '.activity-bar-action', composite);
		// Store the viewletId of the extension viewlet that is about to open.
		// Later retrieved by TreeExplorerViewlet, which wouldn't know its id until
		// its construction at runtime.
		action.onOpenExtViewlet((viewletId) => {
			this._extViewletIdToOpen = viewletId;
		});

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

	private _onOpenExtViewlet = new Emitter<string>();
	public get onOpenExtViewlet(): Event<string> { return this._onOpenExtViewlet.event; };

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
			if (this.viewlet.isExtension) {
				this._onOpenExtViewlet.fire(this.viewlet.id);
			}
			this.viewletService.openViewlet(this.viewlet.id, true).done(null, errors.onUnexpectedError);
			this.activate();
		}

		return TPromise.as(true);
	}
}
