/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { HelpQuickAccessProvider } from 'vs/platform/quickinput/browser/helpQuickAccess';
import { ViewQuickAccessProvider } from 'vs/workbench/contrib/quickaccess/browser/viewQuickAccess';
import { QUICK_ACCESS_COMMAND_ID, quickAccessCommand } from 'vs/workbench/contrib/quickaccess/browser/quickAccessCommands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { CommandsQuickAccessProvider } from 'vs/workbench/contrib/quickaccess/browser/commandsQuickAccess';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

const registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

registry.registerQuickAccessProvider({
	ctor: HelpQuickAccessProvider,
	prefix: HelpQuickAccessProvider.PREFIX,
	placeholder: localize('helpQuickAccessPlaceholder', "Type '{0}' to get help on the actions you can take from here.", HelpQuickAccessProvider.PREFIX),
	helpEntries: [{ description: localize('helpQuickAccess', "Show all Quick Access Providers"), needsEditor: false }]
});

registry.registerQuickAccessProvider({
	ctor: ViewQuickAccessProvider,
	prefix: ViewQuickAccessProvider.PREFIX,
	placeholder: localize('viewQuickAccessPlaceholder', "Type the name of a view, output channel or terminal to open."),
	helpEntries: [{ description: localize('viewQuickAccess', "Open View"), needsEditor: false }]
});

registry.registerQuickAccessProvider({
	ctor: CommandsQuickAccessProvider,
	prefix: CommandsQuickAccessProvider.PREFIX,
	placeholder: localize('commandsQuickAccessPlaceholder', "Type the name of a command to run."),
	helpEntries: [{ description: localize('commandsQuickAccess', "Show and Run Commands"), needsEditor: false }]
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: QUICK_ACCESS_COMMAND_ID, title: {
			value: localize('openQuickAccess', "Open Quick Access"), original: 'Open Quick Access'
		},
		category: localize('quickAccess', "Quick Access")
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: QUICK_ACCESS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	handler: quickAccessCommand.handler
});
