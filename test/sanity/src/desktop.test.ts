/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { _electron } from 'playwright';
import { TestContext } from './context.js';
import { UITest } from './uiTest.js';

export function setup(context: TestContext) {
	context.test('desktop-darwin-x64', ['darwin', 'x64', 'desktop'], async () => {
		const dir = await context.downloadAndUnpack('darwin');
		context.validateAllCodesignSignatures(dir);
		if (!context.options.downloadOnly) {
			const entryPoint = context.getDesktopEntryPoint(dir);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-darwin-arm64', ['darwin', 'arm64', 'desktop'], async () => {
		const dir = await context.downloadAndUnpack('darwin-arm64');
		context.validateAllCodesignSignatures(dir);
		if (!context.options.downloadOnly) {
			const entryPoint = context.getDesktopEntryPoint(dir);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-darwin-universal', ['darwin', 'desktop'], async () => {
		const dir = await context.downloadAndUnpack('darwin-universal');
		context.validateAllCodesignSignatures(dir);
		if (!context.options.downloadOnly) {
			const entryPoint = context.getDesktopEntryPoint(dir);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-darwin-x64-dmg', ['darwin', 'x64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('darwin-x64-dmg');
		context.validateCodesignSignature(packagePath);
		if (!context.options.downloadOnly) {
			const dir = context.mountDmg(packagePath);
			context.validateAllCodesignSignatures(dir);
			const entryPoint = context.getDesktopEntryPoint(dir);
			await testDesktopApp(entryPoint);
			context.unmountDmg(dir);
		}
	});

	context.test('desktop-darwin-arm64-dmg', ['darwin', 'arm64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('darwin-arm64-dmg');
		context.validateCodesignSignature(packagePath);
		if (!context.options.downloadOnly) {
			const dir = context.mountDmg(packagePath);
			context.validateAllCodesignSignatures(dir);
			const entryPoint = context.getDesktopEntryPoint(dir);
			await testDesktopApp(entryPoint);
			context.unmountDmg(dir);
		}
	});

	context.test('desktop-darwin-universal-dmg', ['darwin', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('darwin-universal-dmg');
		context.validateCodesignSignature(packagePath);
		if (!context.options.downloadOnly) {
			const dir = context.mountDmg(packagePath);
			context.validateAllCodesignSignatures(dir);
			const entryPoint = context.getDesktopEntryPoint(dir);
			await testDesktopApp(entryPoint);
			context.unmountDmg(dir);
		}
	});

	context.test('desktop-linux-arm64', ['linux', 'arm64', 'desktop'], async () => {
		let dir = await context.downloadAndUnpack('linux-arm64');
		if (!context.options.downloadOnly) {
			dir = context.getFirstSubdirectory(dir);
			const entryPoint = context.getDesktopEntryPoint(dir);
			const dataDir = context.createPortableDataDir(dir);
			await testDesktopApp(entryPoint, dataDir);
		}
	});

	context.test('desktop-linux-armhf', ['linux', 'arm32', 'desktop'], async () => {
		let dir = await context.downloadAndUnpack('linux-armhf');
		if (!context.options.downloadOnly) {
			dir = context.getFirstSubdirectory(dir);
			const entryPoint = context.getDesktopEntryPoint(dir);
			const dataDir = context.createPortableDataDir(dir);
			await testDesktopApp(entryPoint, dataDir);
		}
	});

	context.test('desktop-linux-deb-arm64', ['linux', 'arm64', 'deb', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-arm64');
		if (!context.options.downloadOnly) {
			const entryPoint = await context.installDeb(packagePath);
			try {
				await testDesktopApp(entryPoint, undefined, context.options.setuidSandbox);
			} finally {
				await context.uninstallDeb();
			}
		}
	});

	context.test('desktop-linux-deb-armhf', ['linux', 'arm32', 'deb', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-armhf');
		if (!context.options.downloadOnly) {
			const entryPoint = await context.installDeb(packagePath);
			try {
				await testDesktopApp(entryPoint, undefined, context.options.setuidSandbox);
			} finally {
				await context.uninstallDeb();
			}
		}
	});

	context.test('desktop-linux-deb-x64', ['linux', 'x64', 'deb', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-x64');
		if (!context.options.downloadOnly) {
			const entryPoint = await context.installDeb(packagePath);
			try {
				await testDesktopApp(entryPoint, undefined, context.options.setuidSandbox);
			} finally {
				await context.uninstallDeb();
			}
		}
	});

	context.test('desktop-linux-rpm-arm64', ['linux', 'arm64', 'rpm', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-arm64');
		if (!context.options.downloadOnly) {
			const entryPoint = context.installRpm(packagePath);
			try {
				await testDesktopApp(entryPoint, undefined, context.options.setuidSandbox);
			} finally {
				await context.uninstallRpm();
			}
		}
	});

	context.test('desktop-linux-rpm-armhf', ['linux', 'arm32', 'rpm', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-armhf');
		if (!context.options.downloadOnly) {
			const entryPoint = context.installRpm(packagePath);
			try {
				await testDesktopApp(entryPoint, undefined, context.options.setuidSandbox);
			} finally {
				await context.uninstallRpm();
			}
		}
	});

	context.test('desktop-linux-rpm-x64', ['linux', 'x64', 'rpm', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-x64');
		if (!context.options.downloadOnly) {
			const entryPoint = context.installRpm(packagePath);
			try {
				await testDesktopApp(entryPoint, undefined, context.options.setuidSandbox);
			} finally {
				await context.uninstallRpm();
			}
		}
	});

	context.test('desktop-linux-snap-x64', ['linux', 'x64', 'snap', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('linux-snap-x64');
		if (!context.options.downloadOnly) {
			const entryPoint = context.installSnap(packagePath);
			try {
				await testDesktopApp(entryPoint);
			} finally {
				await context.uninstallSnap();
			}
		}
	});

	context.test('desktop-linux-x64', ['linux', 'x64', 'desktop'], async () => {
		let dir = await context.downloadAndUnpack('linux-x64');
		if (!context.options.downloadOnly) {
			dir = context.getFirstSubdirectory(dir);
			const entryPoint = context.getDesktopEntryPoint(dir);
			const dataDir = context.createPortableDataDir(dir);
			await testDesktopApp(entryPoint, dataDir);
		}
	});

	context.test('desktop-win32-arm64', ['windows', 'arm64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('win32-arm64');
		context.validateAuthenticodeSignature(packagePath);
		context.validateVersionInfo(packagePath);
		if (!context.options.downloadOnly) {
			const entryPoint = context.installWindowsApp('system', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			context.validateAllVersionInfo(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('system');
		}
	});

	context.test('desktop-win32-arm64-archive', ['windows', 'arm64', 'desktop'], async () => {
		const dir = await context.downloadAndUnpack('win32-arm64-archive');
		context.validateAllAuthenticodeSignatures(dir);
		context.validateAllVersionInfo(dir);
		if (!context.options.downloadOnly) {
			const entryPoint = context.getDesktopEntryPoint(dir);
			const dataDir = context.createPortableDataDir(dir);
			await testDesktopApp(entryPoint, dataDir);
		}
	});

	context.test('desktop-win32-arm64-user', ['windows', 'arm64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('win32-arm64-user');
		context.validateAuthenticodeSignature(packagePath);
		context.validateVersionInfo(packagePath);
		if (!context.options.downloadOnly) {
			const entryPoint = context.installWindowsApp('user', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			context.validateAllVersionInfo(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('user');
		}
	});

	context.test('desktop-win32-x64', ['windows', 'x64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('win32-x64');
		context.validateAuthenticodeSignature(packagePath);
		context.validateVersionInfo(packagePath);
		if (!context.options.downloadOnly) {
			const entryPoint = context.installWindowsApp('system', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			context.validateAllVersionInfo(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('system');
		}
	});

	context.test('desktop-win32-x64-archive', ['windows', 'x64', 'desktop'], async () => {
		const dir = await context.downloadAndUnpack('win32-x64-archive');
		context.validateAllAuthenticodeSignatures(dir);
		context.validateAllVersionInfo(dir);
		if (!context.options.downloadOnly) {
			const entryPoint = context.getDesktopEntryPoint(dir);
			const dataDir = context.createPortableDataDir(dir);
			await testDesktopApp(entryPoint, dataDir);
		}
	});

	context.test('desktop-win32-x64-user', ['windows', 'x64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('win32-x64-user');
		context.validateAuthenticodeSignature(packagePath);
		context.validateVersionInfo(packagePath);
		if (!context.options.downloadOnly) {
			const entryPoint = context.installWindowsApp('user', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			context.validateAllVersionInfo(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('user');
		}
	});

	async function testDesktopApp(entryPoint: string, dataDir?: string, setuidSandbox = false) {
		const test = new UITest(context, dataDir);
		const args = dataDir ? ['--disable-experiments'] : [
			'--disable-experiments',
			'--extensions-dir', test.extensionsDir,
			'--user-data-dir', test.userDataDir,
		];
		if (setuidSandbox) {
			if (context.isRootUser) {
				context.error('Setuid sandbox tests must run as a non-root user; Playwright disables sandboxing when running as root.');
			}
			const sandboxPath = path.join(path.dirname(entryPoint), 'chrome-sandbox');
			const sandbox = fs.statSync(sandboxPath);
			assert.deepStrictEqual(
				{ uid: sandbox.uid, gid: sandbox.gid, mode: sandbox.mode & 0o7777 },
				{ uid: 0, gid: 0, mode: 0o4755 },
				`Invalid setuid sandbox helper permissions: ${sandboxPath}`
			);
		}
		const crashDumpsDir = context.getCrashDumpsDir();
		if (crashDumpsDir) {
			args.push('--crash-reporter-directory', crashDumpsDir);
		}
		args.push(test.workspaceDir);
		if (setuidSandbox) {
			args.push('--disable-namespace-sandbox');
		}

		context.log(`Starting VS Code ${entryPoint} with args ${args.join(' ')}`);
		const app = await _electron.launch({ executablePath: entryPoint, args });
		let failure: { error: unknown } | undefined;
		try {
			const window = await context.getPage(app.firstWindow());
			await test.run(window);
		} catch (error) {
			failure = { error };
		}
		try {
			await context.closeElectronApp(app);
		} catch (error) {
			if (failure) {
				context.warn(`Failed to close the application after the test failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			failure ??= { error };
		}

		if (!failure) {
			try {
				test.validate();
			} catch (error) {
				failure = { error };
			}
		}
		if (failure) {
			test.captureAppLogs();
			throw failure.error;
		}
	}
}
