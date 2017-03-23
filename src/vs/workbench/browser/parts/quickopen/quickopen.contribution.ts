/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { KeybindingsRegistry, IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { RemoveFromEditorHistoryAction } from 'vs/workbench/browser/parts/quickopen/quickOpenController';

export class GlobalQuickOpenAction extends Action {

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

export class BaseQuickOpenNavigateAction extends Action {

	constructor(
		id: string,
		label: string,
		private next: boolean,
		private quickNavigate: boolean,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);
		const quickNavigate = this.quickNavigate ? { keybindings: keys } : void 0;

		this.quickOpenService.navigate(this.next, quickNavigate);

		return TPromise.as(true);
	}
}

export class QuickOpenNavigateNextAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenNavigateNext';
	public static LABEL = nls.localize('quickNavigateNext', "Navigate Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, true, quickOpenService, keybindingService);
	}
}

export class QuickOpenNavigatePreviousAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenNavigatePrevious';
	public static LABEL = nls.localize('quickNavigatePrevious', "Navigate Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, true, quickOpenService, keybindingService);
	}
}

export class QuickOpenSelectNextAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenSelectNext';
	public static LABEL = nls.localize('quickSelectNext', "Select Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, false, quickOpenService, keybindingService);
	}
}

export class QuickOpenSelectPreviousAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenSelectPrevious';
	public static LABEL = nls.localize('quickSelectPrevious', "Select Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, false, quickOpenService, keybindingService);
	}
}

const inQuickOpenContext = ContextKeyExpr.has('inQuickOpen');

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.closeQuickOpen',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: inQuickOpenContext,
	primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape],
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.close();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.acceptSelectedQuickOpenItem',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: inQuickOpenContext,
	primary: null,
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.accept();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.focusQuickOpen',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: inQuickOpenContext,
	primary: null,
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.focus();
	}
});

function navigateKeybinding(shift: boolean): IKeybindings {
	if (!shift) {
		return {
			primary: KeyMod.CtrlCmd | KeyCode.Tab,
			secondary: [KeyMod.CtrlCmd | KeyCode.KEY_Q, KeyMod.CtrlCmd | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyCode.KEY_P],
			mac: {
				primary: KeyMod.WinCtrl | KeyCode.Tab,
				secondary: [KeyMod.WinCtrl | KeyCode.KEY_Q, KeyMod.CtrlCmd | KeyCode.KEY_P]
			},
			linux: {
				primary: KeyMod.CtrlCmd | KeyCode.Tab,
				secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyCode.KEY_P]
			}
		};
	}

	return {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Q, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P],
		mac: {
			primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab,
			secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_Q, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P]
		},
		linux: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P]
		}
	};
}

const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);

registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalQuickOpenAction, GlobalQuickOpenAction.ID, GlobalQuickOpenAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E], mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: null } }), 'Go to File...');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigateNextAction, QuickOpenNavigateNextAction.ID, QuickOpenNavigateNextAction.LABEL, navigateKeybinding(false), inQuickOpenContext, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Navigate Next in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigatePreviousAction, QuickOpenNavigatePreviousAction.ID, QuickOpenNavigatePreviousAction.LABEL, navigateKeybinding(true), inQuickOpenContext, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Navigate Previous in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenSelectNextAction, QuickOpenSelectNextAction.ID, QuickOpenSelectNextAction.LABEL, { primary: null, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_N } }, inQuickOpenContext, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Select Next in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenSelectPreviousAction, QuickOpenSelectPreviousAction.ID, QuickOpenSelectPreviousAction.LABEL, { primary: null, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_P } }, inQuickOpenContext, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Select Previous in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(RemoveFromEditorHistoryAction, RemoveFromEditorHistoryAction.ID, RemoveFromEditorHistoryAction.LABEL), 'Remove From History');
