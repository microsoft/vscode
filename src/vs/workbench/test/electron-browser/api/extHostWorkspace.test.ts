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
		assert.equal(ws.getRelativePath('/Coding/One/file.txt'), 'file.txt');
		assert.equal(ws.getRelativePath('/Coding/Two/files/out.txt'), 'files/out.txt');
		assert.equal(ws.getRelativePath('/Coding/Two2/files/out.txt'), '/Coding/Two2/files/out.txt');
	});

	test('getPath, legacy', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [] });
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), null);
		assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), undefined);
		assert.equal(ws.getPath(), undefined);

		// ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [URI.file('Folder'), URI.file('Another/Folder')] });
		// assert.equal(ws.getPath(), undefined);

		ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [URI.file('/Folder')] });
		assert.equal(ws.getPath().replace(/\\/g, '/'), '/Folder');
	});

	test('Multiroot change event should have a delta, #29641', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [] });

		let sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.addedFolders, []);
			assert.deepEqual(e.removedFolders, []);
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.removedFolders, []);
			assert.equal(e.addedFolders.length, 1);
			assert.equal(e.addedFolders[0].toString(), 'foo:bar');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [URI.parse('foo:bar')] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.deepEqual(e.removedFolders, []);
			assert.equal(e.addedFolders.length, 1);
			assert.equal(e.addedFolders[0].toString(), 'foo:bar2');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [URI.parse('foo:bar'), URI.parse('foo:bar2')] });
		sub.dispose();

		sub = ws.onDidChangeWorkspace(e => {
			assert.equal(e.removedFolders.length, 2);
			assert.equal(e.removedFolders[0].toString(), 'foo:bar');
			assert.equal(e.removedFolders[1].toString(), 'foo:bar2');

			assert.equal(e.addedFolders.length, 1);
			assert.equal(e.addedFolders[0].toString(), 'foo:bar3');
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [URI.parse('foo:bar3')] });
		sub.dispose();

	});

	test('Multiroot change event is immutable', function () {
		let ws = new ExtHostWorkspace(new TestThreadService(), { id: 'foo', name: 'Test', roots: [] });
		let sub = ws.onDidChangeWorkspace(e => {
			assert.throws(() => {
				(<any>e).addedFolders = [];
			});
			assert.throws(() => {
				(<any>e.addedFolders)[0] = null;
			});
		});
		ws.$acceptWorkspaceData({ id: 'foo', name: 'Test', roots: [] });
		sub.dispose();
	});
});
