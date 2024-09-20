/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { flakySuite } from '../../../../base/test/common/testUtils.js';

function testErrorMessage(module: string): string {
	return `Unable to load "${module}" dependency. It was probably not compiled for the right operating system architecture or had missing build tools.`;
}

flakySuite('Native Modules (all platforms)', () => {

	(isMacintosh ? test.skip : test)('kerberos', async () => { // Somehow fails on macOS ARM?
		const { default: kerberos } = await import('kerberos');
		assert.ok(typeof kerberos.initializeClient === 'function', testErrorMessage('kerberos'));
	});

	test('minimist', async () => {
		const { default: minimist } = await import('minimist');
		assert.ok(typeof minimist === 'function', testErrorMessage('minimist'));
	});

	test('yauzl', async () => {
		const { default: yauzl } = await import('yauzl');
		assert.ok(typeof yauzl.ZipFile === 'function', testErrorMessage('yauzl'));
	});

	test('yazl', async () => {
		const { default: yazl } = await import('yazl');
		assert.ok(typeof yazl.ZipFile === 'function', testErrorMessage('yazl'));
	});

	test('v8-inspect-profiler', async () => {
		const { default: profiler } = await import('v8-inspect-profiler');
		assert.ok(typeof profiler.startProfiling === 'function', testErrorMessage('v8-inspect-profiler'));
	});

	test('native-is-elevated', async () => {
		const { default: isElevated } = await import('native-is-elevated');
		assert.ok(typeof isElevated === 'function', testErrorMessage('native-is-elevated '));

		const result = isElevated();
		assert.ok(typeof result === 'boolean', testErrorMessage('native-is-elevated'));
	});

	test('native-keymap', async () => {
		const keyMap = await import('native-keymap');
		assert.ok(typeof keyMap.onDidChangeKeyboardLayout === 'function', testErrorMessage('native-keymap'));
		assert.ok(typeof keyMap.getCurrentKeyboardLayout === 'function', testErrorMessage('native-keymap'));

		const result = keyMap.getCurrentKeyboardLayout();
		assert.ok(result, testErrorMessage('native-keymap'));
	});

	test('native-watchdog', async () => {
		const watchDog = await import('native-watchdog');
		assert.ok(typeof watchDog.start === 'function', testErrorMessage('native-watchdog'));
	});

	test('@vscode/sudo-prompt', async () => {
		const prompt = await import('@vscode/sudo-prompt');
		assert.ok(typeof prompt.exec === 'function', testErrorMessage('@vscode/sudo-prompt'));
	});

	test('@vscode/policy-watcher', async () => {
		const watcher = await import('@vscode/policy-watcher');
		assert.ok(typeof watcher.createWatcher === 'function', testErrorMessage('@vscode/policy-watcher'));
	});

	test('node-pty', async () => {
		const nodePty = await import('node-pty');
		assert.ok(typeof nodePty.spawn === 'function', testErrorMessage('node-pty'));
	});

	test('open', async () => {
		const { default: open } = await import('open');
		assert.ok(typeof open === 'function', testErrorMessage('open'));
	});

	test('@vscode/spdlog', async () => {
		const spdlog = await import('@vscode/spdlog');
		assert.ok(typeof spdlog.createRotatingLogger === 'function', testErrorMessage('@vscode/spdlog'));
		assert.ok(typeof spdlog.version === 'number', testErrorMessage('@vscode/spdlog'));
	});

	test('@parcel/watcher', async () => {
		const parcelWatcher = await import('@parcel/watcher');
		assert.ok(typeof parcelWatcher.subscribe === 'function', testErrorMessage('@parcel/watcher'));
	});

	test('@bpasero/watcher', async () => {
		const parcelWatcher2 = await import('@bpasero/watcher');
		assert.ok(typeof parcelWatcher2.subscribe === 'function', testErrorMessage('@bpasero/watcher'));
	});

	test('@vscode/deviceid', async () => {
		const deviceIdPackage = await import('@vscode/deviceid');
		assert.ok(typeof deviceIdPackage.getDeviceId === 'function', testErrorMessage('@vscode/deviceid'));
	});

	test('@vscode/ripgrep', async () => {
		const ripgrep = await import('@vscode/ripgrep');
		assert.ok(typeof ripgrep.rgPath === 'string', testErrorMessage('@vscode/ripgrep'));
	});

	test('vscode-regexpp', async () => {
		const regexpp = await import('vscode-regexpp');
		assert.ok(typeof regexpp.RegExpParser === 'function', testErrorMessage('vscode-regexpp'));
	});

	test('@vscode/sqlite3', async () => {
		// ESM-comment-begin
		// const sqlite3 = await import('@vscode/sqlite3');
		// ESM-comment-end
		// ESM-uncomment-begin
		const { default: sqlite3 } = await import('@vscode/sqlite3');
		// ESM-uncomment-end
		assert.ok(typeof sqlite3.Database === 'function', testErrorMessage('@vscode/sqlite3'));
	});

	test('http-proxy-agent', async () => {
		// ESM-comment-begin
		// const mod = await import('http-proxy-agent');
		// ESM-comment-end
		// ESM-uncomment-begin
		const { default: mod } = await import('http-proxy-agent');
		// ESM-uncomment-end
		assert.ok(typeof mod.HttpProxyAgent === 'function', testErrorMessage('http-proxy-agent'));
	});

	test('https-proxy-agent', async () => {
		// ESM-comment-begin
		// const mod = await import('https-proxy-agent');
		// ESM-comment-end
		// ESM-uncomment-begin
		const { default: mod } = await import('https-proxy-agent');
		// ESM-uncomment-end
		assert.ok(typeof mod.HttpsProxyAgent === 'function', testErrorMessage('https-proxy-agent'));
	});

	test('@vscode/proxy-agent', async () => {
		const proxyAgent = await import('@vscode/proxy-agent');
		// This call will load `@vscode/proxy-agent` which is a native module that we want to test on Windows
		const windowsCerts = await proxyAgent.loadSystemCertificates({
			log: {
				trace: () => { },
				debug: () => { },
				info: () => { },
				warn: () => { },
				error: () => { }
			}
		});
		assert.ok(windowsCerts.length > 0, testErrorMessage('@vscode/proxy-agent'));
	});
});

(!isWindows ? suite.skip : suite)('Native Modules (Windows)', () => {

	test('@vscode/windows-mutex', async () => {
		const mutex = await import('@vscode/windows-mutex');
		assert.ok(mutex && typeof mutex.isActive === 'function', testErrorMessage('@vscode/windows-mutex'));
		assert.ok(typeof mutex.isActive === 'function', testErrorMessage('@vscode/windows-mutex'));
		assert.ok(typeof mutex.Mutex === 'function', testErrorMessage('@vscode/windows-mutex'));
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
});
