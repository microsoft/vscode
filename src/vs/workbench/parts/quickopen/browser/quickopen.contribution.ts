/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import env = require('vs/base/common/platform');
import nls = require('vs/nls');
import {QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions} from 'vs/workbench/browser/quickopen';
import {Registry} from 'vs/platform/platform';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {GotoSymbolAction, GOTO_SYMBOL_PREFIX, SCOPE_PREFIX} from 'vs/workbench/parts/quickopen/browser/gotoSymbolHandler';
import {ShowAllCommandsAction, ALL_COMMANDS_PREFIX} from 'vs/workbench/parts/quickopen/browser/commandsHandler';
import {GotoLineAction, GOTO_LINE_PREFIX} from 'vs/workbench/parts/quickopen/browser/gotoLineHandler';
import {HELP_PREFIX} from 'vs/workbench/parts/quickopen/browser/helpHandler';

// Register Actions
let registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllCommandsAction, ShowAllCommandsAction.ID, ShowAllCommandsAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
	secondary: [KeyCode.F1]
}), 'Show All Commands');

registry.registerWorkbenchAction(new SyncActionDescriptor(GotoLineAction, GotoLineAction.ID, GotoLineAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_G,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_G }
}), 'Go to Line...');

registry.registerWorkbenchAction(new SyncActionDescriptor(GotoSymbolAction, GotoSymbolAction.ID, GotoSymbolAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O
}), 'Go to Symbol...');

// Register Quick Open Handler

(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/quickopen/browser/commandsHandler',
		'CommandsHandler',
		ALL_COMMANDS_PREFIX,
		nls.localize('commandsHandlerDescriptionDefault', "Show and Run Commands")
	)
);

(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/quickopen/browser/gotoLineHandler',
		'GotoLineHandler',
		GOTO_LINE_PREFIX,
		[
			{
				prefix: GOTO_LINE_PREFIX,
				needsEditor: true,
				description: env.isMacintosh ? nls.localize('gotoLineDescriptionMac', "Go to Line") : nls.localize('gotoLineDescriptionWin', "Go to Line")
			},
		]
	)
);

(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/quickopen/browser/gotoSymbolHandler',
		'GotoSymbolHandler',
		GOTO_SYMBOL_PREFIX,
		[
			{
				prefix: GOTO_SYMBOL_PREFIX,
				needsEditor: true,
				description: nls.localize('gotoSymbolDescription', "Go to Symbol in File")
			},
			{
				prefix: GOTO_SYMBOL_PREFIX + SCOPE_PREFIX,
				needsEditor: true,
				description: nls.localize('gotoSymbolDescriptionScoped', "Go to Symbol in File by Category")
			}
		]
	)
);

(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/quickopen/browser/helpHandler',
		'HelpHandler',
		HELP_PREFIX,
		nls.localize('helpDescription', "Show Help")
	)
);