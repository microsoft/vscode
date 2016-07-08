/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {KeyMod, KeyCode, CommonKeybindings} from 'vs/base/common/keyCodes';
import {Action, IAction} from 'vs/base/common/actions';
import {Builder} from 'vs/base/browser/builder';
import dom = require('vs/base/browser/dom');
import {Registry} from 'vs/platform/platform';
import {Scope} from 'vs/workbench/browser/actionBarRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/actionRegistry';
import {IPanel} from 'vs/workbench/common/panel';
import {CompositePart} from 'vs/workbench/browser/parts/compositePart';
import {Panel, PanelRegistry, Extensions as PanelExtensions} from 'vs/workbench/browser/panel';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

export class PanelPart extends CompositePart<Panel> implements IPanelService {

	public static activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	public _serviceBrand: any;
	private blockOpeningPanel: boolean;

	constructor(
		id: string,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@IEventService eventService: IEventService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPartService partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(
			messageService,
			storageService,
			eventService,
			telemetryService,
			contextMenuService,
			partService,
			keybindingService,
			instantiationService,
			(<PanelRegistry>Registry.as(PanelExtensions.Panels)),
			PanelPart.activePanelSettingsKey,
			'panel',
			'panel',
			Scope.PANEL,
			id
		);
	}

	public create(parent: Builder): void {
		super.create(parent);

		dom.addStandardDisposableListener(this.getContainer().getHTMLElement(), 'keyup', (e: IKeyboardEvent) => {
			if (e.equals(CommonKeybindings.ESCAPE)) {
				this.partService.setPanelHidden(true);
				e.preventDefault();
			}
		});
	}

	public openPanel(id: string, focus?: boolean): TPromise<Panel> {
		if (this.blockOpeningPanel) {
			return TPromise.as(null); // Workaround against a potential race condition
		}

		// First check if panel is hidden and show if so
		if (this.partService.isPanelHidden()) {
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
		return this.hideActiveComposite();
	}
}


class ClosePanelAction extends Action {
	static ID = 'workbench.action.closePanel';
	static LABEL = nls.localize('closePanel', "Close");

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

class TogglePanelAction extends Action {
	static ID = 'workbench.action.togglePanel';
	static LABEL = nls.localize('togglePanel', "Toggle Panel Visibility");

	constructor(
		id: string,
		name: string,
		@IPartService private partService: IPartService
	) {
		super(id, name, null);
	}

	public run(): TPromise<boolean> {
		this.partService.setPanelHidden(!this.partService.isPanelHidden());
		return TPromise.as(true);
	}
}

let actionRegistry = <IWorkbenchActionRegistry>Registry.as(WorkbenchExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(TogglePanelAction, TogglePanelAction.ID, TogglePanelAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_J }), 'View: Toggle Panel Visibility', nls.localize('view', "View"));
