/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join } from '../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRawFileWorkspaceFolder, toWorkspaceIdentifier, Workspace, WorkspaceFolder } from '../../common/workspace.js';
import { toWorkspaceFolders } from '../../../workspaces/common/workspaces.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Workspace', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const fileFolder = isWindows ? 'c:\\src' : '/src';
	const abcFolder = isWindows ? 'c:\\abc' : '/abc';

	const testFolderUri = URI.file(join(fileFolder, 'test'));
	const mainFolderUri = URI.file(join(fileFolder, 'main'));
	const test1FolderUri = URI.file(join(fileFolder, 'test1'));
	const test2FolderUri = URI.file(join(fileFolder, 'test2'));
	const test3FolderUri = URI.file(join(fileFolder, 'test3'));
	const abcTest1FolderUri = URI.file(join(abcFolder, 'test1'));
	const abcTest3FolderUri = URI.file(join(abcFolder, 'test3'));

	const workspaceConfigUri = URI.file(join(fileFolder, 'test.code-workspace'));

	test('getFolder returns the folder with given uri', () => {
		const expected = new WorkspaceFolder({ uri: testFolderUri, name: '', index: 2 });
		const testObject = new Workspace('', [new WorkspaceFolder({ uri: mainFolderUri, name: '', index: 0 }), expected, new WorkspaceFolder({ uri: URI.file('/src/code'), name: '', index: 2 })], false, null, () => !isLinux);

		const actual = testObject.getFolder(expected.uri);

		assert.strictEqual(actual, expected);
	});

	test('getFolder returns the folder if the uri is sub', () => {
		const expected = new WorkspaceFolder({ uri: testFolderUri, name: '', index: 0 });
		const testObject = new Workspace('', [expected, new WorkspaceFolder({ uri: mainFolderUri, name: '', index: 1 }), new WorkspaceFolder({ uri: URI.file('/src/code'), name: '', index: 2 })], false, null, () => !isLinux);

		const actual = testObject.getFolder(URI.file(join(fileFolder, 'test/a')));

		assert.strictEqual(actual, expected);
	});

	test('single folder identifier uses the primary location', () => {
		const alternate = new Workspace('id', [new WorkspaceFolder({ uri: test1FolderUri, name: '', index: 0 })], false, null, () => !isLinux, undefined, { id: 'id', uri: mainFolderUri });
		const primary = new Workspace('id', [new WorkspaceFolder({ uri: mainFolderUri, name: '', index: 0 })], false, null, () => !isLinux);
		const updated = new Workspace('id', [new WorkspaceFolder({ uri: mainFolderUri, name: '', index: 0 })], false, null, () => !isLinux);
		updated.update(alternate);

		assert.deepStrictEqual(
			{ alternate: toWorkspaceIdentifier(alternate), primary: toWorkspaceIdentifier(primary), updated: updated.identity, json: JSON.stringify(alternate.toJSON()).includes('identity') },
			{ alternate: { id: 'id', uri: mainFolderUri }, primary: { id: 'id', uri: mainFolderUri }, updated: { id: 'id', uri: mainFolderUri }, json: true });
	});

	test('identity is derived per state when not passed', () => {
		const folder = (uri: URI) => [new WorkspaceFolder({ uri, name: '', index: 0 })];

		assert.deepStrictEqual(
			{
				single: new Workspace('id', folder(mainFolderUri), false, null, () => !isLinux).identity,
				multiRoot: new Workspace('id', [...folder(test1FolderUri), ...folder(test2FolderUri)], false, workspaceConfigUri, () => !isLinux).identity,
				multiRootSingleFolder: new Workspace('id', folder(test1FolderUri), false, workspaceConfigUri, () => !isLinux).identity,
				empty: new Workspace('id', [], false, null, () => !isLinux).identity
			},
			{
				single: { id: 'id', uri: mainFolderUri },
				multiRoot: { id: 'id', configPath: workspaceConfigUri },
				multiRootSingleFolder: { id: 'id', configPath: workspaceConfigUri },
				empty: { id: 'id' }
			});
	});

	test('update() keeps the identity across alternate locations and follows state changes', () => {
		const folder = (uri: URI) => [new WorkspaceFolder({ uri, name: '', index: 0 })];
		const workspace = new Workspace('id', folder(mainFolderUri), false, null, () => !isLinux, undefined, { id: 'id', uri: mainFolderUri });
		const initial = workspace.identity;

		workspace.update(new Workspace('id', folder(test1FolderUri), false, null, () => !isLinux, undefined, workspace.identity));
		workspace.update(new Workspace('id', folder(test2FolderUri), false, null, () => !isLinux, undefined, workspace.identity));
		const afterSwitches = { identity: workspace.identity, folder: workspace.folders[0].uri.toString(), identifier: toWorkspaceIdentifier(workspace) };

		workspace.update(new Workspace('id', [...folder(test1FolderUri), ...folder(test2FolderUri)], false, workspaceConfigUri, () => !isLinux, undefined, { id: 'id', configPath: workspaceConfigUri }));
		const multiRoot = { identity: workspace.identity, identifier: toWorkspaceIdentifier(workspace) };

		workspace.update(new Workspace('id', [], false, null, () => !isLinux));

		assert.deepStrictEqual(
			{ initial, afterSwitches, multiRoot, empty: workspace.identity },
			{
				initial: { id: 'id', uri: mainFolderUri },
				afterSwitches: { identity: { id: 'id', uri: mainFolderUri }, folder: test2FolderUri.toString(), identifier: { id: 'id', uri: mainFolderUri } },
				multiRoot: { identity: { id: 'id', configPath: workspaceConfigUri }, identifier: { id: 'id', configPath: workspaceConfigUri } },
				empty: { id: 'id' }
			});
	});

	test('getFolder returns the closest folder if the uri is sub', () => {
		const expected = new WorkspaceFolder({ uri: testFolderUri, name: '', index: 2 });
		const testObject = new Workspace('', [new WorkspaceFolder({ uri: mainFolderUri, name: '', index: 0 }), new WorkspaceFolder({ uri: URI.file('/src/code'), name: '', index: 1 }), expected], false, null, () => !isLinux);

		const actual = testObject.getFolder(URI.file(join(fileFolder, 'test/a')));

		assert.strictEqual(actual, expected);
	});

	test('getFolder returns the folder even if the uri has query path', () => {
		const expected = new WorkspaceFolder({ uri: testFolderUri, name: '', index: 2 });
		const testObject = new Workspace('', [new WorkspaceFolder({ uri: mainFolderUri, name: '', index: 0 }), new WorkspaceFolder({ uri: URI.file('/src/code'), name: '', index: 1 }), expected], false, null, () => !isLinux);

		const actual = testObject.getFolder(URI.file(join(fileFolder, 'test/a')).with({ query: 'somequery' }));

		assert.strictEqual(actual, expected);
	});

	test('getFolder returns null if the uri is not sub', () => {
		const testObject = new Workspace('', [new WorkspaceFolder({ uri: testFolderUri, name: '', index: 0 }), new WorkspaceFolder({ uri: URI.file('/src/code'), name: '', index: 1 })], false, null, () => !isLinux);

		const actual = testObject.getFolder(URI.file(join(fileFolder, 'main/a')));

		assert.strictEqual(actual, null);
	});

	test('toWorkspaceFolders with single absolute folder', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].uri.fsPath, testFolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test');
	});

	test('toWorkspaceFolders with single relative folder', () => {
		const actual = toWorkspaceFolders([{ path: './test' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].uri.fsPath, testFolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, './test');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test');
	});

	test('toWorkspaceFolders with single absolute folder with name', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test', name: 'hello' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 1);

		assert.strictEqual(actual[0].uri.fsPath, testFolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'hello');
	});

	test('toWorkspaceFolders with multiple unique absolute folders', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test3' }, { path: '/src/test1' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 3);
		assert.strictEqual(actual[0].uri.fsPath, test2FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test2');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test2');

		assert.strictEqual(actual[1].uri.fsPath, test3FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[1].raw).path, '/src/test3');
		assert.strictEqual(actual[1].index, 1);
		assert.strictEqual(actual[1].name, 'test3');

		assert.strictEqual(actual[2].uri.fsPath, test1FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[2].raw).path, '/src/test1');
		assert.strictEqual(actual[2].index, 2);
		assert.strictEqual(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple unique absolute folders with names', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test3', name: 'noName' }, { path: '/src/test1' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 3);
		assert.strictEqual(actual[0].uri.fsPath, test2FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test2');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test2');

		assert.strictEqual(actual[1].uri.fsPath, test3FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[1].raw).path, '/src/test3');
		assert.strictEqual(actual[1].index, 1);
		assert.strictEqual(actual[1].name, 'noName');

		assert.strictEqual(actual[2].uri.fsPath, test1FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[2].raw).path, '/src/test1');
		assert.strictEqual(actual[2].index, 2);
		assert.strictEqual(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple unique absolute and relative folders', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/abc/test3', name: 'noName' }, { path: './test1' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 3);
		assert.strictEqual(actual[0].uri.fsPath, test2FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test2');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test2');

		assert.strictEqual(actual[1].uri.fsPath, abcTest3FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[1].raw).path, '/abc/test3');
		assert.strictEqual(actual[1].index, 1);
		assert.strictEqual(actual[1].name, 'noName');

		assert.strictEqual(actual[2].uri.fsPath, test1FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[2].raw).path, './test1');
		assert.strictEqual(actual[2].index, 2);
		assert.strictEqual(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple absolute folders with duplicates', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test2', name: 'noName' }, { path: '/src/test1' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 2);
		assert.strictEqual(actual[0].uri.fsPath, test2FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test2');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test2');

		assert.strictEqual(actual[1].uri.fsPath, test1FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[1].raw).path, '/src/test1');
		assert.strictEqual(actual[1].index, 1);
		assert.strictEqual(actual[1].name, 'test1');
	});

	test('toWorkspaceFolders with multiple absolute and relative folders with duplicates', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test3', name: 'noName' }, { path: './test3' }, { path: '/abc/test1' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 3);
		assert.strictEqual(actual[0].uri.fsPath, test2FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test2');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test2');

		assert.strictEqual(actual[1].uri.fsPath, test3FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[1].raw).path, '/src/test3');
		assert.strictEqual(actual[1].index, 1);
		assert.strictEqual(actual[1].name, 'noName');

		assert.strictEqual(actual[2].uri.fsPath, abcTest1FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[2].raw).path, '/abc/test1');
		assert.strictEqual(actual[2].index, 2);
		assert.strictEqual(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple absolute and relative folders with invalid paths', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '', name: 'noName' }, { path: './test3' }, { path: '/abc/test1' }], workspaceConfigUri, extUriBiasedIgnorePathCase);

		assert.strictEqual(actual.length, 3);
		assert.strictEqual(actual[0].uri.fsPath, test2FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[0].raw).path, '/src/test2');
		assert.strictEqual(actual[0].index, 0);
		assert.strictEqual(actual[0].name, 'test2');

		assert.strictEqual(actual[1].uri.fsPath, test3FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[1].raw).path, './test3');
		assert.strictEqual(actual[1].index, 1);
		assert.strictEqual(actual[1].name, 'test3');

		assert.strictEqual(actual[2].uri.fsPath, abcTest1FolderUri.fsPath);
		assert.strictEqual((<IRawFileWorkspaceFolder>actual[2].raw).path, '/abc/test1');
		assert.strictEqual(actual[2].index, 2);
		assert.strictEqual(actual[2].name, 'test1');
	});
});
