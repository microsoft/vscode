/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/terminal.contribution';
import nls = require('vs/nls');
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {TerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminalService';
import {ToggleTerminalAction} from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import {ITerminalService, TERMINAL_PANEL_ID, TERMINAL_DEFAULT_SHELL_LINUX, TERMINAL_DEFAULT_SHELL_OSX, TERMINAL_DEFAULT_SHELL_WINDOWS} from 'vs/workbench/parts/terminal/common/terminal';
import * as panel from 'vs/workbench/browser/panel';
import {Registry} from 'vs/platform/platform';
import {Extensions, IConfigurationRegistry} from 'vs/platform/configuration/common/configurationRegistry';

let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'terminal',
	'order': 100,
	'title': nls.localize('integratedTerminalConfigurationTitle', "Integrated terminal configuration"),
	'type': 'object',
	'properties': {
		'integratedTerminal.shell.linux': {
			'description': nls.localize('integratedTerminal.shell.linux', "The path of the shell that the terminal uses on Linux."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_LINUX
		},
		'integratedTerminal.shell.osx': {
			'description': nls.localize('integratedTerminal.shell.osx', "The path of the shell that the terminal uses on OS X."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_OSX
		},
		'integratedTerminal.shell.windows': {
			'description': nls.localize('integratedTerminal.shell.windows', "The path of the shell that the terminal uses on Windows."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_WINDOWS
		},
		'integratedTerminal.fontFamily': {
			'description': nls.localize('integratedTerminal.fontFamily', "The font family used by the terminal (CSS font-family format)."),
			'type': 'string',
			'default': 'Menlo, Monaco, Consolas, "Droid Sans Mono", "Courier New", monospace, "Droid Sans Fallback"'
		},
		'integratedTerminal.ansiColors.black': {
			'description': nls.localize('integratedTerminal.ansiColors.black', "Black color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#000000'
		},
		'integratedTerminal.ansiColors.red': {
			'description': nls.localize('integratedTerminal.ansiColors.red', "Red color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#cd3131'
		},
		'integratedTerminal.ansiColors.green': {
			'description': nls.localize('integratedTerminal.ansiColors.green', "Green color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#09885a'
		},
		'integratedTerminal.ansiColors.yellow': {
			'description': nls.localize('integratedTerminal.ansiColors.yellow', "Yellow color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#e5e510'
		},
		'integratedTerminal.ansiColors.blue': {
			'description': nls.localize('integratedTerminal.ansiColors.blue', "Blue color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#0451a5'
		},
		'integratedTerminal.ansiColors.magenta': {
			'description': nls.localize('integratedTerminal.ansiColors.magenta', "Magenta color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#bc05bc'
		},
		'integratedTerminal.ansiColors.cyan': {
			'description': nls.localize('integratedTerminal.ansiColors.cyan', "Cyan color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#0598bc'
		},
		'integratedTerminal.ansiColors.white': {
			'description': nls.localize('integratedTerminal.ansiColors.white', "White color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#e5e5e5'
		},
		'integratedTerminal.ansiColors.brightBlack': {
			'description': nls.localize('integratedTerminal.ansiColors.brightBlack', "Bright black color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#000000'
		},
		'integratedTerminal.ansiColors.brightRed': {
			'description': nls.localize('integratedTerminal.ansiColors.brightRed', "Bright red color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#cd3131'
		},
		'integratedTerminal.ansiColors.brightGreen': {
			'description': nls.localize('integratedTerminal.ansiColors.brightGreen', "Bright green color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#09885a'
		},
		'integratedTerminal.ansiColors.brightYellow': {
			'description': nls.localize('integratedTerminal.ansiColors.brightYellow', "Bright yellow color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#e5e510'
		},
		'integratedTerminal.ansiColors.brightBlue': {
			'description': nls.localize('integratedTerminal.ansiColors.brightBlue', "Bright blue color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#0451a5'
		},
		'integratedTerminal.ansiColors.brightMagenta': {
			'description': nls.localize('integratedTerminal.ansiColors.brightMagenta', "Bright magenta color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#bc05bc'
		},
		'integratedTerminal.ansiColors.brightCyan': {
			'description': nls.localize('integratedTerminal.ansiColors.brightCyan', "Bright cyan color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#0598bc'
		},
		'integratedTerminal.ansiColors.brightWhite': {
			'description': nls.localize('integratedTerminal.ansiColors.brightWhite', "Bright white color for terminals that support ANSI escape sequences (format: #rrggbb)"),
			'type': 'string',
			'default': '#e5e5e5'
		}
	}
});

// Register Service
registerSingleton(ITerminalService, TerminalService);

// Register Output Panel
(<panel.PanelRegistry>Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/terminal/electron-browser/terminalPanel',
	'TerminalPanel',
	TERMINAL_PANEL_ID,
	nls.localize('terminal', "Terminal"),
	'terminal'
));

// Register toggle output action globally
let actionRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleTerminalAction, ToggleTerminalAction.ID, ToggleTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.US_BACKTICK,
	// on mac cmd+` is reserved to cycle between windows
	mac: { primary: KeyMod.WinCtrl | KeyCode.US_BACKTICK }
}), 'View: ' + ToggleTerminalAction.LABEL, nls.localize('viewCategory', "View"));
