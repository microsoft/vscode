/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Action, IAction } from 'vs/base/common/actions';
import Event from 'vs/base/common/event';
import { Builder } from 'vs/base/browser/builder';
import { Registry } from 'vs/platform/platform';
import { ActivityAction } from 'vs/workbench/browser/parts/activitybar/activityAction';
import { Scope } from 'vs/workbench/browser/actionBarRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/actionRegistry';
import { IPanel } from 'vs/workbench/common/panel';
import { CompositePart } from 'vs/workbench/browser/parts/compositePart';
import { Panel, PanelRegistry, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class PanelPart extends CompositePart<Panel> implements IPanelService {

	public static activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	public _serviceBrand: any;

	private blockOpeningPanel: boolean;

	constructor(
		id: string,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPartService partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(
			messageService,
			storageService,
			telemetryService,
			contextMenuService,
			partService,
			keybindingService,
			instantiationService,
			Registry.as<PanelRegistry>(PanelExtensions.Panels),
			PanelPart.activePanelSettingsKey,
			'panel',
			'panel',
			Scope.PANEL,
			id
		);
	}

	public get onDidPanelOpen(): Event<IPanel> {
		return this._onDidCompositeOpen.event;
	}

	public get onDidPanelClose(): Event<IPanel> {
		return this._onDidCompositeClose.event;
	}

	public create(parent: Builder): void {
		super.create(parent);
	}

	public openPanel(id: string, focus?: boolean): TPromise<Panel> {
		if (this.blockOpeningPanel) {
			return TPromise.as(null); // Workaround against a potential race condition
		}

		// First check if panel is hidden and show if so
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			try {
				this.blockOpeningPanel = true;
				this.partService.setPanelHidden(false);
			} finally {
				this.blockOpeningPanel = false;
			}
		}

		return this.openComposite(id, focus);
	}

	protected getActions(): IAction[] {
		return [this.instantiationService.createInstance(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL)];
	}

	public getActivePanel(): IPanel {
		return this.getActiveComposite();
	}

	public getLastActivePanelId(): string {
		return this.getLastActiveCompositetId();
	}

	public hideActivePanel(): TPromise<void> {
		return this.hideActiveComposite().then(composite => void 0);
	}
}


class ClosePanelAction extends Action {
	static ID = 'workbench.action.closePanel';
	static LABEL = nls.localize('closePanel', "Close Panel");

	constructor(
		id: string,
		name: string,
		@IPartService private partService: IPartService
	) {
		super(id, name, 'hide-panel-action');
	}

	public run(): TPromise<boolean> {
		this.partService.setPanelHidden(true);
		return TPromise.as(true);
	}
}

export class TogglePanelAction extends ActivityAction {
	static ID = 'workbench.action.togglePanel';
	static LABEL = nls.localize('togglePanel', "Toggle Panel");

	constructor(
		id: string,
		name: string,
		@IPartService private partService: IPartService
	) {
		super(id, name, partService.isVisible(Parts.PANEL_PART) ? 'panel expanded' : 'panel');
	}

	public run(): TPromise<boolean> {
		this.partService.setPanelHidden(this.partService.isVisible(Parts.PANEL_PART));
		return TPromise.as(true);
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

	public run(): TPromise<boolean> {

		// Show panel
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			this.partService.setPanelHidden(false);
		}

		// Focus into active panel
		else {
			let panel = this.panelService.getActivePanel();
			if (panel) {
				panel.focus();
			}
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

	public run(): TPromise<boolean> {
		// Show panel
		this.partService.setPanelHidden(false);
		this.partService.toggleMaximizedPanel();

		return TPromise.as(true);
	}
}

let actionRegistry = <IWorkbenchActionRegistry>Registry.as(WorkbenchExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(TogglePanelAction, TogglePanelAction.ID, TogglePanelAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_J }), 'View: Toggle Panel Visibility', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusPanelAction, FocusPanelAction.ID, FocusPanelAction.LABEL), 'View: Focus into Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMaximizedPanelAction, ToggleMaximizedPanelAction.ID, ToggleMaximizedPanelAction.LABEL), 'View: Toggle Maximized Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL), 'View: Close Panel', nls.localize('view', "View"));
