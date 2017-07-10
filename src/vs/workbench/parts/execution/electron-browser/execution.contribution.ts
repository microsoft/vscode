/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as env from 'vs/base/common/platform';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX_READY, DEFAULT_TERMINAL_OSX } from 'vs/workbench/parts/execution/electron-browser/terminal';
import { WinTerminalService, MacTerminalService, LinuxTerminalService } from 'vs/workbench/parts/execution/electron-browser/terminalService';
import { ITerminalService } from 'vs/workbench/parts/execution/common/execution';
import 'vs/workbench/parts/execution/browser/terminal.contribution';

if (env.isWindows) {
	registerSingleton(ITerminalService, WinTerminalService);
} else if (env.isMacintosh) {
	registerSingleton(ITerminalService, MacTerminalService);
} else if (env.isLinux) {
	registerSingleton(ITerminalService, LinuxTerminalService);
}

DEFAULT_TERMINAL_LINUX_READY.then(defaultTerminalLinux => {
	let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		'id': 'externalTerminal',
		'order': 100,
		'title': nls.localize('terminalConfigurationTitle', "External Terminal"),
		'type': 'object',
		'properties': {
			'terminal.external.windowsExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.windowsExec', "Customizes which terminal to run on Windows."),
				'default': DEFAULT_TERMINAL_WINDOWS,
				'isExecutable': true
			},
			'terminal.external.osxExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.osxExec', "Customizes which terminal application to run on OS X."),
				'default': DEFAULT_TERMINAL_OSX,
				'isExecutable': true
			},
			'terminal.external.linuxExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.linuxExec', "Customizes which terminal to run on Linux."),
				'default': defaultTerminalLinux,
				'isExecutable': true
			}
		}
	});
});

