/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isLinux, isWindows } from 'vs/base/common/platform';

function testErrorMessage(module: string): string {
	return `Unable to load "${module}" dependency. It was probably not compiled for the right operating system architecture or had missing build tools.`;
}

suite('Native Modules (all platforms)', () => {

	test('native-is-elevated', async () => {
		const isElevated = await import('native-is-elevated');
		assert.ok(typeof isElevated === 'function', testErrorMessage('native-is-elevated '));
	});

	test('native-keymap', async () => {
		const keyMap = await import('native-keymap');
		assert.ok(typeof keyMap.getCurrentKeyboardLayout === 'function', testErrorMessage('native-keymap'));
	});

	test('native-watchdog', async () => {
		const watchDog = await import('native-watchdog');
		assert.ok(typeof watchDog.start === 'function', testErrorMessage('native-watchdog'));
	});

	test('node-pty', async () => {
		const nodePty = await import('node-pty');
		assert.ok(typeof nodePty.spawn === 'function', testErrorMessage('node-pty'));
	});

	test('spdlog', async () => {
		const spdlog = await import('spdlog');
		assert.ok(typeof spdlog.createRotatingLogger === 'function', testErrorMessage('spdlog'));
	});

	test('@parcel/watcher', async () => {
		const parcelWatcher = await import('@parcel/watcher');
		assert.ok(typeof parcelWatcher.subscribe === 'function', testErrorMessage('parcel'));
	});

	test('@vscode/sqlite3', async () => {
		const sqlite3 = await import('@vscode/sqlite3');
		assert.ok(typeof sqlite3.Database === 'function', testErrorMessage('@vscode/sqlite3'));
	});
});

(isLinux ? suite.skip : suite)('Native Modules (Windows, macOS)', () => {

	test('keytar', async () => {
		const keytar = await import('keytar');
		const name = `VSCode Test ${Math.floor(Math.random() * 1e9)}`;
		try {
			await keytar.setPassword(name, 'foo', 'bar');
			assert.strictEqual(await keytar.findPassword(name), 'bar');
			assert.strictEqual((await keytar.findCredentials(name)).length, 1);
			assert.strictEqual(await keytar.getPassword(name, 'foo'), 'bar');
			await keytar.deletePassword(name, 'foo');
			assert.strictEqual(await keytar.getPassword(name, 'foo'), null);
		} catch (err) {
			try {
				await keytar.deletePassword(name, 'foo'); // try to clean up
			} catch { }

			throw err;
		}
	});
});

(!isWindows ? suite.skip : suite)('Native Modules (Windows)', () => {

	test('windows-mutex', async () => {
		const mutex = await import('windows-mutex');
		assert.ok(mutex && typeof mutex.isActive === 'function', testErrorMessage('windows-mutex'));
		assert.ok(typeof mutex.isActive === 'function', testErrorMessage('windows-mutex'));
	});

	test('windows-foreground-love', async () => {
		const foregroundLove = await import('windows-foreground-love');
		assert.ok(typeof foregroundLove.allowSetForegroundWindow === 'function', testErrorMessage('windows-foreground-love'));
	});

	test('windows-process-tree', async () => {
		const processTree = await import('windows-process-tree');
		assert.ok(typeof processTree.getProcessTree === 'function', testErrorMessage('windows-process-tree'));
	});

	test('vscode-windows-registry', async () => {
		const windowsRegistry = await import('vscode-windows-registry');
		assert.ok(typeof windowsRegistry.GetStringRegKey === 'function', testErrorMessage('vscode-windows-registry'));
	});

	test('vscode-windows-ca-certs', async () => {
		// @ts-ignore we do not directly depend on this module anymore
		// but indirectly from our dependency to `vscode-proxy-agent`
		// we still want to ensure this module can work properly.
		const windowsCerts = await import('vscode-windows-ca-certs');
		const store = new windowsCerts.Crypt32();
		assert.ok(windowsCerts, testErrorMessage('vscode-windows-ca-certs'));
		let certCount = 0;
		try {
			while (store.next()) {
				certCount++;
			}
		} finally {
			store.done();
		}
		assert(certCount > 0);
	});
});
