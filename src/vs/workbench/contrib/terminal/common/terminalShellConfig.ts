/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { Platform } from 'vs/base/common/platform';

export function registerShellConfiguration(getSystemShell?: (p: Platform) => string): void {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'terminal',
		order: 100,
		title: nls.localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
		type: 'object',
		properties: {
			'terminal.integrated.shell.linux': {
				markdownDescription:
					getSystemShell
						? nls.localize('terminal.integrated.shell.linux', "The path of the shell that the terminal uses on Linux (default: {0}). [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).", getSystemShell(Platform.Linux))
						: nls.localize('terminal.integrated.shell.linux.noDefault', "The path of the shell that the terminal uses on Linux. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
				type: ['string', 'null'],
				default: null
			},
			'terminal.integrated.shell.osx': {
				markdownDescription:
					getSystemShell
						? nls.localize('terminal.integrated.shell.osx', "The path of the shell that the terminal uses on macOS (default: {0}). [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).", getSystemShell(Platform.Mac))
						: nls.localize('terminal.integrated.shell.osx.noDefault', "The path of the shell that the terminal uses on macOS. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
				type: ['string', 'null'],
				default: null
			},
			'terminal.integrated.shell.windows': {
				markdownDescription:
					getSystemShell
						? nls.localize('terminal.integrated.shell.windows', "The path of the shell that the terminal uses on Windows (default: {0}). [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).", getSystemShell(Platform.Windows))
						: nls.localize('terminal.integrated.shell.windows.noDefault', "The path of the shell that the terminal uses on Windows. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
				type: ['string', 'null'],
				default: null
			}
		}
	});
}
