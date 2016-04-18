/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {equal} from 'assert';
import {WinTerminalService, LinuxTerminalService} from 'vs/workbench/parts/execution/electron-browser/terminalService';
import {DEFAULT_WINDOWS_TERM, DEFAULT_LINUX_TERM} from 'vs/workbench/parts/execution/electron-browser/terminal';

suite('Execution - TerminalService', () => {
	let mockOnExit;
	let mockOnError;
	let mockConfig;

	setup(() => {
		mockConfig = {
			terminal: {
				windows: {
					exec: 'testWindowsShell'
				},
				linux: {
					exec: 'testLinuxShell'
				}
			}
		};
		mockOnExit = s => s;
		mockOnError = e => e;
	});

	test("WinTerminalService - uses terminal from configuration", done => {
		let testShell = 'cmd';
		let testCwd = 'path/to/workspace';
		let mockSpawner = {
			spawn: (command, args, opts) => {
				// assert
				equal(command, testShell, 'shell should equal expected');
				equal(args[args.length - 1], mockConfig.terminal.windows.exec, 'terminal should equal expected')
				equal(opts.cwd, testCwd, 'opts.cwd should equal expected');
				done();
				return {
					on: (evt) => evt
				}
			}
		};
		let testService = new WinTerminalService(mockConfig);
		(<any>testService).spawnTerminal(
			mockSpawner,
			mockConfig,
			testShell,
			testCwd,
			mockOnExit,
			mockOnError
		);
	});

	test("WinTerminalService - uses default terminal when configuration.terminal.windows.exec is undefined", done => {
		let testShell = 'cmd';
		let testCwd = 'path/to/workspace';
		let mockSpawner = {
			spawn: (command, args, opts) => {
				// assert
				equal(args[args.length - 1], DEFAULT_WINDOWS_TERM, 'terminal should equal expected')
				done();
				return {
					on: (evt) => evt
				}
			}
		};
		mockConfig.terminal.windows.exec = undefined;
		let testService = new WinTerminalService(mockConfig);
		(<any>testService).spawnTerminal(
			mockSpawner,
			mockConfig,
			testShell,
			testCwd,
			mockOnExit,
			mockOnError
		);
	});

	test("LinuxTerminalService - uses terminal from configuration", done => {
		let testCwd = 'path/to/workspace';
		let mockSpawner = {
			spawn: (command, args, opts) => {
				// assert
				equal(command, mockConfig.terminal.linux.exec, 'terminal should equal expected');
				equal(opts.cwd, testCwd, 'opts.cwd should equal expected');
				done();
				return {
					on: (evt) => evt
				}
			}
		};
		let testService = new LinuxTerminalService(mockConfig);
		(<any>testService).spawnTerminal(
			mockSpawner,
			mockConfig,
			testCwd,
			mockOnExit,
			mockOnError
		);
	});

	test("LinuxTerminalService - uses default terminal when configuration.terminal.linux.exec is undefined", done => {
		let testCwd = 'path/to/workspace';
		let mockSpawner = {
			spawn: (command, args, opts) => {
				// assert
				equal(command, DEFAULT_LINUX_TERM, 'terminal should equal expected')
				done();
				return {
					on: (evt) => evt
				}
			}
		};
		mockConfig.terminal.linux.exec = undefined;
		let testService = new LinuxTerminalService(mockConfig);
		(<any>testService).spawnTerminal(
			mockSpawner,
			mockConfig,
			testCwd,
			mockOnExit,
			mockOnError
		);
	});

});