/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IPty } from 'node-pty';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { isWindows } from '../../../../base/common/platform.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IShellLaunchConfig, ITerminalProcessOptions } from '../../common/terminal.js';
import { ChildProcessMonitor } from '../../node/childProcessMonitor.js';
import { TerminalProcess, parseLsofCwd } from '../../node/terminalProcess.js';

suite('TerminalProcess startup disposal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options: ITerminalProcessOptions = {
		shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
		windowsUseConptyDll: false,
		environmentVariableCollections: undefined,
		workspaceFolder: undefined,
		isScreenReaderOptimized: false
	};

	function createTerminal(shellLaunchConfig?: IShellLaunchConfig, cwd = process.cwd(), throttle?: () => Promise<void>) {
		let spawnAttempts = 0;
		class TestTerminalProcess extends TerminalProcess {
			protected override _throttleKillSpawn(): Promise<void> {
				return throttle ? throttle() : super._throttleKillSpawn();
			}
		}
		class Log extends NullLogService {
			override trace(message: string): void {
				if (message === 'node-pty.IPty#spawn') {
					spawnAttempts++;
				}
			}
		}
		const log = store.add(new Log());
		const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
		const terminal = store.add(new TestTerminalProcess(
			shellLaunchConfig ?? { executable: process.execPath, args: ['-e', 'setTimeout(() => process.exit(0), 250)'] },
			cwd, 80, 24, env, env, options, log, { applicationName: 'vscode' } as IProductService
		));
		return {
			terminal,
			observe: () => ({
				spawnAttempts,
				nativePtyPresent: Reflect.get(terminal, '_ptyProcess') !== undefined,
				titlePolling: Reflect.get(terminal, '_titleInterval') !== undefined
			}),
			cleanup: () => {
				// Clean this test's handles if a regression recreates resources after disposal.
				const interval: ReturnType<typeof setInterval> | undefined = Reflect.get(terminal, '_titleInterval');
				if (interval) {
					clearInterval(interval);
				}
				const pty: IPty | undefined = Reflect.get(terminal, '_ptyProcess');
				try {
					pty?.kill();
				} catch {
					// The short-lived child may already have exited.
				}
				const monitor: ChildProcessMonitor | undefined = Reflect.get(terminal, '_childProcessMonitor');
				monitor?.dispose();
				terminal.dispose();
			}
		};
	}

	async function shutdown(terminal: TerminalProcess, immediate = true): Promise<void> {
		const exited = new Promise<void>(resolve => store.add(Event.once(terminal.onProcessExit)(() => resolve())));
		terminal.shutdown(immediate);
		await exited;
	}

	for (const immediate of [true, false]) {
		test(`does not spawn after shutdown during asynchronous validation (immediate: ${immediate})`, async () => {
			const throttle = new DeferredPromise<void>();
			const fixture = createTerminal(undefined, process.cwd(), () => throttle.p);
			try {
				const startup = fixture.terminal.start();
				await shutdown(fixture.terminal, immediate);
				await throttle.complete();
				await startup;
				assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 0, nativePtyPresent: false, titlePolling: false });
			} finally {
				await throttle.complete();
				fixture.cleanup();
			}
		});
	}

	test('does not spawn when started after shutdown', async () => {
		const fixture = createTerminal();
		try {
			await shutdown(fixture.terminal);
			await fixture.terminal.start();
			assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 0, nativePtyPresent: false, titlePolling: false });
		} finally {
			fixture.cleanup();
		}
	});

	test('does not spawn after disposal during asynchronous validation', async () => {
		const fixture = createTerminal();
		try {
			const startup = fixture.terminal.start();
			fixture.terminal.dispose();
			await startup;
			assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 0, nativePtyPresent: false, titlePolling: false });
		} finally {
			fixture.cleanup();
		}
	});

	test('does not spawn after disposal while spawn throttling is pending', async () => {
		const started = new DeferredPromise<void>();
		const throttle = new DeferredPromise<void>();
		const fixture = createTerminal(undefined, process.cwd(), () => {
			started.complete();
			return throttle.p;
		});
		try {
			const startup = fixture.terminal.start();
			await started.p;
			fixture.terminal.dispose();
			await throttle.complete();
			await startup;
			assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 0, nativePtyPresent: false, titlePolling: false });
		} finally {
			await throttle.complete();
			fixture.cleanup();
		}
	});

	(isWindows ? test.skip : test)('starts a live native process and cleans up on normal shutdown', async () => {
		const fixture = createTerminal();
		let pid: number | undefined;
		store.add(fixture.terminal.onProcessReady(event => pid = event.pid));
		try {
			assert.strictEqual(await fixture.terminal.start(), undefined);
			assert.ok(pid && pid > 0);
			await shutdown(fixture.terminal);
			assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 1, nativePtyPresent: false, titlePolling: false });
		} finally {
			fixture.cleanup();
		}
	});

	test('preserves invalid executable launch errors without spawning', async () => {
		const fixture = createTerminal({ executable: '/nonexistent/terminal-startup-disposal-test' });
		try {
			const result = await fixture.terminal.start();
			assert.ok(result && hasKey(result, { message: true }) && result.message);
			assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 0, nativePtyPresent: false, titlePolling: false });
		} finally {
			fixture.cleanup();
		}
	});

	test('preserves invalid cwd launch errors without spawning', async () => {
		const fixture = createTerminal(undefined, '/nonexistent/terminal-startup-disposal-test');
		try {
			const result = await fixture.terminal.start();
			assert.ok(result && hasKey(result, { message: true }) && result.message);
			assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 0, nativePtyPresent: false, titlePolling: false });
		} finally {
			fixture.cleanup();
		}
	});
});

suite('TerminalProcess - parseLsofCwd', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined for empty or whitespace-only output', () => {
		assert.strictEqual(parseLsofCwd(''), undefined);
		assert.strictEqual(parseLsofCwd('   \n\t  '), undefined);
	});

	test('returns undefined when output contains only headers', () => {
		assert.strictEqual(parseLsofCwd('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n'), undefined);
	});

	test('parses standard single line output', () => {
		assert.strictEqual(
			parseLsofCwd('zsh 12345 501 cwd DIR 1,5 960 123456 /Users/vicky/project\n'),
			'/Users/vicky/project'
		);
	});

	test('parses standard output with header', () => {
		assert.strictEqual(
			parseLsofCwd('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nzsh 12345 501 cwd DIR 1,5 960 123456 /Users/vicky/project\n'),
			'/Users/vicky/project'
		);
	});

	test('handles path containing spaces and carriage returns', () => {
		assert.strictEqual(
			parseLsofCwd('zsh 12345 501 cwd DIR 1,5 960 123456 /Users/Vicky Patel/Desktop/Open Source/Microsoft-VSCode\r\n'),
			'/Users/Vicky Patel/Desktop/Open Source/Microsoft-VSCode'
		);
	});

	test('handles command name containing spaces', () => {
		assert.strictEqual(
			parseLsofCwd('Code Helper 12345 501 cwd DIR 1,5 960 123456 /Users/vicky/project\n'),
			'/Users/vicky/project'
		);
	});

	test('ignores non-cwd file descriptor even if command name is cwd', () => {
		assert.strictEqual(
			parseLsofCwd('cwd 12345 501 txt REG 1,5 12345 123457 /path/to/some/file\n'),
			undefined
		);
	});

	test('parses correctly when executable is named cwd and descriptor is cwd', () => {
		assert.strictEqual(
			parseLsofCwd('cwd 12345 501 cwd DIR 1,5 960 123456 /Users/vicky/actual-cwd\n'),
			'/Users/vicky/actual-cwd'
		);
	});

	test('ignores lines where other files or directories contain "cwd" in their path', () => {
		const output = [
			'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME',
			'zsh 12345 501 cwd DIR 1,5 960 123456 /Users/vicky/my-project',
			'zsh 12345 501 txt REG 1,5 12345 123457 /nix/store/cwdz-1.0/lib.dylib',
			'zsh 12345 501 3r REG 1,5 200 123458 /Users/vicky/my-project/cwd/file.txt'
		].join('\n');
		assert.strictEqual(parseLsofCwd(output), '/Users/vicky/my-project');
	});

	test('parses correctly even when a non-cwd file containing "cwd" in its path appears first', () => {
		const output = [
			'zsh 12345 501 txt REG 1,5 12345 123457 /nix/store/cwdz-1.0/lib.dylib',
			'zsh 12345 501 cwd DIR 1,5 960 123456 /Users/vicky/actual-cwd',
			'zsh 12345 501 3r REG 1,5 200 123458 /Users/vicky/my-project/cwd/file.txt'
		].join('\n');
		assert.strictEqual(parseLsofCwd(output), '/Users/vicky/actual-cwd');
	});
});
