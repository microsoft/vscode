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
import {ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions, Viewlet} from 'vs/workbench/browser/viewlet';
import {CompositeDescriptor, Composite} from 'vs/workbench/browser/composite';
import {Panel} from 'vs/workbench/browser/panel';
import {Part} from 'vs/workbench/browser/part';
import {ActivityAction, ActivityActionItem} from 'vs/workbench/browser/parts/activitybar/activityAction';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IActivityService, IBadge} from 'vs/workbench/services/activity/common/activityService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';

export class ActivitybarPart extends Part implements IActivityService {
	public _serviceBrand: any;
	private compositeSwitcherBar: ActionBar;
	private globalToolBar: ToolBar;
	private activityActionItems: { [actionId: string]: IActionItem; };
	private compositeIdToActions: { [compositeId: string]: ActivityAction; };

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id);

		this.activityActionItems = {};
		this.compositeIdToActions = {};

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onActiveViewletChanged(viewlet)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onViewletClosed(viewlet)));
	}

	private onActiveViewletChanged(viewlet: IViewlet): void {
		if (this.compositeIdToActions[viewlet.getId()]) {
			this.compositeIdToActions[viewlet.getId()].activate();

			// There can only be one active viewlet action
			for (let key in this.compositeIdToActions) {
				if (this.compositeIdToActions.hasOwnProperty(key) && key !== viewlet.getId() && this.compositeIdToActions[key] instanceof ViewletActivityAction) {
					this.compositeIdToActions[key].deactivate();
				}
			}
		}
	}

	private onViewletClosed(viewlet: IViewlet): void {
		if (this.compositeIdToActions[viewlet.getId()]) {
			this.compositeIdToActions[viewlet.getId()].deactivate();
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
		this.createCompositeSwitcher($result.clone());

		return $result;
	}

	private createCompositeSwitcher(div: Builder): void {

		// Composite switcher is on top
		this.compositeSwitcherBar = new ActionBar(div, {
			actionItemProvider: (action: Action) => this.activityActionItems[action.id],
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('activityBarAriaLabel', "Active View Switcher")
		});
		this.compositeSwitcherBar.getContainer().addClass('position-top');

		// Build Viewlet Actions in correct order
		const activeViewlet = this.viewletService.getActiveViewlet();
		const activePanel = this.panelService.getActivePanel();
		const registry = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets));
		const allViewletActions = registry.getViewlets();
		const actionOptions = { label: true, icon: true };

		const toAction = (composite: CompositeDescriptor<Viewlet | Panel>) => {
			const action = composite instanceof ViewletDescriptor ? this.instantiationService.createInstance(ViewletActivityAction, composite.id + '.activity-bar-action', composite)
				: this.instantiationService.createInstance(PanelActivityAction, composite.id + '.activity-bar-action', composite);

			let keybinding: string = null;
			const keys = this.keybindingService.lookupKeybindings(composite.id).map(k => this.keybindingService.getLabelFor(k));
			if (keys && keys.length) {
				keybinding = keys[0];
			}

			this.activityActionItems[action.id] = new ActivityActionItem(action, composite.name, keybinding);
			this.compositeIdToActions[composite.id] = action;

			// Mark active viewlet and panel action as active
			if (activeViewlet && activeViewlet.getId() === composite.id || activePanel && activePanel.getId() === composite.id) {
				action.activate();
			}

			return action;
		};

		// Add to viewlet switcher
		this.compositeSwitcherBar.push(allViewletActions
			.filter(v => !v.isGlobal)
			.sort((v1, v2) => v1.order - v2.order)
			.map(toAction)
			, actionOptions);
	}

	public dispose(): void {
		if (this.compositeSwitcherBar) {
			this.compositeSwitcherBar.dispose();
			this.compositeSwitcherBar = null;
		}

		if (this.globalToolBar) {
			this.globalToolBar.dispose();
			this.globalToolBar = null;
		}

		super.dispose();
	}
}

abstract class CompositeActivityAction<T extends Composite> extends ActivityAction {
	private static preventDoubleClickDelay = 300;
	private lastRun: number = 0;

	protected composite: CompositeDescriptor<T>;

	constructor(
		id: string, composite: CompositeDescriptor<T>,
		@IViewletService protected viewletService: IViewletService,
		@IPanelService protected panelService: IPanelService,
		@IPartService protected partService: IPartService
	) {
		super(id, composite.name, composite.cssClass);

		this.composite = composite;
	}

	public run(): TPromise<any> {

		// prevent accident trigger on a doubleclick (to help nervous people)
		const now = Date.now();
		if (now - this.lastRun < CompositeActivityAction.preventDoubleClickDelay) {
			return TPromise.as(true);
		}
		this.lastRun = now;

		this.toggleComposite();

		return TPromise.as(true);
	}

	protected abstract toggleComposite(): void;
}

class ViewletActivityAction extends CompositeActivityAction<Viewlet> {

	protected toggleComposite(): void {
		const sideBarHidden = this.partService.isSideBarHidden();
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (!sideBarHidden && activeViewlet && activeViewlet.getId() === this.composite.id) {
			this.partService.setSideBarHidden(true);
		} else {
			this.viewletService.openViewlet(this.composite.id, true).done(null, errors.onUnexpectedError);
			this.activate();
		}
	}
}

class PanelActivityAction extends CompositeActivityAction<Panel> {

	protected toggleComposite(): void {

		const panelHidden = this.partService.isPanelHidden();
		const activePanel = this.panelService.getActivePanel();

		// Hide panel if selected panel already visible
		if (!panelHidden && activePanel && activePanel.getId() === this.composite.id) {
			this.partService.setPanelHidden(true);
		} else {
			this.panelService.openPanel(this.composite.id, true).done(null, errors.onUnexpectedError);
			this.activate();
		}
	}
}
