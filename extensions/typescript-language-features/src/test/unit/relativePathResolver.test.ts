/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { RelativeWorkspacePathResolver } from '../../utils/relativePathResolver';

suite('RelativeWorkspacePathResolver', () => {
	let workspaceFoldersStub: sinon.SinonStub | undefined;

	teardown(() => {
		sinon.restore();
		workspaceFoldersStub = undefined;
	});

	function mockWorkspaceFolders(folders: { name: string; fsPath: string }[] | undefined) {
		const mapped = folders?.map((folder, index) => ({
			name: folder.name,
			uri: vscode.Uri.file(folder.fsPath),
			index,
		}));
		if (workspaceFoldersStub) {
			workspaceFoldersStub.value(mapped);
		} else {
			workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value(mapped);
		}
	}

	test('returns undefined when workspace has no workspace folders', () => {
		mockWorkspaceFolders(undefined);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('x/lib'),
			undefined
		);

		mockWorkspaceFolders([]);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('x/lib'),
			undefined
		);
	});

	test('returns undefined in single-root workspace even if path starts with root folder name', () => {
		const rootPath = path.resolve('/path/to/x');
		mockWorkspaceFolders([{ name: 'x', fsPath: rootPath }]);

		// In single-root workspaces, paths are already relative to the workspace root.
		// A leading segment matching root.name is an actual subdirectory, not a multi-root prefix.
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('x/.yarn/sdks/typescript/lib'),
			undefined
		);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('./x/.yarn/sdks/typescript/lib'),
			undefined
		);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('node_modules/typescript/lib'),
			undefined
		);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('./node_modules/typescript/lib'),
			undefined
		);
	});

	test('resolves folder prefixes in multi-root workspace', () => {
		const clientPath = path.resolve('/path/to/client');
		const serverPath = path.resolve('/path/to/server');
		mockWorkspaceFolders([
			{ name: 'client', fsPath: clientPath },
			{ name: 'server', fsPath: serverPath },
		]);

		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('client/node_modules/typescript/lib'),
			path.join(clientPath, 'node_modules/typescript/lib')
		);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('./client/node_modules/typescript/lib'),
			path.join(clientPath, 'node_modules/typescript/lib')
		);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('server/lib/tsserver.js'),
			path.join(serverPath, 'lib/tsserver.js')
		);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('./server/lib/tsserver.js'),
			path.join(serverPath, 'lib/tsserver.js')
		);
	});

	test('correctly preserves subdirectories with same name as root in multi-root workspace', () => {
		const clientPath = path.resolve('/path/to/client');
		const serverPath = path.resolve('/path/to/server');
		mockWorkspaceFolders([
			{ name: 'client', fsPath: clientPath },
			{ name: 'server', fsPath: serverPath },
		]);

		// Path points to a nested directory also named 'client' inside the 'client' root
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('client/client/nested/lib'),
			path.join(clientPath, 'client/nested/lib')
		);
	});

	test('returns undefined in multi-root workspace if prefix does not match any root', () => {
		const clientPath = path.resolve('/path/to/client');
		const serverPath = path.resolve('/path/to/server');
		mockWorkspaceFolders([
			{ name: 'client', fsPath: clientPath },
			{ name: 'server', fsPath: serverPath },
		]);

		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('unknown/node_modules/typescript/lib'),
			undefined
		);
		assert.strictEqual(
			RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('node_modules/typescript/lib'),
			undefined
		);
	});
});
