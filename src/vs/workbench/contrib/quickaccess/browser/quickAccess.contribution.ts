/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { HelpQuickAccessProvider } from 'vs/platform/quickinput/browser/helpQuickAccess';
import { ViewQuickAccessProvider, VIEW_QUICK_ACCESS_PREFIX } from 'vs/workbench/contrib/quickaccess/browser/viewQuickAccess';
import { QUICK_ACCESS_COMMAND_ID } from 'vs/workbench/contrib/quickaccess/browser/quickAccessCommands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

const registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

registry.defaultProvider = {
	ctor: HelpQuickAccessProvider,
	prefix: '',
	placeholder: localize('helpQuickAccessPlaceholder', "Type '?' to get help on the actions you can take from here."),
	helpEntries: [{ description: localize('gotoFileQuickAccess', "Go to File"), needsEditor: false }]
};

registry.registerQuickAccessProvider({
	ctor: HelpQuickAccessProvider,
	prefix: '?',
	placeholder: localize('helpQuickAccessPlaceholder', "Type '?' to get help on the actions you can take from here."),
	helpEntries: [{ description: localize('helpQuickAccess', "Show all Quick Access Providers"), needsEditor: false }]
});

registry.registerQuickAccessProvider({
	ctor: ViewQuickAccessProvider,
	prefix: VIEW_QUICK_ACCESS_PREFIX,
	placeholder: localize('viewQuickAccessPlaceholder', "Type the name of a view, output channel or terminal to open."),
	helpEntries: [{ description: localize('viewQuickAccess', "Open View"), needsEditor: false }]
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: QUICK_ACCESS_COMMAND_ID, title: {
			value: localize('openQuickAccess', "Open Quick Access"), original: 'Open Quick Access'
		},
		category: localize('quickAccess', "Quick Access")
	}
});
