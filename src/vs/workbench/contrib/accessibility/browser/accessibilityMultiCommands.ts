/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Command, MultiCommand } from 'vs/editor/browser/editorExtensions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { MenuId } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { accessibleViewIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';

function registerCommand<T extends Command>(command: T): T {
	command.register();
	return command;
}

export const AccessibilityHelpAction = registerCommand(new MultiCommand({
	id: 'editor.action.accessibilityHelp',
	precondition: undefined,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.F1,
		weight: KeybindingWeight.WorkbenchContrib,
		linux: {
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F1,
			secondary: [KeyMod.Alt | KeyCode.F1]
		}
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibilityHelp', "Open Accessibility Help"),
		order: 1
	}],
}));


export const AccessibleViewAction = registerCommand(new MultiCommand({
	id: 'editor.action.accessibleView',
	precondition: undefined,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.F2,
		weight: KeybindingWeight.WorkbenchContrib,
		linux: {
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F2,
			secondary: [KeyMod.Alt | KeyCode.F2]
		}
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibleView', "Open Accessible View"),
		order: 1
	}],
}));


export const AccessibleViewNextAction = registerCommand(new MultiCommand({
	id: 'editor.action.accessibleViewNext',
	precondition: accessibleViewIsShown,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.BracketRight,
		weight: KeybindingWeight.WorkbenchContrib
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibleViewNext', "Show Next in Accessible View"),
		order: 1
	}],
}));

export const AccessibleViewPreviousAction = registerCommand(new MultiCommand({
	id: 'editor.action.accessibleViewPrevious',
	precondition: accessibleViewIsShown,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.BracketLeft,
		weight: KeybindingWeight.WorkbenchContrib
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibleViewPrevious', "Show Previous in Accessible View"),
		order: 1
	}],
}));
