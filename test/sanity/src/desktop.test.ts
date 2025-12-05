/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { _electron } from 'playwright';
import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('Desktop', () => {
		it('darwin', async () => {
			const dir = await context.downloadAndUnpack('darwin');
			const entryPoint = context.installMacApp(dir);
			await testDesktopApp(entryPoint);
		});

		it('darwin-arm64', async () => {
			const dir = await context.downloadAndUnpack('darwin-arm64');
			const entryPoint = context.installMacApp(dir);
			await testDesktopApp(entryPoint);
		});

		it('darwin-universal', async () => {
			const dir = await context.downloadAndUnpack('darwin-universal');
			const entryPoint = context.installMacApp(dir);
			await testDesktopApp(entryPoint);
		});

		it('linux-arm64', async () => {
			const dir = await context.downloadAndUnpack('linux-arm64');
			const entryPoint = context.getEntryPoint('desktop', dir);
			await testDesktopApp(entryPoint);
		});

		it('linux-armhf', async () => {
			const dir = await context.downloadAndUnpack('linux-armhf');
			const entryPoint = context.getEntryPoint('desktop', dir);
			await testDesktopApp(entryPoint);
		});

		it('linux-deb-arm64', async () => {
			const packagePath = await context.downloadTarget('linux-deb-arm64');
			const entryPoint = context.installDeb(packagePath);
			await testDesktopApp(entryPoint);
		});

		it('linux-deb-armhf', async () => {
			const packagePath = await context.downloadTarget('linux-deb-armhf');
			const entryPoint = context.installDeb(packagePath);
			await testDesktopApp(entryPoint);
		});

		it('linux-deb-x64', async () => {
			const packagePath = await context.downloadTarget('linux-deb-x64');
			const entryPoint = context.installDeb(packagePath);
			await testDesktopApp(entryPoint);
		});

		it('linux-rpm-arm64', async () => {
			const packagePath = await context.downloadTarget('linux-rpm-arm64');
			const entryPoint = context.installRpm(packagePath);
			await testDesktopApp(entryPoint);
		});

		it('linux-rpm-armhf', async () => {
			const packagePath = await context.downloadTarget('linux-rpm-armhf');
			const entryPoint = context.installRpm(packagePath);
			await testDesktopApp(entryPoint);
		});

		it('linux-rpm-x64', async () => {
			const packagePath = await context.downloadTarget('linux-rpm-x64');
			const entryPoint = context.installRpm(packagePath);
			await testDesktopApp(entryPoint);
		});

		it('linux-snap-x64', async () => {
			const packagePath = await context.downloadTarget('linux-snap-x64');
			const entryPoint = context.installSnap(packagePath);
			await testDesktopApp(entryPoint);
		});

		it('linux-x64', async () => {
			const dir = await context.downloadAndUnpack('linux-x64');
			const entryPoint = context.getEntryPoint('desktop', dir);
			await testDesktopApp(entryPoint);
		});

		it('win32-arm64', async () => {
			const packagePath = await context.downloadTarget('win32-arm64');
			context.validateSignature(packagePath);
			const entryPoint = context.installWindowsApp('system', packagePath);
			context.validateAllSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
		});

		it('win32-arm64-archive', async () => {
			const dir = await context.downloadAndUnpack('win32-arm64-archive');
			context.validateAllSignatures(dir);
			const entryPoint = context.getEntryPoint('desktop', dir);
			await testDesktopApp(entryPoint);
		});

		it('win32-arm64-user', async () => {
			const packagePath = await context.downloadTarget('win32-arm64-user');
			context.validateSignature(packagePath);
			const entryPoint = context.installWindowsApp('user', packagePath);
			context.validateAllSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
		});

		it('win32-x64', async () => {
			const packagePath = await context.downloadTarget('win32-x64');
			context.validateSignature(packagePath);
			const entryPoint = context.installWindowsApp('system', packagePath);
			context.validateAllSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
		});

		it('win32-x64-archive', async () => {
			const dir = await context.downloadAndUnpack('win32-x64-archive');
			context.validateAllSignatures(dir);
			const entryPoint = context.getEntryPoint('desktop', dir);
			await testDesktopApp(entryPoint);
		});

		it('win32-x64-user', async () => {
			const packagePath = await context.downloadTarget('win32-x64-user');
			context.validateSignature(packagePath);
			const entryPoint = context.installWindowsApp('user', packagePath);
			context.validateAllSignatures(path.dirname(entryPoint));
			await testDesktopApp(entryPoint);
		});

		async function testDesktopApp(executablePath: string) {
			const extensionsDir = context.createTempDir();
			const dataDir = context.createTempDir();
			const workspaceDir = context.createTempDir();
			const args = ['--extensions-dir', extensionsDir, '--user-data-dir', dataDir, workspaceDir];

			context.log(`Start VS Code: ${executablePath} with args: ${args.join(' ')}`);
			const app = await _electron.launch({ executablePath, args });
			const window = await app.firstWindow();

			context.log('Dismiss workspace trust dialog');
			await window.getByText('Yes, I trust the authors').click();

			context.log('Focus Explorer view');
			await window.keyboard.press('Control+Shift+E');

			context.log('Click New File button');
			await window.getByLabel('New File...').click();

			context.log('Type file name');
			await window.locator('input').fill('helloWorld.txt');
			await window.keyboard.press('Enter');

			context.log('Focus the code editor');
			await window.getByText(/Start typing/).focus();

			context.log('Type some content into the file');
			await window.keyboard.type('Hello, World!');

			context.log('Save the file');
			await window.keyboard.press('Control+S');

			context.log('Open Extensions view');
			await window.keyboard.press('Control+Shift+X');
			await window.waitForSelector('.extension-list-item');

			context.log('Type extension name to search for');
			await window.keyboard.type('GitHub Pull Requests');
			await new Promise(resolve => setTimeout(resolve, 2000));

			context.log('Click Install on the first extension in the list');
			await window.locator('.extension-action:not(.disabled)', { hasText: /Install/ }).first().click();

			context.log('Wait for extension to be installed');
			await window.locator('.extension-action:not(.disabled)', { hasText: /Uninstall/ }).waitFor();

			context.log('Close the application');
			await app.close();

			context.log('Verify file contents');
			const filePath = `${workspaceDir}/helloWorld.txt`;
			const fileContents = fs.readFileSync(filePath, 'utf-8');
			assert.strictEqual(fileContents, 'Hello, World!');

			context.log('Verify extension is installed');
			const extensions = fs.readdirSync(extensionsDir);
			const hasExtension = extensions.some(ext => ext.startsWith('github.vscode-pull-request-github'));
			assert.strictEqual(hasExtension, true);
		}
	});
}
