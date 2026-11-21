/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IPty } from 'node-pty';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { IProcessEnvironment, isWindows } from '../../../../base/common/platform.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IShellLaunchConfig, ITerminalProcessOptions } from '../../common/terminal.js';
import { ChildProcessMonitor } from '../../node/childProcessMonitor.js';
import { TerminalProcess } from '../../node/terminalProcess.js';

const options: ITerminalProcessOptions = {
	shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
	windowsUseConptyDll: false,
	environmentVariableCollections: undefined,
	workspaceFolder: undefined,
	isScreenReaderOptimized: false
};

suite('TerminalProcess environment', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const cases = [
		{ name: 'exposes the workbench ID without shell integration', terminalId: 12, strictEnv: false, inheritedId: undefined, expected: '12' },
		{ name: 'replaces an inherited terminal ID', terminalId: 12, strictEnv: false, inheritedId: '99', expected: '12' },
		{ name: 'does not inject an ID into a strict environment', terminalId: 12, strictEnv: true, inheritedId: undefined, expected: '<unset>' },
		{ name: 'preserves explicitly supplied IDs in strict environments', terminalId: 12, strictEnv: true, inheritedId: '99', expected: '99' },
		{ name: 'does not invent an ID when the workbench ID is unavailable', terminalId: undefined, strictEnv: false, inheritedId: undefined, expected: '<unset>' }
	];
	for (const { name, terminalId, strictEnv, inheritedId, expected } of cases) {
		(isWindows ? test.skip : test)(name, async () => {
			const env: IProcessEnvironment = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
			if (inheritedId === undefined) {
				delete env.VSCODE_TERMINAL_ID;
			} else {
				env.VSCODE_TERMINAL_ID = inheritedId;
			}
			const terminal = store.add(new TerminalProcess({
				executable: process.execPath,
				args: ['-e', 'console.log("terminal-id=" + (process.env.VSCODE_TERMINAL_ID ?? "<unset>"))'],
				strictEnv
			}, process.cwd(), 80, 24, env, env, { ...options, terminalId }, store.add(new NullLogService()), { applicationName: 'vscode' } as IProductService));
			let output = '';
			store.add(terminal.onProcessData(data => output += data));
			const exited = new Promise<number>(resolve => store.add(Event.once(terminal.onProcessExit)(resolve)));
			assert.strictEqual(await terminal.start(), undefined);
			assert.strictEqual(await exited, 0);
			assert.strictEqual(output.match(/terminal-id=(?<terminalId>\d+|<unset>)/)?.groups?.terminalId, expected);
		});
	}
});

suite('TerminalProcess startup disposal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
