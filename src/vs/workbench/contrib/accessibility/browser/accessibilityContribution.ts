/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { Command, MultiCommand } from 'vs/editor/browser/editorExtensions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { MenuId } from 'vs/platform/actions/common/actions';

export const enum AccessibilityVerbositySettingId {
	Terminal = 'accessibility.verbosity.terminal',
	DiffEditor = 'accessibility.verbosity.diffEditor',
	Chat = 'accessibility.verbosity.panelChat',
	InlineChat = 'accessibility.verbosity.inlineChat',
	KeybindingsEditor = 'accessibility.verbosity.keybindingsEditor',
	Notebook = 'accessibility.verbosity.notebook'
}

const baseProperty: object = {
	type: 'boolean',
	default: true,
	tags: ['accessibility']
};

const configuration: IConfigurationNode = {
	id: 'accessibility',
	title: localize('accessibilityConfigurationTitle', "Accessibility"),
	type: 'object',
	properties: {
		[AccessibilityVerbositySettingId.Terminal]: {
			description: localize('verbosity.terminal.description', 'Provide information about how to access the terminal accessibility help menu when the terminal is focused'),
			...baseProperty
		},
		[AccessibilityVerbositySettingId.DiffEditor]: {
			description: localize('verbosity.diffEditor.description', 'Provide information about how to navigate changes in the diff editor when it is focused'),
			...baseProperty
		},
		[AccessibilityVerbositySettingId.Chat]: {
			description: localize('verbosity.chat.description', 'Provide information about how to access the chat help menu when the chat input is focused'),
			...baseProperty
		},
		[AccessibilityVerbositySettingId.InlineChat]: {
			description: localize('verbosity.interactiveEditor.description', 'Provide information about how to access the inline editor chat accessibility help menu when the input is focused'),
			...baseProperty
		},
		[AccessibilityVerbositySettingId.KeybindingsEditor]: {
			description: localize('verbosity.keybindingsEditor.description', 'Provide information about how to change a keybinding in the keybindings editor when a row is focused'),
			...baseProperty
		},
		[AccessibilityVerbositySettingId.Notebook]: {
			description: localize('verbosity.notebook', 'Provide information about how to focus the cell container or inner editor when a notebook cell is focused.'),
			...baseProperty
		}
	}
};

export function registerAccessibilityConfiguration() {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration(configuration);
}

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
