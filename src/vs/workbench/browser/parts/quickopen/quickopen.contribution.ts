/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { RemoveFromEditorHistoryAction } from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import { QuickOpenSelectNextAction, QuickOpenSelectPreviousAction, inQuickOpenContext, getQuickNavigateHandler, QuickOpenNavigateNextAction, QuickOpenNavigatePreviousAction, defaultQuickOpenContext, QUICKOPEN_ACTION_ID, QUICKOPEN_ACION_LABEL } from 'vs/workbench/browser/parts/quickopen/quickopen';

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

const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);

const globalQuickOpenKeybinding = { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E], mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: null } };

KeybindingsRegistry.registerKeybindingRule({
	id: QUICKOPEN_ACTION_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: undefined,
	primary: globalQuickOpenKeybinding.primary,
	secondary: globalQuickOpenKeybinding.secondary,
	mac: globalQuickOpenKeybinding.mac
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: { id: QUICKOPEN_ACTION_ID, title: QUICKOPEN_ACION_LABEL }
});

registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenSelectNextAction, QuickOpenSelectNextAction.ID, QuickOpenSelectNextAction.LABEL, { primary: null, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_N } }, inQuickOpenContext, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Select Next in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenSelectPreviousAction, QuickOpenSelectPreviousAction.ID, QuickOpenSelectPreviousAction.LABEL, { primary: null, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_P } }, inQuickOpenContext, KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Select Previous in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigateNextAction, QuickOpenNavigateNextAction.ID, QuickOpenNavigateNextAction.LABEL), 'Navigate Next in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigatePreviousAction, QuickOpenNavigatePreviousAction.ID, QuickOpenNavigatePreviousAction.LABEL), 'Navigate Previous in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(RemoveFromEditorHistoryAction, RemoveFromEditorHistoryAction.ID, RemoveFromEditorHistoryAction.LABEL), 'Remove From History');

const quickOpenNavigateNextInFilePickerId = 'workbench.action.quickOpenNavigateNextInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInFilePickerId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigateNextInFilePickerId, true),
	when: defaultQuickOpenContext,
	primary: globalQuickOpenKeybinding.primary,
	secondary: globalQuickOpenKeybinding.secondary,
	mac: globalQuickOpenKeybinding.mac
});

const quickOpenNavigatePreviousInFilePickerId = 'workbench.action.quickOpenNavigatePreviousInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInFilePickerId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInFilePickerId, false),
	when: defaultQuickOpenContext,
	primary: globalQuickOpenKeybinding.primary | KeyMod.Shift,
	secondary: [globalQuickOpenKeybinding.secondary[0] | KeyMod.Shift],
	mac: {
		primary: globalQuickOpenKeybinding.mac.primary | KeyMod.Shift,
		secondary: null
	}
});