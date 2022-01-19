/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal } from 'xterm';
import { deepStrictEqual } from 'assert';
import { timeout } from 'vs/base/common/async';
import { ShellIntegrationAddon } from 'vs/workbench/contrib/terminal/browser/xterm/shellIntegrationAddon';
import { ITerminalCapabilityStore } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';

async function writeP(terminal: Terminal, data: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const failTimeout = timeout(2000);
		failTimeout.then(() => reject('Writing to xterm is taking longer than 2 seconds'));
		terminal.write(data, () => {
			failTimeout.cancel();
			resolve();
		});
	});
}

suite('LineDataEventAddon', () => {
	let xterm: Terminal;
	let shellIntegrationAddon: ShellIntegrationAddon;
	let capabilities: ITerminalCapabilityStore;

	setup(() => {
		xterm = new Terminal({
			cols: 4
		});
		shellIntegrationAddon = new ShellIntegrationAddon();
		xterm.loadAddon(shellIntegrationAddon);
		capabilities = shellIntegrationAddon.capabilities;
	});

	suite('cwd detection', async () => {
		test('should fire when a non-wrapped line ends with a line feed', async () => {
			await writeP(xterm, 'foo');
		});
	});

	suite.skip('command tracking', async () => {
	});
});
