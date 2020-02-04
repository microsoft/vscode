/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { RemoveFromEditorHistoryAction } from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import { QuickOpenSelectNextAction, QuickOpenSelectPreviousAction, inQuickOpenContext, getQuickNavigateHandler, QuickOpenNavigateNextAction, QuickOpenNavigatePreviousAction, defaultQuickOpenContext, QUICKOPEN_ACTION_ID, QUICKOPEN_ACION_LABEL } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.closeQuickOpen',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape],
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.close();
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.cancel();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.acceptSelectedQuickOpenItem',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.accept();
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.accept();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.focusQuickOpen',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.focus();
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.focus();
	}
});

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

const globalQuickOpenKeybinding = { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E], mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: undefined } };

KeybindingsRegistry.registerKeybindingRule({
	id: QUICKOPEN_ACTION_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: globalQuickOpenKeybinding.primary,
	secondary: globalQuickOpenKeybinding.secondary,
	mac: globalQuickOpenKeybinding.mac
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: { id: QUICKOPEN_ACTION_ID, title: { value: QUICKOPEN_ACION_LABEL, original: 'Go to File...' } }
});

registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenSelectNextAction, QuickOpenSelectNextAction.ID, QuickOpenSelectNextAction.LABEL, { primary: 0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_N } }, inQuickOpenContext, KeybindingWeight.WorkbenchContrib + 50), 'Select Next in Quick Open');
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenSelectPreviousAction, QuickOpenSelectPreviousAction.ID, QuickOpenSelectPreviousAction.LABEL, { primary: 0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_P } }, inQuickOpenContext, KeybindingWeight.WorkbenchContrib + 50), 'Select Previous in Quick Open');
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenNavigateNextAction, QuickOpenNavigateNextAction.ID, QuickOpenNavigateNextAction.LABEL), 'Navigate Next in Quick Open');
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenNavigatePreviousAction, QuickOpenNavigatePreviousAction.ID, QuickOpenNavigatePreviousAction.LABEL), 'Navigate Previous in Quick Open');
registry.registerWorkbenchAction(SyncActionDescriptor.create(RemoveFromEditorHistoryAction, RemoveFromEditorHistoryAction.ID, RemoveFromEditorHistoryAction.LABEL), 'Remove From History');

const quickOpenNavigateNextInFilePickerId = 'workbench.action.quickOpenNavigateNextInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigateNextInFilePickerId, true),
	when: defaultQuickOpenContext,
	primary: globalQuickOpenKeybinding.primary,
	secondary: globalQuickOpenKeybinding.secondary,
	mac: globalQuickOpenKeybinding.mac
});

const quickOpenNavigatePreviousInFilePickerId = 'workbench.action.quickOpenNavigatePreviousInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInFilePickerId, false),
	when: defaultQuickOpenContext,
	primary: globalQuickOpenKeybinding.primary | KeyMod.Shift,
	secondary: [globalQuickOpenKeybinding.secondary[0] | KeyMod.Shift],
	mac: {
		primary: globalQuickOpenKeybinding.mac.primary | KeyMod.Shift,
		secondary: undefined
	}
});
