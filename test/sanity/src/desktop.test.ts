/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { _electron } from 'playwright';
import { TestContext } from './context';
import { UITest } from './uiTest';

export function setup(context: TestContext) {
	context.test('desktop-darwin-x64', ['darwin', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('darwin');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getMacAppEntryPoint(dir);
		await testDesktopApp(entryPoint);
	});

	context.test('desktop-darwin-arm64', ['darwin', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('darwin-arm64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getMacAppEntryPoint(dir);
		await testDesktopApp(entryPoint);
	});

	context.test('desktop-darwin-universal', ['darwin'], async () => {
		const dir = await context.downloadAndUnpack('darwin-universal');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getMacAppEntryPoint(dir);
		await testDesktopApp(entryPoint);
	});

	context.test('desktop-linux-arm64', ['linux', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('linux-arm64');
		const entryPoint = context.getEntryPoint('desktop', dir);
		const dataDir = context.createPortableDataDir(dir);
		await testDesktopApp(entryPoint, dataDir);
	});

	context.test('desktop-linux-armhf', ['linux', 'arm32'], async () => {
		const dir = await context.downloadAndUnpack('linux-armhf');
		const entryPoint = context.getEntryPoint('desktop', dir);
		const dataDir = context.createPortableDataDir(dir);
		await testDesktopApp(entryPoint, dataDir);
	});

	context.test('desktop-linux-deb-arm64', ['linux', 'arm64', 'deb'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-arm64');
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installDeb(packagePath);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-linux-deb-armhf', ['linux', 'arm32', 'deb'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-armhf');
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installDeb(packagePath);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-linux-deb-x64', ['linux', 'x64', 'deb'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-x64');
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installDeb(packagePath);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-linux-rpm-arm64', ['linux', 'arm64', 'rpm'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-arm64');
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installRpm(packagePath);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-linux-rpm-armhf', ['linux', 'arm32', 'rpm'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-armhf');
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installRpm(packagePath);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-linux-rpm-x64', ['linux', 'x64', 'rpm'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-x64');
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installRpm(packagePath);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-linux-snap-x64', ['linux', 'x64', 'snap'], async () => {
		const packagePath = await context.downloadTarget('linux-snap-x64');
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installSnap(packagePath);
			await testDesktopApp(entryPoint);
		}
	});

	context.test('desktop-linux-x64', ['linux', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('linux-x64');
		const entryPoint = context.getEntryPoint('desktop', dir);
		const dataDir = context.createPortableDataDir(dir);
		await testDesktopApp(entryPoint, dataDir);
	});

	context.test('desktop-win32-arm64', ['windows', 'arm64'], async () => {
		const packagePath = await context.downloadTarget('win32-arm64');
		context.validateAuthenticodeSignature(packagePath);
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installWindowsApp('system', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('system');
		}
	});

	context.test('desktop-win32-arm64-archive', ['windows', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('win32-arm64-archive');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getEntryPoint('desktop', dir);
		const dataDir = context.createPortableDataDir(dir);
		await testDesktopApp(entryPoint, dataDir);
	});

	context.test('desktop-win32-arm64-user', ['windows', 'arm64'], async () => {
		const packagePath = await context.downloadTarget('win32-arm64-user');
		context.validateAuthenticodeSignature(packagePath);
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installWindowsApp('user', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('user');
		}
	});

	context.test('desktop-win32-x64', ['windows', 'x64'], async () => {
		const packagePath = await context.downloadTarget('win32-x64');
		context.validateAuthenticodeSignature(packagePath);
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installWindowsApp('system', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('system');
		}
	});

	context.test('desktop-win32-x64-archive', ['windows', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('win32-x64-archive');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getEntryPoint('desktop', dir);
		const dataDir = context.createPortableDataDir(dir);
		await testDesktopApp(entryPoint, dataDir);
	});

	context.test('desktop-win32-x64-user', ['windows', 'x64'], async () => {
		const packagePath = await context.downloadTarget('win32-x64-user');
		context.validateAuthenticodeSignature(packagePath);
		if (!context.skipRuntimeCheck) {
			const entryPoint = context.installWindowsApp('user', packagePath);
			context.validateAllAuthenticodeSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
			await context.uninstallWindowsApp('user');
		}
	});

	async function testDesktopApp(entryPoint: string, dataDir?: string) {
		if (context.skipRuntimeCheck) {
			return;
		}

		const test = new UITest(context, dataDir);
		const args = dataDir ? [] : [
			'--extensions-dir', test.extensionsDir,
			'--user-data-dir', test.userDataDir,
		];
		args.push(test.workspaceDir);

		context.log(`Starting VS Code ${entryPoint} with args ${args.join(' ')}`);
		const app = await _electron.launch({ executablePath: entryPoint, args });
		const window = await app.firstWindow();

		await test.run(window);

		context.log('Closing the application');
		await app.close();

		test.validate();
	}
}
