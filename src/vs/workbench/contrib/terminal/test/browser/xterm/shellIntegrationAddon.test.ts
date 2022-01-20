/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal } from 'xterm';
import { strictEqual } from 'assert';
import { timeout } from 'vs/base/common/async';
import { ShellIntegrationAddon } from 'vs/workbench/contrib/terminal/browser/xterm/shellIntegrationAddon';
import { ITerminalCapabilityStore } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { TerminalCapability } from 'vs/platform/terminal/common/terminal';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';

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

suite('ShellIntegrationAddon', () => {
	let xterm: Terminal;
	let shellIntegrationAddon: ShellIntegrationAddon;
	let capabilities: ITerminalCapabilityStore;

	setup(() => {
		xterm = new Terminal({
			cols: 80,
			rows: 30
		});
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ILogService, NullLogService);
		shellIntegrationAddon = instantiationService.createInstance(ShellIntegrationAddon);
		xterm.loadAddon(shellIntegrationAddon);
		capabilities = shellIntegrationAddon.capabilities;
	});

	suite('cwd detection', async () => {
		test('should activate capability on the first prompt start sequence (OSC 133 ; A ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, '\x1b]133;A\x07');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), true);
		});
		test('should not activate capability on any other prompt sequence (OSC 133 ; B-D ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, '\x1b]133;B\x07');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, '\x1b]133;C\x07');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, '\x1b]133;D\x07');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
		});
		test('should activate capability on the first prompt start sequence (OSC 133 ; A ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, '\x1b]133;A\x07');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), true);
		});
	});

	suite.skip('command tracking', async () => {
	});
});
