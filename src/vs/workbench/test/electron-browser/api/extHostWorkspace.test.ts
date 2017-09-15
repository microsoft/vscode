/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { TestThreadService } from './testThreadService';
import { normalize } from 'vs/base/common/paths';

suite('ExtHostWorkspace', function () {

	function assertAsRelativePath(workspace: ExtHostWorkspace, input: string, expected: string, includeWorkspace?: boolean) {
		const actual = workspace.getRelativePath(input, includeWorkspace);
		if (actual === expected) {
			assert.ok(true);
		} else {
			assert.equal(actual, normalize(expected, true));
		}
	}

	test('asRelativePath', function () {

		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', folders: [URI.file('/Coding/Applications/NewsWoWBot')], name: 'Test' });

		assertAsRelativePath(ws, '/Coding/Applications/NewsWoWBot/bernd/das/brot', 'bernd/das/brot');
		assertAsRelativePath(ws, '/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart',
			'/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart');

		assertAsRelativePath(ws, '', '');
		assertAsRelativePath(ws, '/foo/bar', '/foo/bar');
		assertAsRelativePath(ws, 'in/out', 'in/out');
	});

	test('asRelativePath, same paths, #11402', function () {
		const root = '/home/aeschli/workspaces/samples/docker';
		const input = '/home/aeschli/workspaces/samples/docker';
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', folders: [URI.file(root)], name: 'Test' });

		assertAsRelativePath(ws, (input), input);

		const input2 = '/home/aeschli/workspaces/samples/docker/a.file';
		assertAsRelativePath(ws, (input2), 'a.file');
	});

	test('asRelativePath, no workspace', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), null);
		assertAsRelativePath(ws, (''), '');
		assertAsRelativePath(ws, ('/foo/bar'), '/foo/bar');
	});

	test('asRelativePath, multiple folders', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', folders: [URI.file('/Coding/One'), URI.file('/Coding/Two')], name: 'Test' });
		assertAsRelativePath(ws, '/Coding/One/file.txt', 'One/file.txt');
		assertAsRelativePath(ws, '/Coding/Two/files/out.txt', 'Two/files/out.txt');
		assertAsRelativePath(ws, '/Coding/Two2/files/out.txt', '/Coding/Two2/files/out.txt');
	});

	test('slightly inconsistent behaviour of asRelativePath and getWorkspaceFolder, #31553', function () {
		const mrws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', folders: [URI.file('/Coding/One'), URI.file('/Coding/Two')], name: 'Test' });

		assertAsRelativePath(mrws, '/Coding/One/file.txt', 'One/file.txt');
		assertAsRelativePath(mrws, '/Coding/One/file.txt', 'One/file.txt', true);
		assertAsRelativePath(mrws, '/Coding/One/file.txt', 'file.txt', false);
		assertAsRelativePath(mrws, '/Coding/Two/files/out.txt', 'Two/files/out.txt');
		assertAsRelativePath(mrws, '/Coding/Two/files/out.txt', 'Two/files/out.txt', true);
		assertAsRelativePath(mrws, '/Coding/Two/files/out.txt', 'files/out.txt', false);
		assertAsRelativePath(mrws, '/Coding/Two2/files/out.txt', '/Coding/Two2/files/out.txt');
		assertAsRelativePath(mrws, '/Coding/Two2/files/out.txt', '/Coding/Two2/files/out.txt', true);
		assertAsRelativePath(mrws, '/Coding/Two2/files/out.txt', '/Coding/Two2/files/out.txt', false);

		const srws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', folders: [URI.file('/Coding/One')], name: 'Test' });
		assertAsRelativePath(srws, '/Coding/One/file.txt', 'file.txt');
		assertAsRelativePath(srws, '/Coding/One/file.txt', 'file.txt', false);
		assertAsRelativePath(srws, '/Coding/One/file.txt', 'One/file.txt', true);
		assertAsRelativePath(srws, '/Coding/Two2/files/out.txt', '/Coding/Two2/files/out.txt');
		assertAsRelativePath(srws, '/Coding/Two2/files/out.txt', '/Coding/Two2/files/out.txt', true);
		assertAsRelativePath(srws, '/Coding/Two2/files/out.txt', '/Coding/Two2/files/out.txt', false);
	});

	test('getPath, legacy', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', folders: [] });
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), null);
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), undefined);
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', folders: [URI.file('Folder'), URI.file('Another/Folder')] });
		assert.equal(ws.getPath().replace(/\\/g, '/'), '/Folder');

		ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', folders: [URI.file('/Folder')] });
		assert.equal(ws.getPath().replace(/\\/g, '/'), '/Folder');
	});

	test('WorkspaceFolder has name and index', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', folders: [URI.file('/Coding/One'), URI.file('/Coding/Two')], name: 'Test' });

		const [one, two] = ws.getWorkspaceFolders();

		assert.equal(one.name, 'One');
		assert.equal(one.index, 0);
		assert.equal(two.name, 'Two');
		assert.equal(two.index, 1);
	});

	test('getContainingWorkspaceFolder', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', folders: [URI.file('/Coding/One'), URI.file('/Coding/Two'), URI.file('/Coding/Two/Nested')] });

		let folder = ws.getWorkspaceFolder(URI.file('/foo/bar'));
		assert.equal(folder, undefined);

		folder = ws.getWorkspaceFolder(URI.file('/Coding/One/file/path.txt'));
		assert.equal(folder.name, 'One');

		folder = ws.getWorkspaceFolder(URI.file('/Coding/Two/file/path.txt'));
		assert.equal(folder.name, 'Two');

		folder = ws.getWorkspaceFolder(URI.file('/Coding/Two/Nest'));
		assert.equal(folder.name, 'Two');

		folder = ws.getWorkspaceFolder(URI.file('/Coding/Two/Nested/file'));
		assert.equal(folder.name, 'Nested');

		folder = ws.getWorkspaceFolder(URI.file('/Coding/Two/Nested/f'));
		assert.equal(folder.name, 'Nested');

		folder = ws.getWorkspaceFolder(URI.file('/Coding/Two/Nested'));
		assert.equal(folder.name, 'Two');

		folder = ws.getWorkspaceFolder(URI.file('/Coding/Two/Nested/'));
		assert.equal(folder.name, 'Two');

		folder = ws.getWorkspaceFolder(URI.file('/Coding/Two'));
		assert.equal(folder, undefined);
	});

	test('Multiroot change event should have a delta, #29641', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', folders: [] });

		let sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.added, []);
			assert.deepEqual(e.removed, []);
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', folders: [] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.removed, []);
			assert.equal(e.added.length, 1);
			assert.equal(e.added[0].uri.toString(), 'foo:bar');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', folders: [URI.parse('foo:bar')] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.removed, []);
			assert.equal(e.added.length, 1);
			assert.equal(e.added[0].uri.toString(), 'foo:bar2');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', folders: [URI.parse('foo:bar'), URI.parse('foo:bar2')] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.equal(e.removed.length, 2);
			assert.equal(e.removed[0].uri.toString(), 'foo:bar');
			assert.equal(e.removed[1].uri.toString(), 'foo:bar2');

			assert.equal(e.added.length, 1);
			assert.equal(e.added[0].uri.toString(), 'foo:bar3');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', folders: [URI.parse('foo:bar3')] });
		sub.dispose();

	});

	test('Multiroot change event is immutable', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', folders: [] });
		let sub = ws.onDidChangeWorkspace(e => {
			assert.throws(() => {
				(<any>e).added = [];
			});
			assert.throws(() => {
				(<any>e.added)[0] = null;
			});
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', folders: [] });
		sub.dispose();
	});
});
