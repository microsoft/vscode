/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ElectronServiceConfigurationProvider } from '../../configuration/configuration.electron';
import { DiskTypeScriptVersionProvider } from '../../tsServer/versionProvider.electron';

suite('TypeScript version provider', () => {
	const configurationProvider = new ElectronServiceConfigurationProvider();
	let directory: string;
	let firstAddedFolder: number;
	let previousTsdk: string | undefined;
	let folders: { uri: vscode.Uri; name: string }[];

	suiteSetup(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-tsdk-'));
		folders = [
			{ uri: vscode.Uri.file(path.join(directory, 'first', 'project')), name: 'First project' },
			{ uri: vscode.Uri.file(path.join(directory, 'second', 'project')), name: 'Second project' },
		];
		for (const folder of folders) {
			await fs.mkdir(folder.uri.fsPath, { recursive: true });
		}
		firstAddedFolder = vscode.workspace.workspaceFolders!.length;
		await updateWorkspaceFolders(firstAddedFolder, 0, ...folders);
	});

	setup(() => {
		previousTsdk = vscode.workspace.getConfiguration('js/ts').inspect<string>('tsdk.path')?.workspaceValue;
	});

	teardown(async () => {
		await vscode.workspace.getConfiguration('js/ts').update('tsdk.path', previousTsdk, vscode.ConfigurationTarget.Workspace);
	});

	suiteTeardown(async () => {
		await updateWorkspaceFolders(firstAddedFolder, folders.length);
		await fs.rm(directory, { recursive: true, force: true });
	});

	for (const relativePath of [
		'node_modules/typescript/lib',
		'./node_modules/typescript/lib',
		'../common/node_modules/typescript/lib',
		'../../shared/node_modules/typescript/lib',
		'nested/../../common/node_modules/typescript/lib',
	]) {
		test(`preserves the selected SDK when persisting ${relativePath}`, async () => {
			const serverPaths = folders.map(folder => path.join(folder.uri.fsPath, relativePath, 'tsserver.js'));
			for (const serverPath of serverPaths) {
				await fs.mkdir(path.dirname(serverPath), { recursive: true });
				await fs.writeFile(serverPath, '');
				await fs.writeFile(path.join(path.dirname(serverPath), '..', 'package.json'), JSON.stringify({ version: '6.0.3' }));
			}

			await vscode.workspace.getConfiguration('js/ts').update('tsdk.path', relativePath, vscode.ConfigurationTarget.Workspace);
			const versions = new DiskTypeScriptVersionProvider(configurationProvider.loadFromWorkspace()).localVersions;
			for (const serverPath of new Set(serverPaths)) {
				const selected = versions.find(version => version.path === serverPath);
				assert.ok(selected?.isValid);
				// The version picker persists the selected version's path label.
				await vscode.workspace.getConfiguration('js/ts').update('tsdk.path', selected.pathLabel, vscode.ConfigurationTarget.Workspace);
				const reloaded = new DiskTypeScriptVersionProvider(configurationProvider.loadFromWorkspace()).localVersion;
				assert.deepStrictEqual({ path: reloaded?.path, valid: reloaded?.isValid }, { path: serverPath, valid: true });
			}
		});
	}
});

async function updateWorkspaceFolders(start: number, deleteCount: number, ...folders: { uri: vscode.Uri; name: string }[]): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const subscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			subscription.dispose();
			resolve();
		});
		if (!vscode.workspace.updateWorkspaceFolders(start, deleteCount, ...folders)) {
			subscription.dispose();
			reject(new Error('Could not update test workspace folders'));
		}
	});
}
