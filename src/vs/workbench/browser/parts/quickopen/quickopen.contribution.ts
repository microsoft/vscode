/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IKeybindingService, IKeybindings } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
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

export class QuickOpenNavigateNextAction extends BaseQuickOpenNavigateAction {

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

export class QuickOpenNavigatePreviousAction extends BaseQuickOpenNavigateAction {

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

const condition = ContextKeyExpr.has('inQuickOpen');

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.closeQuickOpen',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: condition,
	primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape],
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.close();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.acceptSelectedQuickOpenItem',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: condition,
	primary: null,
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.accept();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.focusQuickOpen',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: condition,
	primary: null,
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.focus();
	}
});

function navigateKeybinding(shift: boolean): IKeybindings {
	if (!shift) {
		return {
			primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
			secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyCode.Tab, KeyMod.CtrlCmd | KeyCode.KEY_Q],
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
				secondary: [KeyMod.WinCtrl | KeyCode.Tab, KeyMod.WinCtrl | KeyCode.KEY_Q]
			}
		};
	}

	return {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Q],
		mac: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
			secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab, KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_Q]
		}
	};
}

const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);

registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalQuickOpenAction, GlobalQuickOpenAction.ID, GlobalQuickOpenAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E], mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: null } }), 'Go to File...');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigateNextAction, QuickOpenNavigateNextAction.ID, QuickOpenNavigateNextAction.LABEL, navigateKeybinding(false), condition, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Navigate Next in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigatePreviousAction, QuickOpenNavigatePreviousAction.ID, QuickOpenNavigatePreviousAction.LABEL, navigateKeybinding(true), condition, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Navigate Previous in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(RemoveFromEditorHistoryAction, RemoveFromEditorHistoryAction.ID, RemoveFromEditorHistoryAction.LABEL), 'Remove From History');