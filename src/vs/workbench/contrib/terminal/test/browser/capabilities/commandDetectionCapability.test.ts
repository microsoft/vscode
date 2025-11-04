/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { deepStrictEqual, ok } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalCommand } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { CommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js';
import { writeP } from '../../../browser/terminalTestHelpers.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

type TestTerminalCommandMatch = Pick<ITerminalCommand, 'command' | 'cwd' | 'exitCode'> & { marker: { line: number } };

class TestCommandDetectionCapability extends CommandDetectionCapability {
	clearCommands() {
		this._commands.length = 0;
	}
}

suite('CommandDetectionCapability', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let xterm: Terminal;
	let capability: TestCommandDetectionCapability;
	let addEvents: ITerminalCommand[];

	function assertCommands(expectedCommands: TestTerminalCommandMatch[]) {
		deepStrictEqual(capability.commands.map(e => e.command), expectedCommands.map(e => e.command));
		deepStrictEqual(capability.commands.map(e => e.cwd), expectedCommands.map(e => e.cwd));
		deepStrictEqual(capability.commands.map(e => e.exitCode), expectedCommands.map(e => e.exitCode));
		deepStrictEqual(capability.commands.map(e => e.marker?.line), expectedCommands.map(e => e.marker?.line));
		// Ensure timestamps are set and were captured recently
		for (const command of capability.commands) {
			ok(Math.abs(Date.now() - command.timestamp) < 2000);
		}
		deepStrictEqual(addEvents, capability.commands);
		// Clear the commands to avoid re-asserting past commands
		addEvents.length = 0;
		capability.clearCommands();
	}

	async function printStandardCommand(prompt: string, command: string, output: string, cwd: string | undefined, exitCode: number) {
		if (cwd !== undefined) {
			capability.setCwd(cwd);
		}
		capability.handlePromptStart();
		await writeP(xterm, `\r${prompt}`);
		capability.handleCommandStart();
		await writeP(xterm, command);
		capability.handleCommandExecuted();
		await writeP(xterm, `\r\n${output}\r\n`);
		capability.handleCommandFinished(exitCode);
	}

	async function printCommandStart(prompt: string) {
		capability.handlePromptStart();
		await writeP(xterm, `\r${prompt}`);
		capability.handleCommandStart();
	}


	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;

		xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80 }));
		const instantiationService = workbenchInstantiationService(undefined, store);
		capability = store.add(instantiationService.createInstance(TestCommandDetectionCapability, xterm));
		addEvents = [];
		store.add(capability.onCommandFinished(e => addEvents.push(e)));
		assertCommands([]);
	});

	test('should not add commands when no capability methods are triggered', async () => {
		await writeP(xterm, 'foo\r\nbar\r\n');
		assertCommands([]);
		await writeP(xterm, 'baz\r\n');
		assertCommands([]);
	});

	test('should add commands for expected capability method calls', async () => {
		await printStandardCommand('$ ', 'echo foo', 'foo', undefined, 0);
		await printCommandStart('$ ');
		assertCommands([{
			command: 'echo foo',
			exitCode: 0,
			cwd: undefined,
			marker: { line: 0 }
		}]);
	});

	test('should trim the command when command executed appears on the following line', async () => {
		await printStandardCommand('$ ', 'echo foo\r\n', 'foo', undefined, 0);
		await printCommandStart('$ ');
		assertCommands([{
			command: 'echo foo',
			exitCode: 0,
			cwd: undefined,
			marker: { line: 0 }
		}]);
	});

	suite('cwd', () => {
		test('should add cwd to commands when it\'s set', async () => {
			await printStandardCommand('$ ', 'echo foo', 'foo', '/home', 0);
			await printStandardCommand('$ ', 'echo bar', 'bar', '/home/second', 0);
			await printCommandStart('$ ');
			assertCommands([
				{ command: 'echo foo', exitCode: 0, cwd: '/home', marker: { line: 0 } },
				{ command: 'echo bar', exitCode: 0, cwd: '/home/second', marker: { line: 2 } }
			]);
		});
		test('should add old cwd to commands if no cwd sequence is output', async () => {
			await printStandardCommand('$ ', 'echo foo', 'foo', '/home', 0);
			await printStandardCommand('$ ', 'echo bar', 'bar', undefined, 0);
			await printCommandStart('$ ');
			assertCommands([
				{ command: 'echo foo', exitCode: 0, cwd: '/home', marker: { line: 0 } },
				{ command: 'echo bar', exitCode: 0, cwd: '/home', marker: { line: 2 } }
			]);
		});
		test('should use an undefined cwd if it\'s not set initially', async () => {
			await printStandardCommand('$ ', 'echo foo', 'foo', undefined, 0);
			await printStandardCommand('$ ', 'echo bar', 'bar', '/home', 0);
			await printCommandStart('$ ');
			assertCommands([
				{ command: 'echo foo', exitCode: 0, cwd: undefined, marker: { line: 0 } },
				{ command: 'echo bar', exitCode: 0, cwd: '/home', marker: { line: 2 } }
			]);
		});
	});

	suite('command IDs', () => {
		test('should generate unique IDs for all commands', async () => {
			await printStandardCommand('$ ', 'echo foo', 'foo', undefined, 0);
			await printStandardCommand('$ ', 'echo bar', 'bar', undefined, 0);
			await printCommandStart('$ ');

			// Verify that all commands have IDs
			ok(capability.commands.length === 2);
			ok(capability.commands[0].id, 'First command should have an ID');
			ok(capability.commands[1].id, 'Second command should have an ID');
			// Verify IDs are unique
			ok(capability.commands[0].id !== capability.commands[1].id, 'Command IDs should be unique');
			// Clear commands
			addEvents.length = 0;
			capability.clearCommands();
		});

		test('should preserve custom command IDs when provided', async () => {
			const customId = 'custom-test-id';
			capability.handlePromptStart();
			await writeP(xterm, '\r$ ');
			capability.handleCommandStart();
			await writeP(xterm, 'echo custom');
			capability.handleCommandExecuted();
			await writeP(xterm, '\r\ncustom\r\n');
			capability.handleCommandFinished(0, { commandId: customId });

			ok(capability.commands.length === 1);
			deepStrictEqual(capability.commands[0].id, customId, 'Command should have the custom ID');
			// Clear commands
			addEvents.length = 0;
			capability.clearCommands();
		});
	});
});
