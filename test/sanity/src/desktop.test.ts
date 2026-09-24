/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { _electron } from 'playwright';
import { TestContext } from './context.js';
import { DesktopLauncher, linuxLaunchers, macOSLaunchers, windowsLaunchers } from './launchers.js';
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
			try {
				context.validateAllCodesignSignatures(dir);
				const entryPoint = context.getDesktopEntryPoint(dir);
				await testDesktopApp(entryPoint);
			} finally {
				context.unmountDmg(dir);
			}
		}
	});

	context.test('desktop-darwin-arm64-dmg', ['darwin', 'arm64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('darwin-arm64-dmg');
		context.validateCodesignSignature(packagePath);
		if (!context.options.downloadOnly) {
			const dir = context.mountDmg(packagePath);
			try {
				context.validateAllCodesignSignatures(dir);
				const entryPoint = context.getDesktopEntryPoint(dir);
				await testDesktopApp(entryPoint);
			} finally {
				context.unmountDmg(dir);
			}
		}
	});

	context.test('desktop-darwin-universal-dmg', ['darwin', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('darwin-universal-dmg');
		context.validateCodesignSignature(packagePath);
		if (!context.options.downloadOnly) {
			const dir = context.mountDmg(packagePath);
			try {
				context.validateAllCodesignSignatures(dir);
				const entryPoint = context.getDesktopEntryPoint(dir);
				await testDesktopApp(entryPoint);
			} finally {
				context.unmountDmg(dir);
			}
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
				await testDesktopApp(entryPoint, undefined, linuxLaunchers(context, entryPoint));
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
				await testDesktopApp(entryPoint, undefined, linuxLaunchers(context, entryPoint));
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
				await testDesktopApp(entryPoint, undefined, linuxLaunchers(context, entryPoint));
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
				await testDesktopApp(entryPoint, undefined, linuxLaunchers(context, entryPoint));
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
				await testDesktopApp(entryPoint, undefined, linuxLaunchers(context, entryPoint));
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
				await testDesktopApp(entryPoint, undefined, linuxLaunchers(context, entryPoint));
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
			await testWindowsInstallation('system', packagePath);
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
			await testWindowsInstallation('user', packagePath);
		}
	});

	context.test('desktop-win32-x64', ['windows', 'x64', 'desktop'], async () => {
		const packagePath = await context.downloadTarget('win32-x64');
		context.validateAuthenticodeSignature(packagePath);
		context.validateVersionInfo(packagePath);
		if (!context.options.downloadOnly) {
			await testWindowsInstallation('system', packagePath);
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
			await testWindowsInstallation('user', packagePath);
		}
	});

	async function testWindowsInstallation(type: 'user' | 'system', packagePath: string) {
		const entryPoint = context.installWindowsApp(type, packagePath, true);
		try {
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			context.validateAllVersionInfo(path.dirname(entryPoint));
			await testDesktopApp(entryPoint, undefined, windowsLaunchers(context, entryPoint, type));
		} finally {
			await context.uninstallWindowsApp(type);
		}
	}

	async function testDesktopApp(entryPoint: string, dataDir?: string, launchers: DesktopLauncher[] = []) {
		if (process.platform === 'darwin') {
			launchers = macOSLaunchers(context, entryPoint);
		}
		const test = new UITest(context, dataDir);
		const args = dataDir ? [] : [
			'--extensions-dir', test.extensionsDir,
			'--user-data-dir', test.userDataDir,
		];
		const crashDumpsDir = context.getCrashDumpsDir();
		if (crashDumpsDir) {
			args.push('--crash-reporter-directory', crashDumpsDir);
		}
		args.push(test.workspaceDir);

		context.log(`Starting VS Code ${entryPoint} with args ${args.join(' ')}`);
		const app = await _electron.launch({ executablePath: entryPoint, args });
		try {
			const window = await context.getPage(app.firstWindow());
			await test.run(window);
			for (const [index, launcher] of launchers.entries()) {
				context.log(`Validating launcher: ${launcher.name}`);
				const fileName = `launcher-${index}-${context.getRandomToken()}.txt`;
				const filePath = path.join(test.workspaceDir, fileName);
				fs.writeFileSync(filePath, launcher.name);
				launcher.launch([
					'--user-data-dir', test.userDataDir,
					'--extensions-dir', test.extensionsDir,
					'--reuse-window', filePath,
				]);
				await window.locator('.editor-group-container .tab').filter({ hasText: fileName }).waitFor({ state: 'visible', timeout: 30_000 });
			}
		} finally {
			await context.closeElectronApp(app);
		}

		test.validate();
	}
}
