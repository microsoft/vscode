/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { flakySuite } from 'vs/base/test/common/testUtils';

function testErrorMessage(module: string): string {
	return `Unable to load "${module}" dependency. It was probably not compiled for the right operating system architecture or had missing build tools.`;
}

flakySuite('Native Modules (all platforms)', () => {

	test('kerberos', async () => {
		const kerberos = await import('kerberos');
		assert.ok(typeof kerberos.initializeClient === 'function', testErrorMessage('kerberos'));
	});

	test('native-is-elevated', async () => {
		const isElevated = (await import('native-is-elevated')).default;
		assert.ok(typeof isElevated === 'function', testErrorMessage('native-is-elevated '));

		const result = isElevated();
		assert.ok(typeof result === 'boolean', testErrorMessage('native-is-elevated'));
	});

	test('native-keymap', async () => {
		const keyMap = await import('native-keymap');
		assert.ok(typeof keyMap.getCurrentKeyboardLayout === 'function', testErrorMessage('native-keymap'));

		const result = keyMap.getCurrentKeyboardLayout();
		assert.ok(result, testErrorMessage('native-keymap'));
	});

	test('native-watchdog', async () => {
		const watchDog = await import('native-watchdog');
		assert.ok(typeof watchDog.start === 'function', testErrorMessage('native-watchdog'));
	});

	(process.type === 'renderer' ? test.skip /* TODO@electron module is not context aware yet and thus cannot load in Electron renderer used by tests */ : test)('node-pty', async () => {
		const nodePty = await import('node-pty');
		assert.ok(typeof nodePty.spawn === 'function', testErrorMessage('node-pty'));
	});

	(process.type === 'renderer' ? test.skip /* TODO@electron module is not context aware yet and thus cannot load in Electron renderer used by tests */ : test)('@vscode/spdlog', async () => {
		const spdlog = await import('@vscode/spdlog');
		assert.ok(typeof spdlog.createRotatingLogger === 'function', testErrorMessage('@vscode/spdlog'));
		assert.ok(typeof spdlog.version === 'number', testErrorMessage('@vscode/spdlog'));
	});

	test('@parcel/watcher', async () => {
		const parcelWatcher = await import('@parcel/watcher');
		assert.ok(typeof parcelWatcher.subscribe === 'function', testErrorMessage('@parcel/watcher'));
	});

	test('@vscode/sqlite3', async () => {
		const sqlite3 = await import('@vscode/sqlite3');
		assert.ok(typeof sqlite3.Database === 'function', testErrorMessage('@vscode/sqlite3'));
	});

	test('vsda', async () => {
		try {
			const vsda: any = globalThis._VSCODE_NODE_MODULES['vsda'];
			const signer = new vsda.signer();
			const signed = await signer.sign('value');
			assert.ok(typeof signed === 'string', testErrorMessage('vsda'));
		} catch (error) {
			if (error.code !== 'MODULE_NOT_FOUND') {
				throw error;
			}
		}
	});
});

(!isWindows ? suite.skip : suite)('Native Modules (Windows)', () => {

	(process.type === 'renderer' ? test.skip /* TODO@electron module is not context aware yet and thus cannot load in Electron renderer used by tests */ : test)('@vscode/windows-mutex', async () => {
		const mutex = await import('@vscode/windows-mutex');
		assert.ok(mutex && typeof mutex.isActive === 'function', testErrorMessage('@vscode/windows-mutex'));
		assert.ok(typeof mutex.isActive === 'function', testErrorMessage('@vscode/windows-mutex'));
	});

	test('windows-foreground-love', async () => {
		const foregroundLove = await import('windows-foreground-love');
		assert.ok(typeof foregroundLove.allowSetForegroundWindow === 'function', testErrorMessage('windows-foreground-love'));

		const result = foregroundLove.allowSetForegroundWindow(process.pid);
		assert.ok(typeof result === 'boolean', testErrorMessage('windows-foreground-love'));
	});

	test('@vscode/windows-process-tree', async () => {
		const processTree = await import('@vscode/windows-process-tree');
		assert.ok(typeof processTree.getProcessTree === 'function', testErrorMessage('@vscode/windows-process-tree'));

		return new Promise((resolve, reject) => {
			processTree.getProcessTree(process.pid, tree => {
				if (tree) {
					resolve();
				} else {
					reject(new Error(testErrorMessage('@vscode/windows-process-tree')));
				}
			});
		});
	});

	test('@vscode/windows-registry', async () => {
		const windowsRegistry = await import('@vscode/windows-registry');
		assert.ok(typeof windowsRegistry.GetStringRegKey === 'function', testErrorMessage('@vscode/windows-registry'));

		const result = windowsRegistry.GetStringRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', 'EditionID');
		assert.ok(typeof result === 'string' || typeof result === 'undefined', testErrorMessage('@vscode/windows-registry'));
	});

	test('@vscode/windows-ca-certs', async () => {
		// @ts-ignore we do not directly depend on this module anymore
		// but indirectly from our dependency to `@vscode/proxy-agent`
		// we still want to ensure this module can work properly.
		const windowsCerts = await import('@vscode/windows-ca-certs');
		const store = new windowsCerts.Crypt32();
		assert.ok(windowsCerts, testErrorMessage('@vscode/windows-ca-certs'));
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
