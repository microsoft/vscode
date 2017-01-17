/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Action } from 'vs/base/common/actions';
import { Registry } from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/actionRegistry';
import { IPanelService, IPanelIdentifier } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';

export class PanelAction extends Action {

	constructor(
		private panel: IPanelIdentifier,
		@IPanelService private panelService: IPanelService
	) {
		super(panel.id, panel.name);
	}

	public run(event): TPromise<any> {
		return this.panelService.openPanel(this.panel.id, true).then(() => this.activate());
	}

	public activate(): void {
		if (!this.checked) {
			this._setChecked(true);
		}
	}

	public deactivate(): void {
		if (this.checked) {
			this._setChecked(false);
		}
	}
}

export class ClosePanelAction extends Action {
	static ID = 'workbench.action.closePanel';
	static LABEL = nls.localize('closePanel', "Close Panel");

	constructor(
		id: string,
		name: string,
		@IPartService private partService: IPartService
	) {
		super(id, name, 'hide-panel-action');
	}

	public run(): TPromise<any> {
		return this.partService.setPanelHidden(true);
	}
}

export class TogglePanelAction extends Action {
	static ID = 'workbench.action.togglePanel';
	static LABEL = nls.localize('togglePanel', "Toggle Panel");

	constructor(
		id: string,
		name: string,
		@IPartService private partService: IPartService
	) {
		super(id, name, partService.isVisible(Parts.PANEL_PART) ? 'panel expanded' : 'panel');
	}

	public run(): TPromise<any> {
		return this.partService.setPanelHidden(this.partService.isVisible(Parts.PANEL_PART));
	}
}

class FocusPanelAction extends Action {

	public static ID = 'workbench.action.focusPanel';
	public static LABEL = nls.localize('focusPanel', "Focus into Panel");

	constructor(
		id: string,
		label: string,
		@IPanelService private panelService: IPanelService,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Show panel
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			return this.partService.setPanelHidden(false);
		}

		// Focus into active panel
		let panel = this.panelService.getActivePanel();
		if (panel) {
			panel.focus();
		}
		return TPromise.as(true);
	}
}

class ToggleMaximizedPanelAction extends Action {

	public static ID = 'workbench.action.toggleMaximizedPanel';
	public static LABEL = nls.localize('toggleMaximizedPanel', "Toggle Maximized Panel");

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		// Show panel
		return this.partService.setPanelHidden(false)
			.then(() => this.partService.toggleMaximizedPanel());
	}
}

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(TogglePanelAction, TogglePanelAction.ID, TogglePanelAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_J }), 'View: Toggle Panel Visibility', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusPanelAction, FocusPanelAction.ID, FocusPanelAction.LABEL), 'View: Focus into Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMaximizedPanelAction, ToggleMaximizedPanelAction.ID, ToggleMaximizedPanelAction.LABEL), 'View: Toggle Maximized Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL), 'View: Close Panel', nls.localize('view', "View"));