/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {equal} from 'assert';
import {WinTerminalService, LinuxTerminalService} from 'vs/workbench/parts/execution/electron-browser/terminalService';
import {DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX} from 'vs/workbench/parts/execution/electron-browser/terminal';

suite('Execution - TerminalService', () => {
	let mockOnExit;
	let mockOnError;
	let mockConfig;

	setup(() => {
		mockConfig = {
			externalTerminal: {
				windowsExec: 'testWindowsShell',
				linuxExec: 'testLinuxShell'
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
				equal(args[args.length - 1], mockConfig.externalTerminal.windowsExec, 'terminal should equal expected')
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

	test("WinTerminalService - uses default terminal when configuration.terminal.external.windowsExec is undefined", done => {
		let testShell = 'cmd';
		let testCwd = 'path/to/workspace';
		let mockSpawner = {
			spawn: (command, args, opts) => {
				// assert
				equal(args[args.length - 1], DEFAULT_TERMINAL_WINDOWS, 'terminal should equal expected')
				done();
				return {
					on: (evt) => evt
				}
			}
		};
		mockConfig.externalTerminal.windowsExec = undefined;
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
				equal(command, mockConfig.externalTerminal.linuxExec, 'terminal should equal expected');
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

	test("LinuxTerminalService - uses default terminal when configuration.terminal.external.linuxExec is undefined", done => {
		let testCwd = 'path/to/workspace';
		let mockSpawner = {
			spawn: (command, args, opts) => {
				// assert
				equal(command, DEFAULT_TERMINAL_LINUX, 'terminal should equal expected')
				done();
				return {
					on: (evt) => evt
				}
			}
		};
		mockConfig.externalTerminal.linuxExec = undefined;
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