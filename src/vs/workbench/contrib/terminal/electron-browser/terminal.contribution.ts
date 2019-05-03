/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/electron-browser/terminalInstanceService';
import { TerminalService } from 'vs/workbench/contrib/terminal/electron-browser/terminalService';
import { getDefaultShell } from 'vs/workbench/contrib/terminal/node/terminal';

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'terminal',
	order: 100,
	title: nls.localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	type: 'object',
	properties: {
		'terminal.integrated.shell.linux': {
			markdownDescription: nls.localize('terminal.integrated.shell.linux', "The path of the shell that the terminal uses on Linux (default: {0}). [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).", getDefaultShell(platform.Platform.Linux)),
			type: ['string', 'null'],
			default: null
		},
		'terminal.integrated.shell.osx': {
			markdownDescription: nls.localize('terminal.integrated.shell.osx', "The path of the shell that the terminal uses on macOS (default: {0}). [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).", getDefaultShell(platform.Platform.Mac)),
			type: ['string', 'null'],
			default: null
		},
		'terminal.integrated.shell.windows': {
			markdownDescription: nls.localize('terminal.integrated.shell.windows', "The path of the shell that the terminal uses on Windows (default: {0}). [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).", getDefaultShell(platform.Platform.Windows)),
			type: ['string', 'null'],
			default: null
		}
	}
});

registerSingleton(ITerminalService, TerminalService, true);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);
