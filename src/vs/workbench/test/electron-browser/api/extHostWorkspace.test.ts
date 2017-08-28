/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { TestThreadService } from './testThreadService';

suite('ExtHostWorkspace', function () {

	test('asRelativePath', function () {

		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', roots: [URI.file('/Coding/Applications/NewsWoWBot')], name: 'Test' });

		assert.equal(ws.getRelativePath('/Coding/Applications/NewsWoWBot/bernd/das/brot'), 'bernd/das/brot');
		assert.equal(ws.getRelativePath('/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart'),
			'/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart');

		assert.equal(ws.getRelativePath(''), '');
		assert.equal(ws.getRelativePath('/foo/bar'), '/foo/bar');
		assert.equal(ws.getRelativePath('in/out'), 'in/out');
	});

	test('asRelativePath, same paths, #11402', function () {
		const root = '/home/aeschli/workspaces/samples/docker';
		const input = '/home/aeschli/workspaces/samples/docker';
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', roots: [URI.file(root)], name: 'Test' });

		assert.equal(ws.getRelativePath(input), input);

		const input2 = '/home/aeschli/workspaces/samples/docker/a.file';
		assert.equal(ws.getRelativePath(input2), 'a.file');
	});

	test('asRelativePath, no workspace', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), null);
		assert.equal(ws.getRelativePath(''), '');
		assert.equal(ws.getRelativePath('/foo/bar'), '/foo/bar');
	});

	test('asRelativePath, multiple folders', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', roots: [URI.file('/Coding/One'), URI.file('/Coding/Two')], name: 'Test' });
		assert.equal(ws.getRelativePath('/Coding/One/file.txt'), 'One/file.txt');
		assert.equal(ws.getRelativePath('/Coding/Two/files/out.txt'), 'Two/files/out.txt');
		assert.equal(ws.getRelativePath('/Coding/Two2/files/out.txt'), '/Coding/Two2/files/out.txt');
	});

	test('slightly inconsistent behaviour of asRelativePath and getWorkspaceFolder, #31553', function () {
		const mrws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', roots: [URI.file('/Coding/One'), URI.file('/Coding/Two')], name: 'Test' });

		assert.equal(mrws.getRelativePath('/Coding/One/file.txt'), 'One/file.txt');
		assert.equal(mrws.getRelativePath('/Coding/One/file.txt', true), 'One/file.txt');
		assert.equal(mrws.getRelativePath('/Coding/One/file.txt', false), 'file.txt');
		assert.equal(mrws.getRelativePath('/Coding/Two/files/out.txt'), 'Two/files/out.txt');
		assert.equal(mrws.getRelativePath('/Coding/Two/files/out.txt', true), 'Two/files/out.txt');
		assert.equal(mrws.getRelativePath('/Coding/Two/files/out.txt', false), 'files/out.txt');
		assert.equal(mrws.getRelativePath('/Coding/Two2/files/out.txt'), '/Coding/Two2/files/out.txt');
		assert.equal(mrws.getRelativePath('/Coding/Two2/files/out.txt', true), '/Coding/Two2/files/out.txt');
		assert.equal(mrws.getRelativePath('/Coding/Two2/files/out.txt', false), '/Coding/Two2/files/out.txt');

		const srws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', roots: [URI.file('/Coding/One')], name: 'Test' });
		assert.equal(srws.getRelativePath('/Coding/One/file.txt'), 'file.txt');
		assert.equal(srws.getRelativePath('/Coding/One/file.txt', false), 'file.txt');
		assert.equal(srws.getRelativePath('/Coding/One/file.txt', true), 'One/file.txt');
		assert.equal(srws.getRelativePath('/Coding/Two2/files/out.txt'), '/Coding/Two2/files/out.txt');
		assert.equal(srws.getRelativePath('/Coding/Two2/files/out.txt', true), '/Coding/Two2/files/out.txt');
		assert.equal(srws.getRelativePath('/Coding/Two2/files/out.txt', false), '/Coding/Two2/files/out.txt');
	});

	test('getPath, legacy', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [] });
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), null);
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), undefined);
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [URI.file('Folder'), URI.file('Another/Folder')] });
		assert.equal(ws.getPath().replace(/\\/g, '/'), '/Folder');

		ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [URI.file('/Folder')] });
		assert.equal(ws.getPath().replace(/\\/g, '/'), '/Folder');
	});

	test('WorkspaceFolder has name and index', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', roots: [URI.file('/Coding/One'), URI.file('/Coding/Two')], name: 'Test' });

		const [one, two] = ws.getWorkspaceFolders();

		assert.equal(one.name, 'One');
		assert.equal(one.index, 0);
		assert.equal(two.name, 'Two');
		assert.equal(two.index, 1);
	});

	test('getContainingWorkspaceFolder', function () {
		const ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [URI.file('/Coding/One'), URI.file('/Coding/Two'), URI.file('/Coding/Two/Nested')] });

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
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [] });

		let sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.added, []);
			assert.deepEqual(e.removed, []);
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.removed, []);
			assert.equal(e.added.length, 1);
			assert.equal(e.added[0].uri.toString(), 'foo:bar');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [URI.parse('foo:bar')] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.removed, []);
			assert.equal(e.added.length, 1);
			assert.equal(e.added[0].uri.toString(), 'foo:bar2');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [URI.parse('foo:bar'), URI.parse('foo:bar2')] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.equal(e.removed.length, 2);
			assert.equal(e.removed[0].uri.toString(), 'foo:bar');
			assert.equal(e.removed[1].uri.toString(), 'foo:bar2');

			assert.equal(e.added.length, 1);
			assert.equal(e.added[0].uri.toString(), 'foo:bar3');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [URI.parse('foo:bar3')] });
		sub.dispose();

	});

	test('Multiroot change event is immutable', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [] });
		let sub = ws.onDidChangeWorkspace(e => {
			assert.throws(() => {
				(<any>e).added = [];
			});
			assert.throws(() => {
				(<any>e.added)[0] = null;
			});
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [] });
		sub.dispose();
	});
});
