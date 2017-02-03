/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { isUndefinedOrNull, isArray } from 'vs/base/common/types';
import { isLinux, isWindows } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { validateFileName } from 'vs/workbench/parts/files/browser/fileActions';
import { FileStat } from 'vs/workbench/parts/files/common/explorerViewModel';

function createStat(path, name, isFolder, hasChildren, size, mtime) {
	return new FileStat(toResource(path), isFolder, hasChildren, name, mtime);
}

function toResource(path) {
	return URI.file(join('C:\\', path));
}

suite('Files - View Model', () => {

	test('Properties', function () {
		const d = new Date().getTime();
		let s = createStat('/path/to/stat', 'sName', true, true, 8096, d);

		assert.strictEqual(s.isDirectoryResolved, false);
		assert.strictEqual(s.resource.fsPath, toResource('/path/to/stat').fsPath);
		assert.strictEqual(s.name, 'sName');
		assert.strictEqual(s.isDirectory, true);
		assert.strictEqual(s.hasChildren, true);
		assert.strictEqual(s.mtime, new Date(d).getTime());
		assert(isArray(s.children) && s.children.length === 0);

		s = createStat('/path/to/stat', 'sName', false, false, 8096, d);
		assert(isUndefinedOrNull(s.children));
	});

	test('Add and Remove Child, check for hasChild', function () {
		const d = new Date().getTime();
		const s = createStat('/path/to/stat', 'sName', true, false, 8096, d);

		const child1 = createStat('/path/to/stat/foo', 'foo', true, false, 8096, d);
		const child2 = createStat('/path/to/stat/bar.html', 'bar', false, false, 8096, d);
		const child4 = createStat('/otherpath/to/other/otherbar.html', 'otherbar.html', false, false, 8096, d);

		assert(!s.hasChild(child1.name));
		assert(!s.hasChild(child2.name));

		s.addChild(child1);
		assert(s.hasChild(child1.name));
		assert(!s.hasChild(child1.name.toUpperCase()));
		assert(s.hasChild(child1.name.toUpperCase(), true));

		assert(s.children.length === 1);
		assert(s.hasChildren);

		s.removeChild(child1);
		s.addChild(child1);
		assert(s.children.length === 1);

		s.removeChild(child1);
		assert(!s.hasChildren);
		assert(s.children.length === 0);

		// Assert that adding a child updates its path properly
		s.addChild(child4);
		assert.strictEqual(child4.resource.fsPath, toResource('/path/to/stat/' + child4.name).fsPath);
	});

	test('Move', function () {
		const d = new Date().getTime();

		const s1 = createStat('/', '/', true, false, 8096, d);
		const s2 = createStat('/path', 'path', true, false, 8096, d);
		const s3 = createStat('/path/to', 'to', true, false, 8096, d);
		const s4 = createStat('/path/to/stat', 'stat', false, false, 8096, d);

		s1.addChild(s2);
		s2.addChild(s3);
		s3.addChild(s4);

		s4.move(s1);

		assert.strictEqual(s3.children.length, 0);
		assert.strictEqual(s3.hasChildren, false);

		assert.strictEqual(s1.children.length, 2);

		// Assert the new path of the moved element
		assert.strictEqual(s4.resource.fsPath, toResource('/' + s4.name).fsPath);

		// Move a subtree with children
		const leaf = createStat('/leaf', 'leaf', true, false, 8096, d);
		const leafC1 = createStat('/leaf/folder', 'folder', true, false, 8096, d);
		const leafCC2 = createStat('/leaf/folder/index.html', 'index.html', true, false, 8096, d);

		leaf.addChild(leafC1);
		leafC1.addChild(leafCC2);
		s1.addChild(leaf);

		leafC1.move(s3);
		assert.strictEqual(leafC1.resource.fsPath, URI.file(s3.resource.fsPath + '/' + leafC1.name).fsPath);
		assert.strictEqual(leafCC2.resource.fsPath, URI.file(leafC1.resource.fsPath + '/' + leafCC2.name).fsPath);
	});

	test('Rename', function () {
		const d = new Date().getTime();

		const s1 = createStat('/', '/', true, false, 8096, d);
		const s2 = createStat('/path', 'path', true, false, 8096, d);
		const s3 = createStat('/path/to', 'to', true, false, 8096, d);
		const s4 = createStat('/path/to/stat', 'stat', true, false, 8096, d);

		s1.addChild(s2);
		s2.addChild(s3);
		s3.addChild(s4);

		const s2renamed = createStat('/otherpath', 'otherpath', true, true, 8096, d);
		s2.rename(s2renamed);

		// Verify the paths have changed including children
		assert.strictEqual(s2.name, s2renamed.name);
		assert.strictEqual(s2.resource.fsPath, s2renamed.resource.fsPath);
		assert.strictEqual(s3.resource.fsPath, toResource('/otherpath/to').fsPath);
		assert.strictEqual(s4.resource.fsPath, toResource('/otherpath/to/stat').fsPath);

		const s4renamed = createStat('/otherpath/to/statother.js', 'statother.js', true, false, 8096, d);
		s4.rename(s4renamed);
		assert.strictEqual(s4.name, s4renamed.name);
		assert.strictEqual(s4.resource.fsPath, s4renamed.resource.fsPath);
	});

	test('Find', function () {
		const d = new Date().getTime();

		const s1 = createStat('/', '/', true, false, 8096, d);
		const s2 = createStat('/path', 'path', true, false, 8096, d);
		const s3 = createStat('/path/to', 'to', true, false, 8096, d);
		const s4 = createStat('/path/to/stat', 'stat', true, false, 8096, d);

		const child1 = createStat('/path/to/stat/foo', 'foo', true, false, 8096, d);
		const child2 = createStat('/path/to/stat/foo/bar.html', 'bar.html', false, false, 8096, d);

		s1.addChild(s2);
		s2.addChild(s3);
		s3.addChild(s4);
		s4.addChild(child1);
		child1.addChild(child2);

		assert.strictEqual(s1.find(child2.resource), child2);
		assert.strictEqual(s1.find(child1.resource), child1);
		assert.strictEqual(s1.find(s4.resource), s4);
		assert.strictEqual(s1.find(s3.resource), s3);
		assert.strictEqual(s1.find(s2.resource), s2);

		assert.strictEqual(s1.find(toResource('foobar')), null);

		assert.strictEqual(s1.find(toResource('/')), s1);
	});

	test('Find with mixed case', function () {
		const d = new Date().getTime();

		const s1 = createStat('/', '/', true, false, 8096, d);
		const s2 = createStat('/path', 'path', true, false, 8096, d);
		const s3 = createStat('/path/to', 'to', true, false, 8096, d);
		const s4 = createStat('/path/to/stat', 'stat', true, false, 8096, d);

		const child1 = createStat('/path/to/stat/foo', 'foo', true, false, 8096, d);
		const child2 = createStat('/path/to/stat/foo/bar.html', 'bar.html', false, false, 8096, d);

		s1.addChild(s2);
		s2.addChild(s3);
		s3.addChild(s4);
		s4.addChild(child1);
		child1.addChild(child2);

		if (isLinux) { // linux is case sensitive
			assert.ok(!s1.find(toResource('/path/to/stat/Foo')));
			assert.ok(!s1.find(toResource('/Path/to/stat/foo/bar.html')));
		} else {
			assert.ok(s1.find(toResource('/path/to/stat/Foo')));
			assert.ok(s1.find(toResource('/Path/to/stat/foo/bar.html')));
		}
	});

	test('Validate File Name (For Create)', function () {
		const d = new Date().getTime();
		const s = createStat('/path/to/stat', 'sName', true, true, 8096, d);
		const sChild = createStat('/path/to/stat/alles.klar', 'alles.klar', true, true, 8096, d);
		s.addChild(sChild);

		assert(validateFileName(s, null) !== null);
		assert(validateFileName(s, '') !== null);
		assert(validateFileName(s, '  ') !== null);
		assert(validateFileName(s, 'Read Me') === null, 'name containing space');
		assert(validateFileName(s, 'foo/bar') !== null);
		assert(validateFileName(s, 'foo\\bar') !== null);
		if (isWindows) {
			assert(validateFileName(s, 'foo:bar') !== null);
			assert(validateFileName(s, 'foo*bar') !== null);
			assert(validateFileName(s, 'foo?bar') !== null);
			assert(validateFileName(s, 'foo<bar') !== null);
			assert(validateFileName(s, 'foo>bar') !== null);
			assert(validateFileName(s, 'foo|bar') !== null);
		}
		assert(validateFileName(s, 'alles.klar') !== null);

		assert(validateFileName(s, '.foo') === null);
		assert(validateFileName(s, 'foo.bar') === null);
		assert(validateFileName(s, 'foo') === null);
	});

	test('Validate File Name (For Rename)', function () {
		const d = new Date().getTime();
		const s = createStat('/path/to/stat', 'sName', true, true, 8096, d);
		const sChild = createStat('/path/to/stat/alles.klar', 'alles.klar', true, true, 8096, d);
		s.addChild(sChild);

		assert(validateFileName(s, 'alles.klar') !== null);

		if (isLinux) {
			assert(validateFileName(s, 'Alles.klar') === null);
			assert(validateFileName(s, 'Alles.Klar') === null);
		} else {
			assert(validateFileName(s, 'Alles.klar') !== null);
			assert(validateFileName(s, 'Alles.Klar') !== null);
		}

		assert(validateFileName(s, '.foo') === null);
		assert(validateFileName(s, 'foo.bar') === null);
		assert(validateFileName(s, 'foo') === null);
	});

	test('Merge Local with Disk', function () {
		const d = new Date().toUTCString();

		const merge1 = new FileStat(URI.file(join('C:\\', '/path/to')), true, false, 'to', Date.now(), d);
		const merge2 = new FileStat(URI.file(join('C:\\', '/path/to')), true, false, 'to', Date.now(), new Date(0).toUTCString());

		// Merge Properties
		FileStat.mergeLocalWithDisk(merge2, merge1);
		assert.strictEqual(merge1.mtime, merge2.mtime);

		// Merge Child when isDirectoryResolved=false is a no-op
		merge2.addChild(new FileStat(URI.file(join('C:\\', '/path/to/foo.html')), true, false, 'foo.html', Date.now(), d));
		FileStat.mergeLocalWithDisk(merge2, merge1);
		assert.strictEqual(merge1.children.length, 0);

		// Merge Child with isDirectoryResolved=true
		const child = new FileStat(URI.file(join('C:\\', '/path/to/foo.html')), true, false, 'foo.html', Date.now(), d);
		merge2.removeChild(child);
		merge2.addChild(child);
		merge2.isDirectoryResolved = true;
		FileStat.mergeLocalWithDisk(merge2, merge1);
		assert.strictEqual(merge1.children.length, 1);
		assert.strictEqual(merge1.children[0].name, 'foo.html');
		assert.deepEqual(merge1.children[0].parent, merge1, 'Check parent');

		// Verify that merge does not replace existing children, but updates properties in that case
		const existingChild = merge1.children[0];
		FileStat.mergeLocalWithDisk(merge2, merge1);
		assert.ok(existingChild === merge1.children[0]);
	});
});