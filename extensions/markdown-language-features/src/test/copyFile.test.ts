/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { isCopyDestinationInsideWorkspace, resolveCopyDestination } from '../languageFeatures/copyFiles/copyFiles';


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

suite('isCopyDestinationInsideWorkspace', () => {
	const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
	const workspaceFolder = () => vscode.Uri.parse('test://projects/project/');

	function isInside(dest: string, getWorkspaceFolder: () => vscode.Uri | undefined = workspaceFolder): boolean {
		return isCopyDestinationInsideWorkspace(documentUri, resolveCopyDestination(documentUri, 'img.png', dest, getWorkspaceFolder), getWorkspaceFolder);
	}

	test('Allows destinations inside the workspace folder', () => {
		assert.deepStrictEqual(
			['${fileName}', '../${fileName}', '/images/', 'images/../../${fileName}'].map(dest => isInside(dest)),
			[true, true, true, true]);
	});

	test('Rejects destinations outside the workspace folder', () => {
		assert.deepStrictEqual(
			['../../${fileName}', '../../../AppData/settings.json', '/../${fileName}', '../../project-other/${fileName}', '..\\..\\img.png'].map(dest => isInside(dest)),
			[false, false, false, false, false]);
	});

	test('Rejects absolute destinations on another authority', () => {
		assert.strictEqual(isCopyDestinationInsideWorkspace(documentUri, vscode.Uri.parse('test://other/project/img.png'), workspaceFolder), false);
		assert.strictEqual(isCopyDestinationInsideWorkspace(documentUri, vscode.Uri.parse('file:///project/img.png'), workspaceFolder), false);
	});

	test('Without a workspace folder, only allows the document directory', () => {
		assert.deepStrictEqual(
			['${fileName}', 'images/', '../${fileName}'].map(dest => isInside(dest, () => undefined)),
			[true, true, false]);
	});

	test('Ignores drive letter casing', () => {
		const fileDocumentUri = vscode.Uri.file('c:\\project\\sub\\readme.md');
		const folder = vscode.Uri.from({ scheme: 'file', path: '/C:/project' });
		assert.deepStrictEqual(
			['/c:/project/sub/img.png', '/C:/project/img.png', '/c:/other/img.png'].map(p => isCopyDestinationInsideWorkspace(fileDocumentUri, vscode.Uri.from({ scheme: 'file', path: p }), () => folder)),
			[true, true, false]);
	});
});
