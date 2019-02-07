/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';

import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { toStoreData, restoreRecentlyOpened } from 'vs/platform/history/electron-main/historyStorage';

function toWorkspace(uri: URI): IWorkspaceIdentifier {
	return {
		id: '1234',
		configPath: uri
	};
}
function assertEqualURI(u1: URI | undefined, u2: URI | undefined, message?: string): void {
	assert.equal(u1 && u1.toString(), u2 && u2.toString(), message);
}

function assertEqualWorkspace(w1: IWorkspaceIdentifier | undefined, w2: IWorkspaceIdentifier | undefined, message?: string): void {
	if (!w1 || !w2) {
		assert.equal(w1, w2, message);
		return;
	}
	assert.equal(w1.id, w2.id, message);
	assertEqualURI(w1.configPath, w2.configPath, message);
}

function assertEqualRecentlyOpened(expected: IRecentlyOpened, actual: IRecentlyOpened, message?: string) {
	assert.equal(expected.files.length, actual.files.length, message);
	for (let i = 0; i < expected.files.length; i++) {
		assertEqualURI(expected.files[i], actual.files[i], message);
	}
	assert.equal(expected.workspaces.length, actual.workspaces.length, message);
	for (let i = 0; i < expected.workspaces.length; i++) {
		if (expected.workspaces[i] instanceof URI) {
			assertEqualURI(<URI>expected.workspaces[i], <URI>actual.workspaces[i], message);
		} else {
			assertEqualWorkspace(<IWorkspaceIdentifier>expected.workspaces[i], <IWorkspaceIdentifier>actual.workspaces[i], message);
		}
	}
}

function assertRestoring(state: IRecentlyOpened, message?: string) {
	const stored = toStoreData(state);
	const restored = restoreRecentlyOpened(stored);
	assertEqualRecentlyOpened(state, restored, message);
}

const testWSPath = URI.file(path.join(os.tmpdir(), 'windowStateTest', 'test.code-workspace'));
const testFileURI = URI.file(path.join(os.tmpdir(), 'windowStateTest', 'testFile.txt'));
const testFolderURI = URI.file(path.join(os.tmpdir(), 'windowStateTest', 'testFolder'));

const testRemoteFolderURI = URI.parse('foo://bar/c/e');
const testRemoteFileURI = URI.parse('foo://bar/c/d.txt');
const testRemoteWSURI = URI.parse('foo://bar/c/test.code-workspace');

suite('History Storage', () => {
	test('storing and restoring', () => {
		let ro: IRecentlyOpened;
		ro = {
			files: [],
			workspaces: []
		};
		assertRestoring(ro, 'empty');
		ro = {
			files: [testFileURI],
			workspaces: []
		};
		assertRestoring(ro, 'file');
		ro = {
			files: [],
			workspaces: [testFolderURI]
		};
		assertRestoring(ro, 'folder');
		ro = {
			files: [],
			workspaces: [toWorkspace(testWSPath), testFolderURI]
		};
		assertRestoring(ro, 'workspaces and folders');

		ro = {
			files: [testRemoteFileURI],
			workspaces: [toWorkspace(testRemoteWSURI), testRemoteFolderURI]
		};
		assertRestoring(ro, 'remote workspaces and folders');
	});

	test('open 1_25', () => {
		const v1_25_win = `{
			"workspaces": [
				{
					"id": "2fa677dbdf5f771e775af84dea9feaea",
					"configPath": "C:\\\\workspaces\\\\testing\\\\test.code-workspace"
				},
				"C:\\\\workspaces\\\\testing\\\\test-ext",
				{
					"id": "d87a0241f8abc86b95c4e5481ebcbf56",
					"configPath": "C:\\\\workspaces\\\\test.code-workspace"
				}
			],
			"files": [
				"C:\\\\workspaces\\\\test.code-workspace",
				"C:\\\\workspaces\\\\testing\\\\test-ext\\\\.gitignore"
			]
		}`;

		let actual = restoreRecentlyOpened(JSON.parse(v1_25_win));
		let expected: IRecentlyOpened = {
			files: [URI.file('C:\\workspaces\\test.code-workspace'), URI.file('C:\\workspaces\\testing\\test-ext\\.gitignore')],
			workspaces: [
				{ id: '2fa677dbdf5f771e775af84dea9feaea', configPath: URI.file('C:\\workspaces\\testing\\test.code-workspace') },
				URI.file('C:\\workspaces\\testing\\test-ext'),
				{ id: 'd87a0241f8abc86b95c4e5481ebcbf56', configPath: URI.file('C:\\workspaces\\test.code-workspace') }
			]
		};

		assertEqualRecentlyOpened(expected, actual, 'v1_31_win');
	});

	test('open 1_31', () => {
		const v1_31_win = `{
			"workspaces2": [
				"file:///c%3A/workspaces/testing/test-ext",
				"file:///c%3A/WINDOWS/system32",
				{
					"id": "d87a0241f8abc86b95c4e5481ebcbf56",
					"configPath": "c:\\\\workspaces\\\\test.code-workspace"
				}
			],
			"files2": [
				"file:///c%3A/workspaces/vscode/.yarnrc"
			]
		}`;

		let actual = restoreRecentlyOpened(JSON.parse(v1_31_win));
		let expected: IRecentlyOpened = {
			files: [URI.parse('file:///c%3A/workspaces/vscode/.yarnrc')],
			workspaces: [
				URI.parse('file:///c%3A/workspaces/testing/test-ext'),
				URI.parse('file:///c%3A/WINDOWS/system32'),
				{ id: 'd87a0241f8abc86b95c4e5481ebcbf56', configPath: URI.file('c:\\workspaces\\test.code-workspace') }
			]
		};

		assertEqualRecentlyOpened(expected, actual, 'v1_31_win');
	});

	test('open 1_32', () => {
		const v1_32 = `{
			"workspaces3": [
				{
					"id": "53b714b46ef1a2d4346568b4f591028c",
					"configURIPath": "file:///home/user/workspaces/testing/custom.code-workspace"
				},
				"file:///home/user/workspaces/testing/folding"
			],
			"files2": [
				"file:///home/user/.config/code-oss-dev/storage.json"
			]
		}`;

		let windowsState = restoreRecentlyOpened(JSON.parse(v1_32));
		let expected: IRecentlyOpened = {
			files: [URI.parse('file:///home/user/.config/code-oss-dev/storage.json')],
			workspaces: [
				{ id: '53b714b46ef1a2d4346568b4f591028c', configPath: URI.parse('file:///home/user/workspaces/testing/custom.code-workspace') },
				URI.parse('file:///home/user/workspaces/testing/folding')
			]
		};

		assertEqualRecentlyOpened(expected, windowsState, 'v1_32');

	});

});