/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { isSafeCopyDestination, resolveCopyDestination } from '../languageFeatures/copyFiles/copyFiles';


suite('resolveCopyDestination', () => {

	test('Relative destinations should resolve next to document', async () => {
		const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');

		{
			const dest = resolveCopyDestination(documentUri, 'img.png', '${fileName}', () => vscode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
		}
		{
			const dest = resolveCopyDestination(documentUri, 'img.png', './${fileName}', () => vscode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
		}
		{
			const dest = resolveCopyDestination(documentUri, 'img.png', '../${fileName}', () => vscode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
		}
	});

	test('Destination starting with / should go to workspace root', async () => {
		const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '/${fileName}', () => vscode.Uri.parse('test://projects/project/'));

		assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
	});

	test('If there is no workspace root, / should resolve to document dir', async () => {
		const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '/${fileName}', () => undefined);

		assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
	});

	test('If path ends in /, we should automatically add the fileName', async () => {
		{
			const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
			const dest = resolveCopyDestination(documentUri, 'img.png', 'images/', () => vscode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/images/img.png');
		}
		{
			const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
			const dest = resolveCopyDestination(documentUri, 'img.png', './', () => vscode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
		}
		{
			const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
			const dest = resolveCopyDestination(documentUri, 'img.png', '/', () => vscode.Uri.parse('test://projects/project/'));

			assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
		}
	});

	test('Basic transform', async () => {
		const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '${fileName/.png/.gif/}', () => undefined);

		assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.gif');
	});

	test('Transforms should support capture groups', async () => {
		const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '${fileName/(.+)\\.(.+)/$2.$1/}', () => undefined);

		assert.strictEqual(dest.toString(), 'test://projects/project/sub/png.img');
	});

	test('Should support escaping snippet variables ', async () => {
		const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');

		// Escape leading '$'
		assert.strictEqual(
			resolveCopyDestination(documentUri, 'img.png', '\\${fileName}', () => undefined).toString(true),
			'test://projects/project/sub/${fileName}');

		// Escape closing '}'
		assert.strictEqual(
			resolveCopyDestination(documentUri, 'img.png', '${fileName\\}', () => undefined).toString(true),
			'test://projects/project/sub/${fileName\\}');
	});

	test('Transforms should support escaped slashes', async () => {
		const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '${fileName/(.+)/x\\/y/}.${fileExtName}', () => undefined);

		assert.strictEqual(dest.toString(), 'test://projects/project/sub/x/y.png');
	});
});

suite('isSafeCopyDestination', () => {
	const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
	const workspaceFolder = vscode.Uri.parse('test://projects/project');
	const getWorkspaceFolder = (uri: vscode.Uri) => uri.authority === 'projects' && (uri.path + '/').startsWith('/project/') ? workspaceFolder : undefined;

	/** A file system where the given paths exist, with links marked by a trailing `@`. */
	function createFs(entries: readonly string[]): Pick<vscode.FileSystem, 'stat'> {
		return {
			stat: async uri => {
				const entry = entries.find(e => e.replace(/@$/, '') === uri.path);
				if (!entry) {
					throw vscode.FileSystemError.FileNotFound(uri);
				}
				const type = entry.endsWith('@') ? vscode.FileType.Directory | vscode.FileType.SymbolicLink : vscode.FileType.Directory;
				return { type, ctime: 0, mtime: 0, size: 0 };
			}
		};
	}

	function isSafe(dest: string, options?: { readonly fs?: Pick<vscode.FileSystem, 'stat'>; readonly noWorkspace?: boolean }): Promise<boolean> {
		const getFolder = options?.noWorkspace ? () => undefined : getWorkspaceFolder;
		return isSafeCopyDestination(documentUri, resolveCopyDestination(documentUri, 'img.png', dest, getFolder), getFolder, options?.fs ?? createFs([]));
	}

	test('Allows destinations inside the workspace folder', async () => {
		assert.deepStrictEqual(
			await Promise.all(['${fileName}', '../${fileName}', '/images/', 'images/../../${fileName}'].map(dest => isSafe(dest))),
			[true, true, true, true]);
	});

	test('Rejects destinations outside the workspace folder', async () => {
		assert.deepStrictEqual(
			await Promise.all(['../../${fileName}', '../../../AppData/settings.json', '/../${fileName}', '../../project-other/${fileName}'].map(dest => isSafe(dest))),
			[false, false, false, false]);
	});

	test('Rejects backslashes, which are separators on Windows but not on POSIX', async () => {
		assert.deepStrictEqual(
			await Promise.all(['..\\..\\img.png', '../../project\\other/img.png', 'images\\img.png'].map(dest => isSafe(dest))),
			[false, false, false]);
	});

	test('Rejects absolute destinations on another authority', async () => {
		const fs = createFs([]);
		assert.strictEqual(await isSafeCopyDestination(documentUri, vscode.Uri.parse('test://other/project/img.png'), getWorkspaceFolder, fs), false);
		assert.strictEqual(await isSafeCopyDestination(documentUri, vscode.Uri.parse('file:///project/img.png'), getWorkspaceFolder, fs), false);
	});

	test('Without a workspace folder, only allows the document directory', async () => {
		assert.deepStrictEqual(
			await Promise.all(['${fileName}', 'images/', '../${fileName}'].map(dest => isSafe(dest, { noWorkspace: true }))),
			[true, true, false]);
	});

	test('Rejects destinations through symbolic links or junctions', async () => {
		const fs = createFs(['/project/sub@', '/project/images', '/project/images/linked@', '/project/images/img.png@']);
		assert.deepStrictEqual(
			await Promise.all(['${fileName}', '/images/linked/', '/images/${fileName}', '/images/new/'].map(dest => isSafe(dest, { fs }))),
			[false, false, false, true]);
	});

	test('Uses the path casing rules of the workspace folder', async () => {
		const folder = vscode.workspace.workspaceFolders![0].uri;
		const fileInFolder = vscode.Uri.joinPath(folder, 'sub', 'readme.md');
		const destWithOtherCasing = folder.with({ path: folder.path.toUpperCase() + '/img.png' });
		const getFolder = (uri: vscode.Uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri;
		assert.strictEqual(
			await isSafeCopyDestination(fileInFolder, destWithOtherCasing, getFolder, createFs([])),
			process.platform !== 'linux');
	});
});
