/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { _electron } from 'playwright';
import { TestContext } from './context';
import { UITest } from './uiTest';

export function setup(context: TestContext) {
	describe('Desktop', () => {
		if (context.platform === 'darwin-x64') {
			it('desktop-darwin', async () => {
				const dir = await context.downloadAndUnpack('darwin');
				const entryPoint = context.installMacApp(dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'darwin-arm64') {
			it('desktop-darwin-arm64', async () => {
				const dir = await context.downloadAndUnpack('darwin-arm64');
				const entryPoint = context.installMacApp(dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform.startsWith('darwin-')) {
			it('desktop-darwin-universal', async () => {
				const dir = await context.downloadAndUnpack('darwin-universal');
				const entryPoint = context.installMacApp(dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm64') {
			it('desktop-linux-arm64', async () => {
				const dir = await context.downloadAndUnpack('linux-arm64');
				const entryPoint = context.getEntryPoint('desktop', dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm') {
			it('desktop-linux-armhf', async () => {
				const dir = await context.downloadAndUnpack('linux-armhf');
				const entryPoint = context.getEntryPoint('desktop', dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm64') {
			it('desktop-linux-deb-arm64', async () => {
				const packagePath = await context.downloadTarget('linux-deb-arm64');
				const entryPoint = context.installDeb(packagePath);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm') {
			it('desktop-linux-deb-armhf', async () => {
				const packagePath = await context.downloadTarget('linux-deb-armhf');
				const entryPoint = context.installDeb(packagePath);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('desktop-linux-deb-x64', async () => {
				const packagePath = await context.downloadTarget('linux-deb-x64');
				const entryPoint = context.installDeb(packagePath);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm64') {
			it('desktop-linux-rpm-arm64', async () => {
				const packagePath = await context.downloadTarget('linux-rpm-arm64');
				const entryPoint = context.installRpm(packagePath);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm') {
			it('desktop-linux-rpm-armhf', async () => {
				const packagePath = await context.downloadTarget('linux-rpm-armhf');
				const entryPoint = context.installRpm(packagePath);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('desktop-linux-rpm-x64', async () => {
				const packagePath = await context.downloadTarget('linux-rpm-x64');
				const entryPoint = context.installRpm(packagePath);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('desktop-linux-snap-x64', async () => {
				const packagePath = await context.downloadTarget('linux-snap-x64');
				const entryPoint = context.installSnap(packagePath);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('desktop-linux-x64', async () => {
				const dir = await context.downloadAndUnpack('linux-x64');
				const entryPoint = context.getEntryPoint('desktop', dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'win32-arm64') {
			it('desktop-win32-arm64', async () => {
				const packagePath = await context.downloadTarget('win32-arm64');
				context.validateSignature(packagePath);
				const entryPoint = context.installWindowsApp('system', packagePath);
				context.validateAllSignatures(path.dirname(entryPoint));
				await testDesktopApp(entryPoint);
				await context.uninstallWindowsApp('system');
			});
		}

		if (context.platform === 'win32-arm64') {
			it('desktop-win32-arm64-archive', async () => {
				const dir = await context.downloadAndUnpack('win32-arm64-archive');
				context.validateAllSignatures(dir);
				const entryPoint = context.getEntryPoint('desktop', dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'win32-arm64') {
			it('desktop-win32-arm64-user', async () => {
				const packagePath = await context.downloadTarget('win32-arm64-user');
				context.validateSignature(packagePath);
				const entryPoint = context.installWindowsApp('user', packagePath);
				context.validateAllSignatures(path.dirname(entryPoint));
				await testDesktopApp(entryPoint);
				await context.uninstallWindowsApp('user');
			});
		}

		if (context.platform === 'win32-x64') {
			it('desktop-win32-x64', async () => {
				const packagePath = await context.downloadTarget('win32-x64');
				context.validateSignature(packagePath);
				const entryPoint = context.installWindowsApp('system', packagePath);
				context.validateAllSignatures(path.dirname(entryPoint));
				await testDesktopApp(entryPoint);
				await context.uninstallWindowsApp('system');
			});
		}

		if (context.platform === 'win32-x64') {
			it('desktop-win32-x64-archive', async () => {
				const dir = await context.downloadAndUnpack('win32-x64-archive');
				context.validateAllSignatures(dir);
				const entryPoint = context.getEntryPoint('desktop', dir);
				await testDesktopApp(entryPoint);
			});
		}

		if (context.platform === 'win32-x64') {
			it('desktop-win32-x64-user', async () => {
				const packagePath = await context.downloadTarget('win32-x64-user');
				context.validateSignature(packagePath);
				const entryPoint = context.installWindowsApp('user', packagePath);
				context.validateAllSignatures(path.dirname(entryPoint));
				await testDesktopApp(entryPoint);
				await context.uninstallWindowsApp('user');
			});
		}

		async function testDesktopApp(entryPoint: string) {
			const test = new UITest(context);
			const args = [
				'--extensions-dir', test.extensionsDir,
				'--user-data-dir', test.userDataDir,
				test.workspaceDir
			];

			context.log(`Starting VS Code ${entryPoint} with args ${args.join(' ')}`);
			const app = await _electron.launch({ executablePath: entryPoint, args });
			const window = await app.firstWindow();

			await test.run(window);

			context.log('Closing the application');
			await app.close();

			test.validate();
		}
	});
}
