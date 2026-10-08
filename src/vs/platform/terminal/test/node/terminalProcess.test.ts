/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IPty } from 'node-pty';
import { Event } from '../../../../base/common/event.js';
import { isWindows } from '../../../../base/common/platform.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IShellLaunchConfig, ITerminalProcessOptions } from '../../common/terminal.js';
import { ChildProcessMonitor } from '../../node/childProcessMonitor.js';
import { TerminalProcess } from '../../node/terminalProcess.js';

(isWindows ? suite.skip : suite)('TerminalProcess startup disposal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options: ITerminalProcessOptions = {
		shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
		windowsUseConptyDll: false,
		environmentVariableCollections: undefined,
		workspaceFolder: undefined,
		isScreenReaderOptimized: false
	};

	function createTerminal(shellLaunchConfig?: IShellLaunchConfig, cwd = process.cwd()) {
		let spawnAttempts = 0;
		class Log extends NullLogService {
			override trace(message: string): void {
				if (message === 'node-pty.IPty#spawn') {
					spawnAttempts++;
				}
			}
		}
		const log = store.add(new Log());
		const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
		const terminal = store.add(new TerminalProcess(
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

	async function shutdown(terminal: TerminalProcess): Promise<void> {
		const exited = new Promise<void>(resolve => store.add(Event.once(terminal.onProcessExit)(() => resolve())));
		terminal.shutdown(true);
		await exited;
	}

	test('does not spawn after shutdown during asynchronous validation', async () => {
		const fixture = createTerminal();
		try {
			const startup = fixture.terminal.start();
			await shutdown(fixture.terminal);
			await startup;
			assert.deepStrictEqual(fixture.observe(), { spawnAttempts: 0, nativePtyPresent: false, titlePolling: false });
		} finally {
			fixture.cleanup();
		}
	});

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

	test('starts a live native process and cleans up on normal shutdown', async () => {
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
