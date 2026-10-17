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
import type FileConfigurationManager from '../../languageFeatures/fileConfigurationManager';
import { register } from '../../languageFeatures/updatePathsOnRename';
import type * as Proto from '../../tsServer/protocol/protocol';
import { ClientCapability, ITypeScriptServiceClient } from '../../typescriptService';
import { disposeAll } from '../../utils/dispose';

suite('Update paths on rename', () => {
	const disposables: vscode.Disposable[] = [];
	let directory: string;

	setup(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-update-imports-'));
	});

	teardown(async () => {
		disposeAll(disposables.splice(0));
		await fs.rm(directory, { recursive: true, force: true });
	});

	for (const extension of ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs']) {
		for (const moveDirectory of [false, true]) {
			test(`requests import updates when moving ${moveDirectory ? 'a directory containing' : 'a'} .${extension} file`, async () => {
				const folder = vscode.Uri.file(path.join(directory, 'before'));
				const file = vscode.Uri.joinPath(folder, `module.${extension}`);
				await vscode.workspace.fs.createDirectory(folder);
				await vscode.workspace.fs.writeFile(file, Buffer.from('export const value = 1;\n'));
				const oldUri = moveDirectory ? folder : file;
				const newUri = moveDirectory ? vscode.Uri.file(path.join(directory, 'after')) : vscode.Uri.joinPath(folder, `renamed.${extension}`);

				const request = new Promise<Proto.GetEditsForFileRenameRequestArgs>(resolve => {
					const client = {
						capabilities: new Set([ClientCapability.Semantic]),
						onDidChangeCapabilities: () => vscode.Disposable.from(),
						toTsFilePath: (uri: vscode.Uri) => uri.fsPath,
						getWorkspaceRootForResource: () => vscode.Uri.file(directory),
						bufferSyncSupport: { closeResource() { }, openTextDocument() { } },
						interruptGetErr: <R>(callback: () => R) => callback(),
						execute: async (command: string, args: Proto.GetEditsForFileRenameRequestArgs) => {
							assert.strictEqual(command, 'getEditsForFileRename');
							resolve(args);
							return { type: 'response', body: [] };
						},
					} as unknown as ITypeScriptServiceClient;
					const configurationManager = { setGlobalConfigurationFromDocument() { } } as unknown as FileConfigurationManager;
					disposables.push(register(client, configurationManager, async uri => uri.path.endsWith(`.${extension}`)));
				});

				const edit = new vscode.WorkspaceEdit();
				edit.renameFile(oldUri, newUri);
				assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
				assert.deepStrictEqual(await request, { oldFilePath: oldUri.fsPath, newFilePath: newUri.fsPath });
			}).timeout(5000);
		}
	}
});
