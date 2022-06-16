/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal } from 'xterm';
import { strictEqual } from 'assert';
import { timeout } from 'vs/base/common/async';
import * as sinon from 'sinon';
import { ShellIntegrationAddon } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
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

class TestShellIntegrationAddon extends ShellIntegrationAddon {
	getCommandDetectionMock(terminal: Terminal): sinon.SinonMock {
		const capability = super._createOrGetCommandDetection(terminal);
		this.capabilities.add(TerminalCapability.CommandDetection, capability);
		return sinon.mock(capability);
	}
	getCwdDectionMock(): sinon.SinonMock {
		const capability = super._createOrGetCwdDetection();
		this.capabilities.add(TerminalCapability.CwdDetection, capability);
		return sinon.mock(capability);
	}
}

suite('ShellIntegrationAddon', () => {
	let xterm: Terminal;
	let shellIntegrationAddon: TestShellIntegrationAddon;
	let capabilities: ITerminalCapabilityStore;

	setup(() => {
		xterm = new Terminal({
			cols: 80,
			rows: 30
		});
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ILogService, NullLogService);
		shellIntegrationAddon = instantiationService.createInstance(TestShellIntegrationAddon, undefined, undefined);
		xterm.loadAddon(shellIntegrationAddon);
		capabilities = shellIntegrationAddon.capabilities;
	});

	suite('cwd detection', async () => {
		test('should activate capability on the cwd sequence (OSC 633 ; P ; Cwd=<cwd> ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), true);
		});
		test('should pass cwd sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCwdDectionMock();
			mock.expects('updateCwd').once().withExactArgs('/foo');
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			mock.verify();
		});
	});

	suite('command tracking', async () => {
		test('should activate capability on the prompt start sequence (OSC 633 ; A ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;A\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass prompt start sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handlePromptStart').once().withExactArgs();
			await writeP(xterm, '\x1b]633;A\x07');
			mock.verify();
		});
		test('should activate capability on the command start sequence (OSC 633 ; B ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;B\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass command start sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handleCommandStart').once().withExactArgs();
			await writeP(xterm, '\x1b]633;B\x07');
			mock.verify();
		});
		test('should activate capability on the command executed sequence (OSC 633 ; C ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;C\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass command executed sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handleCommandExecuted').once().withExactArgs();
			await writeP(xterm, '\x1b]633;C\x07');
			mock.verify();
		});
		test('should activate capability on the command finished sequence (OSC 633 ; D ; <ExitCode> ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;D;7\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass command finished sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handleCommandFinished').once().withExactArgs(7);
			await writeP(xterm, '\x1b]633;D;7\x07');
			mock.verify();
		});
		test('should not activate capability on the cwd sequence (OSC 633 ; P=Cwd=<cwd> ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
		});
		test('should pass cwd sequence to the capability if it\'s initialized', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('setCwd').once().withExactArgs('/foo');
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			mock.verify();
		});
	});
});
