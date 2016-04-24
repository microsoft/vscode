/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/terminal.contribution';
import nls = require('vs/nls');
//import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {TerminalService} from 'vs/workbench/parts/terminal/node/terminalService';
import {ToggleTerminalAction} from 'vs/workbench/parts/terminal/node/terminalActions';
import {ITerminalService, TERMINAL_PANEL_ID, TERMINAL_DEFAULT_SHELL_UNIX_LIKE, TERMINAL_DEFAULT_SHELL_WINDOWS} from 'vs/workbench/parts/terminal/common/terminal';
import * as panel from 'vs/workbench/browser/panel';
import {Registry} from 'vs/platform/platform';
import {Extensions, IConfigurationRegistry} from 'vs/platform/configuration/common/configurationRegistry';

let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'terminal',
	'order': 100,
	'title': nls.localize('integratedTerminalConfigurationTitle', "(Experimental) Integrated terminal configuration"),
	'type': 'object',
	'properties': {
		'terminal.integrated.shell.unixLike': {
			'description': nls.localize('terminal.integrated.shell.unixLike', "The path to the shell the terminal uses on Unix-like systems (Linux, OS X)."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_UNIX_LIKE
		},
		'terminal.integrated.shell.windows': {
			'description': nls.localize('terminal.integrated.shell.windows', "The path to the shell the terminal uses on Windows."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_WINDOWS
		}
	}
});

// Register Service
registerSingleton(ITerminalService, TerminalService);

// Register Output Panel
(<panel.PanelRegistry>Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/terminal/node/terminalPanel',
	'TerminalPanel',
	TERMINAL_PANEL_ID,
	nls.localize('terminal', "Terminal"),
	'terminal'
));

// register toggle output action globally
let actionRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
/*actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleTerminalAction, ToggleTerminalAction.ID, ToggleTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.US_BACKTICK
}), nls.localize('viewCategory', "View"));*/
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleTerminalAction, ToggleTerminalAction.ID, ToggleTerminalAction.LABEL), nls.localize('viewCategory', "View"), ['terminal', 'panel']);
