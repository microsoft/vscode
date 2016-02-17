/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {Registry} from 'vs/platform/platform';
import {Action} from 'vs/base/common/actions';
import {TPromise} from 'vs/base/common/winjs.base';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {KbExpr, IKeybindingService, IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

// Trigger Quick Open
class GlobalQuickOpenAction extends Action {

	public static ID = 'workbench.action.quickOpen';
	public static LABEL = nls.localize('quickOpen', "Go to File...");

	constructor(id: string, label: string, @IQuickOpenService private quickOpenService: IQuickOpenService) {
		super(id, label);

		this.order = 100; // Allow other actions to position before or after
		this.class = 'quickopen';
	}

	public run(): TPromise<any> {
		this.quickOpenService.show(null);

		return TPromise.as(true);
	}
}

// Open Previous Editor
class OpenPreviousEditorAction extends Action {

	public static ID = 'workbench.action.openPreviousEditor';
	public static LABEL = nls.localize('navigateEditorHistoryByInput', "Navigate History");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.show(null, {
			keybindings: keys
		});

		return TPromise.as(true);
	}
}

class BaseQuickOpenNavigateAction extends Action {
	private navigateNext: boolean;

	constructor(
		id: string,
		label: string,
		navigateNext: boolean,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);

		this.navigateNext = navigateNext;
	}

	public run(event?: any): TPromise<any> {
		let keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.quickNavigate({
			keybindings: keys
		}, this.navigateNext);

		return TPromise.as(true);
	}
}

class QuickOpenNavigateNextAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenNavigateNext';
	public static LABEL = nls.localize('quickNavigateNext', "Navigate Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, quickOpenService, keybindingService);
	}
}

class QuickOpenNavigatePreviousAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenNavigatePrevious';
	public static LABEL = nls.localize('quickNavigatePrevious', "Navigate Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, quickOpenService, keybindingService);
	}
}

const quickOpenKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
	secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E]
};

const QUICK_NAVIGATE_KEY = KeyCode.Tab;

const prevEditorKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | QUICK_NAVIGATE_KEY,
	secondary: [KeyMod.CtrlCmd | KeyMod.Shift | QUICK_NAVIGATE_KEY],
	mac: {
		primary: KeyMod.WinCtrl | QUICK_NAVIGATE_KEY,
		secondary: [KeyMod.WinCtrl | KeyMod.Shift | QUICK_NAVIGATE_KEY]
	}
};

function navigateKeybinding(shift: boolean): IKeybindings {
	if (shift) {
		return {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyMod.Shift | QUICK_NAVIGATE_KEY],
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E, KeyMod.WinCtrl | KeyMod.Shift | QUICK_NAVIGATE_KEY]
			}
		};
	} else {
		return {
			primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
			secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E, KeyMod.CtrlCmd | QUICK_NAVIGATE_KEY],
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
				secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E, KeyMod.WinCtrl | QUICK_NAVIGATE_KEY]
			}
		};
	}
}

// Contribute Quick Open
let registry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalQuickOpenAction, GlobalQuickOpenAction.ID, GlobalQuickOpenAction.LABEL, quickOpenKb));

// Contribute Quick Navigate
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditorAction, OpenPreviousEditorAction.ID, OpenPreviousEditorAction.LABEL, prevEditorKb));

// Contribute Quick Navigate in Quick Open
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigateNextAction, QuickOpenNavigateNextAction.ID, QuickOpenNavigateNextAction.LABEL, navigateKeybinding(false), KbExpr.has('inQuickOpen')));
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigatePreviousAction, QuickOpenNavigatePreviousAction.ID, QuickOpenNavigatePreviousAction.LABEL, navigateKeybinding(true), KbExpr.has('inQuickOpen'), KeybindingsRegistry.WEIGHT.workbenchContrib(50)));