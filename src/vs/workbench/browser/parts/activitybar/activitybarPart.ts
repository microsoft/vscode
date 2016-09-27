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
import {IWorkbenchEditorConfiguration} from 'vs/workbench/common/editor';
import {ActionsOrientation, ActionBar, IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {Registry} from 'vs/platform/platform';
import {IComposite} from 'vs/workbench/common/composite';
import {IPanel} from 'vs/workbench/common/panel';
import {ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions, Viewlet} from 'vs/workbench/browser/viewlet';
import {CompositeDescriptor} from 'vs/workbench/browser/composite';
import {Panel, PanelRegistry, Extensions as PanelExtensions, PanelDescriptor} from 'vs/workbench/browser/panel';
import {Part} from 'vs/workbench/browser/part';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ActivityAction, ActivityActionItem} from 'vs/workbench/browser/parts/activitybar/activityAction';
import {TogglePanelAction} from 'vs/workbench/browser/parts/panel/panelPart';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IActivityService, IBadge} from 'vs/workbench/services/activity/common/activityService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';

export class ActivitybarPart extends Part implements IActivityService {
	public _serviceBrand: any;
	private viewletSwitcherBar: ActionBar;
	private panelSwitcherBar: ActionBar;
	private activityActionItems: { [actionId: string]: IActionItem; };
	private compositeIdToActions: { [compositeId: string]: ActivityAction; };
	private panelActions: ActivityAction[];
	private togglePanelAction: TogglePanelAction;

	constructor(
		id: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IConfigurationService protected configurationService: IConfigurationService
	) {
		super(id);

		this.activityActionItems = {};
		this.compositeIdToActions = {};

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate viewlet action on opening of a viewlet
		this.toUnbind.push(this.viewletService.onDidViewletOpen(viewlet => this.onActiveCompositeChanged(viewlet)));
		this.toUnbind.push(this.panelService.onDidPanelOpen(panel => this.onActivePanelChanged(panel)));

		// Deactivate viewlet action on close
		this.toUnbind.push(this.viewletService.onDidViewletClose(viewlet => this.onCompositeClosed(viewlet)));
		this.toUnbind.push(this.panelService.onDidPanelClose(panel => this.onPanelClosed(panel)));

		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));

	}

	private onConfigurationUpdated(config: IWorkbenchEditorConfiguration): void {
		if (this.panelSwitcherBar) {
			config.workbench.panels.showInSidebar ? this.panelSwitcherBar.getContainer().show() : this.panelSwitcherBar.getContainer().hide();
		}
	}

	private onActiveCompositeChanged(composite: IComposite): void {
		if (this.compositeIdToActions[composite.getId()]) {
			this.compositeIdToActions[composite.getId()].activate();
		}
	}

	private onActivePanelChanged(panel: IPanel): void {
		this.updatePanelSwitcher();
		this.onActiveCompositeChanged(panel);
	}

	private onCompositeClosed(composite: IComposite): void {
		if (this.compositeIdToActions[composite.getId()]) {
			this.compositeIdToActions[composite.getId()].deactivate();
		}
	}

	private onPanelClosed(panel: IPanel): void {
		this.updatePanelSwitcher();
		this.onCompositeClosed(panel);
	}

	public showActivity(compositeId: string, badge: IBadge, clazz?: string): void {
		const action = this.compositeIdToActions[compositeId];
		if (action) {
			if (action instanceof PanelActivityAction && this.partService.isPanelHidden()) {
				// while the panel badges are hidden we show the badge on the parent action which is visible
				this.togglePanelAction.setBadge(badge);
				return;
			}

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
		this.createPanelSwitcher($result.clone());

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

	private createPanelSwitcher(div: Builder): void {

		// Composite switcher is on top
		this.panelSwitcherBar = new ActionBar(div, {
			actionItemProvider: (action: Action) => this.activityActionItems[action.id],
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: nls.localize('activityBarPanelAriaLabel', "Active Panel Switcher")
		});
		this.panelSwitcherBar.getContainer().addClass('position-bottom');
		if (!this.configurationService.lookup('workbench.panels.showInSidebar').value) {
			this.panelSwitcherBar.getContainer().hide();
		}

		// Build Viewlet Actions in correct order

		const allPanels = (<PanelRegistry>Registry.as(PanelExtensions.Panels)).getPanels();

		this.togglePanelAction = this.instantiationService.createInstance(TogglePanelAction, TogglePanelAction.ID, TogglePanelAction.LABEL);
		this.activityActionItems[this.togglePanelAction.id] = new ActivityActionItem(this.togglePanelAction, TogglePanelAction.LABEL, this.getKeybindingLabel(TogglePanelAction.ID));
		this.panelActions = allPanels.sort((p1, p2) => p1.order - p2.order).map(panel => this.toAction(panel));

		// Add both viewlet and panel actions to the switcher
		this.updatePanelSwitcher();
	}

	private updatePanelSwitcher(): void {
		this.panelSwitcherBar.clear();
		this.togglePanelAction.class = this.partService.isPanelHidden() ? 'panel' : 'panel expanded';
		const actions: ActivityAction[] = [];
		if (!this.partService.isPanelHidden()) {
			actions.push(...this.panelActions);
		}
		actions.push(this.togglePanelAction);

		this.panelSwitcherBar.push(actions, { label: true, icon: true });

		// TODO@Isidor fix this aweful badge(r) hacks
		if (!this.partService.isPanelHidden()) {
			if (!this.panelActions[0].getBadge()) {
				this.panelActions[0].setBadge(this.togglePanelAction.getBadge());
			} else {
				this.panelActions[0].setBadge(this.panelActions[0].getBadge());
			}
			this.togglePanelAction.setBadge(null);
		} else {
			this.togglePanelAction.setBadge(this.panelActions[0].getBadge());
			if (this.panelActions[0].getBadge()) {
				this.panelActions[0].setBadge(null);
			}
		}
	}

	private toAction(composite: CompositeDescriptor<Viewlet | Panel>): ActivityAction {
		const activeViewlet = this.viewletService.getActiveViewlet();
		const activePanel = this.panelService.getActivePanel();
		const action = composite instanceof ViewletDescriptor ? this.instantiationService.createInstance(ViewletActivityAction, composite.id + '.activity-bar-action', composite)
			: this.instantiationService.createInstance(PanelActivityAction, (<PanelDescriptor>composite).id + '.activity-bar-action', composite);

		this.activityActionItems[action.id] = new ActivityActionItem(action, composite.name, this.getKeybindingLabel(composite.id));
		this.compositeIdToActions[composite.id] = action;

		// Mark active viewlet and panel action as active
		if (activeViewlet && activeViewlet.getId() === composite.id || activePanel && activePanel.getId() === composite.id) {
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

		if (this.panelSwitcherBar) {
			this.panelSwitcherBar.dispose();
			this.panelSwitcherBar = null;
		}

		if (this.togglePanelAction) {
			this.togglePanelAction.dispose();
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

class PanelActivityAction extends ActivityAction {

	constructor(
		id: string, private panel: PanelDescriptor,
		@IPanelService private panelService: IPanelService
	) {
		super(id, panel.name, panel.cssClass);
	}

	public run(): TPromise<any> {
		return this.panelService.openPanel(this.panel.id, true).then(() => this.activate());
	}
}
