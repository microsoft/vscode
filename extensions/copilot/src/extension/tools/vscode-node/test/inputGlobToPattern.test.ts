/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { RelativePattern } from '../../../../platform/filesystem/common/fileTypes';
import { IRemoteRepositoriesService } from '../../../../platform/remoteRepositories/vscode/remoteRepositories';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { ExtensionTextDocumentManager } from '../../../../platform/workspace/vscode/workspaceServiceImpl';
import { inputGlobToPattern } from '../../node/toolUtils';

suite('inputGlobToPattern - integration', () => {
	let service: ExtensionTextDocumentManager;
	let testFolder: vscode.WorkspaceFolder;
	let addedWorkspaceFolder: boolean;

	suiteSetup(async () => {
		service = new ExtensionTextDocumentManager(
			new TestLogService(),
			{ _serviceBrand: undefined, loadWorkspaceContents: () => Promise.resolve(false) } satisfies IRemoteRepositoriesService,
		);

		// Ensure we have a workspace folder for testing
		if (!vscode.workspace.workspaceFolders?.length) {
			const tmpDir = path.join(os.tmpdir(), 'copilot-test-workspace');
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpDir));
			vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.file(tmpDir) });
			addedWorkspaceFolder = true;

			// Wait for workspace folders to update
			await new Promise<void>(resolve => {
				const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
					disposable.dispose();
					resolve();
				});
			});
		}

		testFolder = vscode.workspace.workspaceFolders![0];
	});

	suiteTeardown(async () => {
		if (addedWorkspaceFolder) {
			vscode.workspace.updateWorkspaceFolders(0, 1);
			await new Promise<void>(resolve => {
				const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
					disposable.dispose();
					resolve();
				});
			});
		}
	});

	test('absolute path to workspace folder root resolves to RelativePattern', function () {
		const result = inputGlobToPattern(testFolder.uri.fsPath, service, undefined);

		assert.strictEqual(result.patterns.length, 1);
		const pattern = result.patterns[0] as RelativePattern;
		assert.ok(pattern.pattern === '' || pattern.pattern === '**', `Expected '' or '**', got '${pattern.pattern}'`);
		assert.strictEqual(pattern.baseUri.path, testFolder.uri.path);
	});

	test('absolute path to subfolder within workspace', function () {
		const subPath = `${testFolder.uri.fsPath}/src`;
		const result = inputGlobToPattern(subPath, service, undefined);

		assert.strictEqual(result.patterns.length, 1);
		const pattern = result.patterns[0] as RelativePattern;
		assert.strictEqual(pattern.pattern, 'src');
		assert.strictEqual(pattern.baseUri.path, testFolder.uri.path);
	});

	test('absolute path with glob pattern within workspace', function () {
		const globPath = `${testFolder.uri.fsPath}/src/**/*.ts`;
		const result = inputGlobToPattern(globPath, service, undefined);

		assert.strictEqual(result.patterns.length, 1);
		const pattern = result.patterns[0] as RelativePattern;
		assert.strictEqual(pattern.pattern, 'src/**/*.ts');
		assert.strictEqual(pattern.baseUri.path, testFolder.uri.path);
	});

	test('absolute path outside workspace is not rewritten', function () {
		const result = inputGlobToPattern('/tmp/nonexistent/path', service, undefined);

		assert.strictEqual(result.patterns.length, 1);
		assert.strictEqual(result.patterns[0], '/tmp/nonexistent/path');
		assert.strictEqual(result.folderName, undefined);
	});
});
