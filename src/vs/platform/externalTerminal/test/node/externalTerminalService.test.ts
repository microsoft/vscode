/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, rejects, strictEqual } from 'assert';
import { ChildProcess } from 'child_process';
import { PassThrough } from 'stream';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ChannelClient, ChannelServer, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DEFAULT_TERMINAL_OSX, ExternalTerminalNotStartedError, IExternalTerminalConfiguration, IExternalTerminalService } from '../../common/externalTerminal.js';
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from '../../node/externalTerminalService.js';

const mockConfig = Object.freeze<IExternalTerminalConfiguration>({
	terminal: {
		explorerKind: 'external',
		external: {
			windowsExec: 'testWindowsShell',
			osxExec: 'testOSXShell',
			linuxExec: 'testLinuxShell'
		}
	}
});

suite('ExternalTerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const scenario of ['spawnError', 'automationDenied', 'ambiguousFailure'] as const) {
		test(`Mac terminal distinguishes a command that never started from an ambiguous failure (${scenario})`, async () => {
			const process = new ChildProcess();
			const stderr = new PassThrough();
			process.stderr = stderr;
			const service = new MacExternalTerminalService(() => {
				queueMicrotask(() => {
					if (scenario === 'spawnError') {
						process.emit('error', new Error('spawn failed'));
					} else {
						stderr.write(scenario === 'automationDenied' ? 'Not authorized to send Apple events to Terminal. (-1743)' : 'Terminal window lookup failed. (-1728)');
						process.emit('exit', 1);
					}
				});
				return process;
			});
			const toClient = store.add(new Emitter<VSBuffer>());
			const toServer = store.add(new Emitter<VSBuffer>());
			const client = store.add(new ChannelClient({ onMessage: toClient.event, send: buffer => toServer.fire(buffer) }));
			const server = store.add(new ChannelServer({ onMessage: toServer.event, send: buffer => toClient.fire(buffer) }, undefined));
			server.registerChannel('externalTerminal', ProxyChannel.fromService(service, store.add(new DisposableStore())));
			const proxy = ProxyChannel.toService<IExternalTerminalService>(client.getChannel('externalTerminal'));
			try {
				await rejects(proxy.runInTerminal('Test', '/workspace', ['echo', 'test'], undefined, { osxExec: DEFAULT_TERMINAL_OSX }), error =>
					error instanceof Error && ExternalTerminalNotStartedError.is(error) === (scenario !== 'ambiguousFailure'));
			} finally {
				stderr.destroy();
			}
		});
	}

	test(`WinTerminalService - uses terminal from configuration`, done => {
		const testShell = 'cmd';
		const testCwd = 'path/to/workspace';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(command, testShell, 'shell should equal expected');
				strictEqual(args[args.length - 1], mockConfig.terminal.external.windowsExec);
				strictEqual(opts.cwd, testCwd);
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		const testService = new WindowsExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			mockConfig.terminal.external,
			testShell,
			testCwd
		);
	});

	test(`WinTerminalService - uses default terminal when configuration.terminal.external.windowsExec is undefined`, done => {
		const testShell = 'cmd';
		const testCwd = 'path/to/workspace';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(args[args.length - 1], WindowsExternalTerminalService.getDefaultTerminalWindows());
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		mockConfig.terminal.external.windowsExec = undefined;
		const testService = new WindowsExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			mockConfig.terminal.external,
			testShell,
			testCwd
		);
	});

	test(`WinTerminalService - cwd is correct regardless of case`, done => {
		const testShell = 'cmd';
		const testCwd = 'c:/foo';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(opts.cwd, 'C:/foo', 'cwd should be uppercase regardless of the case that\'s passed in');
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		const testService = new WindowsExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			mockConfig.terminal.external,
			testShell,
			testCwd
		);
	});

	test(`WinTerminalService - cmder should be spawned differently`, done => {
		const testShell = 'cmd';
		const testCwd = 'c:/foo';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				deepStrictEqual(args, ['C:/foo']);
				strictEqual(opts, undefined);
				done();
				return { on: (evt: any) => evt };
			}
		};
		const testService = new WindowsExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			{ windowsExec: 'cmder' },
			testShell,
			testCwd
		);
	});

	test(`WinTerminalService - windows terminal should open workspace directory`, done => {
		const testShell = 'wt';
		const testCwd = 'c:/foo';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(opts.cwd, 'C:/foo');
				done();
				return { on: (evt: any) => evt };
			}
		};
		const testService = new WindowsExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			mockConfig.terminal.external,
			testShell,
			testCwd
		);
	});

	test(`MacTerminalService - uses terminal from configuration`, done => {
		const testCwd = 'path/to/workspace';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(args[1], mockConfig.terminal.external.osxExec);
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		const testService = new MacExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			mockConfig.terminal.external,
			testCwd
		);
	});

	test(`MacTerminalService - uses default terminal when configuration.terminal.external.osxExec is undefined`, done => {
		const testCwd = 'path/to/workspace';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(args[1], DEFAULT_TERMINAL_OSX);
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		const testService = new MacExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			{ osxExec: undefined },
			testCwd
		);
	});

	test(`MacTerminalService - Ghostty.app should be spawned correctly`, done => {
		const testCwd = 'path/to/workspace';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(command, '/usr/bin/open');
				strictEqual(args[0], '-a');
				strictEqual(args[1], 'Ghostty.app');
				strictEqual(args[2], testCwd);
				strictEqual(opts.cwd, testCwd);
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		const testService = new MacExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			{ osxExec: 'Ghostty.app' },
			testCwd
		);
	});

	test(`LinuxTerminalService - uses terminal from configuration`, done => {
		const testCwd = 'path/to/workspace';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(command, mockConfig.terminal.external.linuxExec);
				strictEqual(opts.cwd, testCwd);
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		const testService = new LinuxExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			mockConfig.terminal.external,
			testCwd
		);
	});

	test(`LinuxTerminalService - Ghostty should be spawned with working directory`, done => {
		const testCwd = 'path/to/workspace';
		const mockSpawner: any = {
			spawn: (command: any, args: any, opts: any) => {
				strictEqual(command, 'ghostty');
				deepStrictEqual(args, [`--working-directory=${testCwd}`]);
				strictEqual(opts.cwd, testCwd);
				done();
				return {
					on: (evt: any) => evt
				};
			}
		};
		const testService = new LinuxExternalTerminalService();
		testService.spawnTerminal(
			mockSpawner,
			{ linuxExec: 'ghostty' },
			testCwd
		);
	});

	test(`LinuxTerminalService - uses default terminal when configuration.terminal.external.linuxExec is undefined`, done => {
		LinuxExternalTerminalService.getDefaultTerminalLinuxReady().then(defaultTerminalLinux => {
			const testCwd = 'path/to/workspace';
			const mockSpawner: any = {
				spawn: (command: any, args: any, opts: any) => {
					strictEqual(command, defaultTerminalLinux);
					done();
					return {
						on: (evt: any) => evt
					};
				}
			};
			mockConfig.terminal.external.linuxExec = undefined;
			const testService = new LinuxExternalTerminalService();
			testService.spawnTerminal(
				mockSpawner,
				mockConfig.terminal.external,
				testCwd
			);
		});
	});
});
