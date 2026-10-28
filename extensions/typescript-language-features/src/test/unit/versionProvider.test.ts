/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ElectronServiceConfigurationProvider } from '../../configuration/configuration.electron';
import { DiskTypeScriptVersionProvider } from '../../tsServer/versionProvider.electron';

suite('TypeScript SDK paths', () => {
	const configurationProvider = new ElectronServiceConfigurationProvider();
	let folder: vscode.WorkspaceFolder;
	let sdkDirectory: string;
	let serverPath: string;
	let temporaryDirectory: string;
	let createdSdk = false;
	let previousTsdk: string | undefined;

	suiteSetup(async () => {
		folder = vscode.workspace.workspaceFolders![0];
		sdkDirectory = path.join(folder.uri.fsPath, 'node_modules', 'typescript');
		serverPath = path.join(sdkDirectory, 'lib', 'tsserver.js');
		if (!await fs.stat(sdkDirectory).then(() => true, () => false)) {
			createdSdk = true;
			await createSdk(path.join(sdkDirectory, 'lib'));
		}
		temporaryDirectory = await fs.mkdtemp(path.join(folder.uri.fsPath, '.vscode-tsdk-paths-'));
	});

	setup(async () => {
		previousTsdk = vscode.workspace.getConfiguration('js/ts').inspect<string>('tsdk.path')?.workspaceValue;
		await vscode.workspace.getConfiguration('js/ts').update('tsdk.path', undefined, vscode.ConfigurationTarget.Workspace);
	});

	teardown(async () => {
		await vscode.workspace.getConfiguration('js/ts').update('tsdk.path', previousTsdk, vscode.ConfigurationTarget.Workspace);
	});

	suiteTeardown(async () => {
		if (createdSdk) {
			await fs.rm(sdkDirectory, { recursive: true, force: true });
		}
		await fs.rm(temporaryDirectory, { recursive: true, force: true });
	});

	test('generates portable paths for automatically discovered SDKs', () => {
		const version = new DiskTypeScriptVersionProvider().localVersions.find(version => version.path === serverPath);
		assert.deepStrictEqual(
			{ label: version?.pathLabel, path: version?.path, valid: version?.isValid },
			{ label: workspacePath('node_modules/typescript/lib'), path: serverPath, valid: true },
		);
	});

	test('resolves automatically generated paths after saving and reloading settings', async () => {
		const version = new DiskTypeScriptVersionProvider().localVersions.find(version => version.path === serverPath);
		assert.ok(version);
		await assertSdkSetting(version.pathLabel, serverPath);
	});

	test('continues to read native-separator workspace paths', async () => {
		const sdkPath = vscode.workspace.workspaceFolders!.length > 1
			? path.join(folder.name, 'node_modules', 'typescript', 'lib')
			: path.join('node_modules', 'typescript', 'lib');
		await assertSdkSetting(sdkPath, serverPath);
	});

	test('continues to read absolute SDK paths', async () => {
		await assertSdkSetting(path.dirname(serverPath), serverPath);
	});

	test('preserves relative path segments when generating workspace selectors', async () => {
		const relativePath = `${path.basename(temporaryDirectory)}/../node_modules/typescript/lib`;
		await vscode.workspace.getConfiguration('js/ts').update('tsdk.path', relativePath, vscode.ConfigurationTarget.Workspace);
		const version = new DiskTypeScriptVersionProvider(configurationProvider.loadFromWorkspace()).localVersions
			.find(version => version.path === serverPath);
		assert.strictEqual(version?.pathLabel, workspacePath(relativePath));
		await assertSdkSetting(version!.pathLabel, serverPath);
	});

	if (process.platform !== 'win32') {
		test('preserves literal backslashes in configured POSIX paths', async () => {
			const sdkPath = path.join(temporaryDirectory, 'custom\\sdk', 'lib');
			await createSdk(sdkPath);
			await assertSdkSetting(workspacePath(`${path.basename(temporaryDirectory)}/custom\\sdk/lib`), path.join(sdkPath, 'tsserver.js'));
		});
	}

	function workspacePath(relativePath: string): string {
		return vscode.workspace.workspaceFolders!.length > 1 ? `${folder.name}/${relativePath}` : relativePath;
	}

	async function assertSdkSetting(value: string, expectedServerPath: string): Promise<void> {
		await vscode.workspace.getConfiguration('js/ts').update('tsdk.path', value, vscode.ConfigurationTarget.Workspace);
		const configuration = configurationProvider.loadFromWorkspace();
		const version = new DiskTypeScriptVersionProvider(configuration).localVersion;
		assert.deepStrictEqual(
			{ configured: configuration.localTsdk, label: version?.pathLabel, path: version?.path, valid: version?.isValid },
			{ configured: value, label: value, path: expectedServerPath, valid: true },
		);
	}
});

async function createSdk(directory: string): Promise<void> {
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(path.join(directory, 'tsserver.js'), '');
	await fs.writeFile(path.join(directory, '..', 'package.json'), JSON.stringify({ version: '6.0.3' }));
}
