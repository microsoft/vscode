/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { timeout } from 'vs/base/common/async';
import { Terminal } from 'xterm';
import { CommandDetectionCapability } from 'vs/workbench/contrib/terminal/browser/capabilities/commandDetectionCapability';
import { NullLogService } from 'vs/platform/log/common/log';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { isWindows } from 'vs/base/common/platform';

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

type TestTerminalCommandMatch = Pick<ITerminalCommand, 'command' | 'cwd' | 'exitCode'> & { marker: { line: number } };

suite('CommandDetectionCapability', () => {
	let xterm: Terminal;
	let capability: CommandDetectionCapability;
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
	}

	setup(() => {
		xterm = new Terminal({ cols: 80 });
		capability = new CommandDetectionCapability(xterm, new NullLogService());
		addEvents = [];
		capability.onCommandFinished(e => addEvents.push(e));
		assertCommands([]);
	});

	test('should not add commands when no capability methods are triggered', async () => {
		await writeP(xterm, 'foo\r\nbar\r\n');
		assertCommands([]);
		await writeP(xterm, 'baz\r\n');
		assertCommands([]);
	});

	(isWindows ? test.skip : test)('should add commands for expected capability method calls', async () => {
		capability.handlePromptStart();
		await writeP(xterm, '$ ');
		capability.handleCommandStart();
		await writeP(xterm, 'echo foo');
		capability.handleCommandExecuted();
		await writeP(xterm, '\r\nfoo\r\n');
		capability.handleCommandFinished(0);
		assertCommands([{
			command: 'echo foo',
			exitCode: 0,
			marker: { line: 0 }
		}]);
	});
});
