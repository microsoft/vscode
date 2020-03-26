/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { inQuickOpenContext, getQuickNavigateHandler } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ShowAllCommandsAction, ClearCommandHistoryAction } from 'vs/workbench/contrib/quickaccess/browser/commandsQuickAccess';
import { GotoLineAction } from 'vs/workbench/contrib/codeEditor/browser/quickaccess/gotoLineQuickAccess';
import { GotoSymbolAction } from 'vs/workbench/contrib/codeEditor/browser/quickaccess/gotoSymbolQuickAccess';
import { OpenViewPickerAction, QuickOpenViewPickerAction } from 'vs/workbench/contrib/quickaccess/browser/viewQuickAccess';

// Register Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(SyncActionDescriptor.create(ClearCommandHistoryAction, ClearCommandHistoryAction.ID, ClearCommandHistoryAction.LABEL), 'Clear Command History');
registry.registerWorkbenchAction(SyncActionDescriptor.create(ShowAllCommandsAction, ShowAllCommandsAction.ID, ShowAllCommandsAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
	secondary: [KeyCode.F1]
}), 'Show All Commands');

registry.registerWorkbenchAction(SyncActionDescriptor.create(GotoLineAction, GotoLineAction.ID, GotoLineAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_G,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_G }
}), 'Go to Line/Column...');

registry.registerWorkbenchAction(SyncActionDescriptor.create(GotoSymbolAction, GotoSymbolAction.ID, GotoSymbolAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O
}), 'Go to Symbol in Editor...');

const inViewsPickerContextKey = 'inViewsPicker';
const inViewsPickerContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(inViewsPickerContextKey));

const viewPickerKeybinding = { primary: KeyMod.CtrlCmd | KeyCode.KEY_Q, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_Q }, linux: { primary: 0 } };

const viewCategory = nls.localize('view', "View");
registry.registerWorkbenchAction(SyncActionDescriptor.create(OpenViewPickerAction, OpenViewPickerAction.ID, OpenViewPickerAction.LABEL), 'View: Open View', viewCategory);
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenViewPickerAction, QuickOpenViewPickerAction.ID, QuickOpenViewPickerAction.LABEL, viewPickerKeybinding), 'View: Quick Open View', viewCategory);

const quickOpenNavigateNextInViewPickerId = 'workbench.action.quickOpenNavigateNextInViewPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInViewPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigateNextInViewPickerId, true),
	when: inViewsPickerContext,
	primary: viewPickerKeybinding.primary,
	linux: viewPickerKeybinding.linux,
	mac: viewPickerKeybinding.mac
});

const quickOpenNavigatePreviousInViewPickerId = 'workbench.action.quickOpenNavigatePreviousInViewPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInViewPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInViewPickerId, false),
	when: inViewsPickerContext,
	primary: viewPickerKeybinding.primary | KeyMod.Shift,
	linux: viewPickerKeybinding.linux,
	mac: {
		primary: viewPickerKeybinding.mac.primary | KeyMod.Shift
	}
});

// View menu

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '1_open',
	command: {
		id: ShowAllCommandsAction.ID,
		title: nls.localize({ key: 'miCommandPalette', comment: ['&& denotes a mnemonic'] }, "&&Command Palette...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '1_open',
	command: {
		id: OpenViewPickerAction.ID,
		title: nls.localize({ key: 'miOpenView', comment: ['&& denotes a mnemonic'] }, "&&Open View...")
	},
	order: 2
});

// Go to menu

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '4_symbol_nav',
	command: {
		id: 'workbench.action.gotoSymbol',
		title: nls.localize({ key: 'miGotoSymbolInEditor', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbol in Editor...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '5_infile_nav',
	command: {
		id: 'workbench.action.gotoLine',
		title: nls.localize({ key: 'miGotoLine', comment: ['&& denotes a mnemonic'] }, "Go to &&Line/Column...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	group: '1_command',
	command: {
		id: ShowAllCommandsAction.ID,
		title: nls.localize('commandPalette', "Command Palette...")
	},
	order: 1
});
