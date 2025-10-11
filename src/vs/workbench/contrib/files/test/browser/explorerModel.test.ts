/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join } from '../../../../../base/common/path.js';
import { isLinux, isWindows, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestPathService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { validateFileName } from '../../browser/fileActions.js';
import { ExplorerItem } from '../../common/explorerModel.js';


suite('Files - View Model', function () {

	const fileService = new TestFileService();
	const configService = new TestConfigurationService();

	function createStat(this: any, path: string, name: string, isFolder: boolean, hasChildren: boolean, size: number, mtime: number): ExplorerItem {
		return new ExplorerItem(toResource.call(this, path), fileService, configService, NullFilesConfigurationService, undefined, isFolder, false, false, false, name, mtime);
	}

	const pathService = new TestPathService();

	test('Properties', function () {
		const d = new Date().getTime();
		let s = createStat.call(this, '/path/to/stat', 'sName', true, true, 8096, d);

		assert.strictEqual(s.isDirectoryResolved, false);
		assert.strictEqual(s.resource.fsPath, toResource.call(this, '/path/to/stat').fsPath);
		assert.strictEqual(s.name, 'sName');
		assert.strictEqual(s.isDirectory, true);
		assert.strictEqual(s.mtime, new Date(d).getTime());

		s = createStat.call(this, '/path/to/stat', 'sName', false, false, 8096, d);
	});

	test('Add and Remove Child, check for hasChild', function () {
		const d = new Date().getTime();
		const s = createStat.call(this, '/path/to/stat', 'sName', true, false, 8096, d);

		const child1 = createStat.call(this, '/path/to/stat/foo', 'foo', true, false, 8096, d);
		const child4 = createStat.call(this, '/otherpath/to/other/otherbar.html', 'otherbar.html', false, false, 8096, d);

		s.addChild(child1);

		assert(!!s.getChild(child1.name));

		s.removeChild(child1);
		s.addChild(child1);
		assert(!!s.getChild(child1.name));

		s.removeChild(child1);
		assert(!s.getChild(child1.name));

		// Assert that adding a child updates its path properly
		s.addChild(child4);
		assert.strictEqual(child4.resource.fsPath, toResource.call(this, '/path/to/stat/' + child4.name).fsPath);
	});

	test('Move', function () {
		const d = new Date().getTime();

		const s1 = createStat.call(this, '/', '/', true, false, 8096, d);
		const s2 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s4 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);

		s1.addChild(s2);
		s2.addChild(s3);
		s3.addChild(s4);

		s4.move(s1);

		// Assert the new path of the moved element
		assert.strictEqual(s4.resource.fsPath, toResource.call(this, '/' + s4.name).fsPath);

		// Move a subtree with children
		const leaf = createStat.call(this, '/leaf', 'leaf', true, false, 8096, d);
		const leafC1 = createStat.call(this, '/leaf/folder', 'folder', true, false, 8096, d);
		const leafCC2 = createStat.call(this, '/leaf/folder/index.html', 'index.html', true, false, 8096, d);

		leaf.addChild(leafC1);
		leafC1.addChild(leafCC2);
		s1.addChild(leaf);

		leafC1.move(s3);
		assert.strictEqual(leafC1.resource.fsPath, URI.file(s3.resource.fsPath + '/' + leafC1.name).fsPath);
		assert.strictEqual(leafCC2.resource.fsPath, URI.file(leafC1.resource.fsPath + '/' + leafCC2.name).fsPath);
	});

	test('Rename', function () {
		const d = new Date().getTime();

		const s1 = createStat.call(this, '/', '/', true, false, 8096, d);
		const s2 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s4 = createStat.call(this, '/path/to/stat', 'stat', true, false, 8096, d);

		s1.addChild(s2);
		s2.addChild(s3);
		s3.addChild(s4);

		assert.strictEqual(s1.getChild(s2.name), s2);
		const s2renamed = createStat.call(this, '/otherpath', 'otherpath', true, true, 8096, d);
		s2.rename(s2renamed);
		assert.strictEqual(s1.getChild(s2.name), s2);

		// Verify the paths have changed including children
		assert.strictEqual(s2.name, s2renamed.name);
		assert.strictEqual(s2.resource.fsPath, s2renamed.resource.fsPath);
		assert.strictEqual(s3.resource.fsPath, toResource.call(this, '/otherpath/to').fsPath);
		assert.strictEqual(s4.resource.fsPath, toResource.call(this, '/otherpath/to/stat').fsPath);

		const s4renamed = createStat.call(this, '/otherpath/to/statother.js', 'statother.js', true, false, 8096, d);
		s4.rename(s4renamed);
		assert.strictEqual(s3.getChild(s4.name), s4);
		assert.strictEqual(s4.name, s4renamed.name);
		assert.strictEqual(s4.resource.fsPath, s4renamed.resource.fsPath);
	});

	test('Find', function () {
		const d = new Date().getTime();

		const s1 = createStat.call(this, '/', '/', true, false, 8096, d);
		const s2 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s4 = createStat.call(this, '/path/to/stat', 'stat', true, false, 8096, d);
		const s4Upper = createStat.call(this, '/path/to/STAT', 'stat', true, false, 8096, d);

		const child1 = createStat.call(this, '/path/to/stat/foo', 'foo', true, false, 8096, d);
		const child2 = createStat.call(this, '/path/to/stat/foo/bar.html', 'bar.html', false, false, 8096, d);

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

		if (isLinux) {
			assert.ok(!s1.find(s4Upper.resource));
		} else {
			assert.strictEqual(s1.find(s4Upper.resource), s4);
		}

		assert.strictEqual(s1.find(toResource.call(this, 'foobar')), null);

		assert.strictEqual(s1.find(toResource.call(this, '/')), s1);
	});

	test('Find with mixed case', function () {
		const d = new Date().getTime();

		const s1 = createStat.call(this, '/', '/', true, false, 8096, d);
		const s2 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s4 = createStat.call(this, '/path/to/stat', 'stat', true, false, 8096, d);

		const child1 = createStat.call(this, '/path/to/stat/foo', 'foo', true, false, 8096, d);
		const child2 = createStat.call(this, '/path/to/stat/foo/bar.html', 'bar.html', false, false, 8096, d);

		s1.addChild(s2);
		s2.addChild(s3);
		s3.addChild(s4);
		s4.addChild(child1);
		child1.addChild(child2);

		if (isLinux) { // linux is case sensitive
			assert.ok(!s1.find(toResource.call(this, '/path/to/stat/Foo')));
			assert.ok(!s1.find(toResource.call(this, '/Path/to/stat/foo/bar.html')));
		} else {
			assert.ok(s1.find(toResource.call(this, '/path/to/stat/Foo')));
			assert.ok(s1.find(toResource.call(this, '/Path/to/stat/foo/bar.html')));
		}
	});

	test('Validate File Name (For Create)', function () {
		const d = new Date().getTime();
		const s = createStat.call(this, '/path/to/stat', 'sName', true, true, 8096, d);
		const sChild = createStat.call(this, '/path/to/stat/alles.klar', 'alles.klar', true, true, 8096, d);
		s.addChild(sChild);

		assert(validateFileName(pathService, s, null!, OS) !== null);
		assert(validateFileName(pathService, s, '', OS) !== null);
		assert(validateFileName(pathService, s, '  ', OS) !== null);
		assert(validateFileName(pathService, s, 'Read Me', OS) === null, 'name containing space');

		if (isWindows) {
			assert(validateFileName(pathService, s, 'foo:bar', OS) !== null);
			assert(validateFileName(pathService, s, 'foo*bar', OS) !== null);
			assert(validateFileName(pathService, s, 'foo?bar', OS) !== null);
			assert(validateFileName(pathService, s, 'foo<bar', OS) !== null);
			assert(validateFileName(pathService, s, 'foo>bar', OS) !== null);
			assert(validateFileName(pathService, s, 'foo|bar', OS) !== null);
		}
		assert(validateFileName(pathService, s, 'alles.klar', OS) === null);
		assert(validateFileName(pathService, s, '.foo', OS) === null);
		assert(validateFileName(pathService, s, 'foo.bar', OS) === null);
		assert(validateFileName(pathService, s, 'foo', OS) === null);
	});

	test('Validate File Name (For Rename)', function () {
		const d = new Date().getTime();
		const s = createStat.call(this, '/path/to/stat', 'sName', true, true, 8096, d);
		const sChild = createStat.call(this, '/path/to/stat/alles.klar', 'alles.klar', true, true, 8096, d);
		s.addChild(sChild);

		assert(validateFileName(pathService, s, 'alles.klar', OS) === null);

		assert(validateFileName(pathService, s, 'Alles.klar', OS) === null);
		assert(validateFileName(pathService, s, 'Alles.Klar', OS) === null);

		assert(validateFileName(pathService, s, '.foo', OS) === null);
		assert(validateFileName(pathService, s, 'foo.bar', OS) === null);
		assert(validateFileName(pathService, s, 'foo', OS) === null);
	});

	test('Validate Multi-Path File Names', function () {
		const d = new Date().getTime();
		const wsFolder = createStat.call(this, '/', 'workspaceFolder', true, false, 8096, d);

		assert(validateFileName(pathService, wsFolder, 'foo/bar', OS) === null);
		assert(validateFileName(pathService, wsFolder, 'foo\\bar', OS) === null);
		assert(validateFileName(pathService, wsFolder, 'all/slashes/are/same', OS) === null);
		assert(validateFileName(pathService, wsFolder, 'theres/one/different\\slash', OS) === null);
		assert(validateFileName(pathService, wsFolder, '/slashAtBeginning', OS) !== null);

		// attempting to add a child to a deeply nested file
		const s1 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s2 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to/stat', 'stat', true, false, 8096, d);
		wsFolder.addChild(s1);
		s1.addChild(s2);
		s2.addChild(s3);
		const fileDeeplyNested = createStat.call(this, '/path/to/stat/fileNested', 'fileNested', false, false, 8096, d);
		s3.addChild(fileDeeplyNested);
		assert(validateFileName(pathService, wsFolder, '/path/to/stat/fileNested/aChild', OS) !== null);

		// detect if path already exists
		assert(validateFileName(pathService, wsFolder, '/path/to/stat/fileNested', OS) !== null);
		assert(validateFileName(pathService, wsFolder, '/path/to/stat/', OS) !== null);
	});

	test('Merge Local with Disk', function () {
		const merge1 = new ExplorerItem(URI.file(join('C:\\', '/path/to')), fileService, configService, NullFilesConfigurationService, undefined, true, false, false, false, 'to', Date.now());
		const merge2 = new ExplorerItem(URI.file(join('C:\\', '/path/to')), fileService, configService, NullFilesConfigurationService, undefined, true, false, false, false, 'to', Date.now());

		// Merge Properties
		ExplorerItem.mergeLocalWithDisk(merge2, merge1);
		assert.strictEqual(merge1.mtime, merge2.mtime);

		// Merge Child when isDirectoryResolved=false is a no-op
		merge2.addChild(new ExplorerItem(URI.file(join('C:\\', '/path/to/foo.html')), fileService, configService, NullFilesConfigurationService, undefined, true, false, false, false, 'foo.html', Date.now()));
		ExplorerItem.mergeLocalWithDisk(merge2, merge1);

		// Merge Child with isDirectoryResolved=true
		const child = new ExplorerItem(URI.file(join('C:\\', '/path/to/foo.html')), fileService, configService, NullFilesConfigurationService, undefined, true, false, false, false, 'foo.html', Date.now());
		merge2.removeChild(child);
		merge2.addChild(child);
		merge2._isDirectoryResolved = true;
		ExplorerItem.mergeLocalWithDisk(merge2, merge1);
		assert.strictEqual(merge1.getChild('foo.html')!.name, 'foo.html');
		assert.deepStrictEqual(merge1.getChild('foo.html')!.parent, merge1, 'Check parent');

		// Verify that merge does not replace existing children, but updates properties in that case
		const existingChild = merge1.getChild('foo.html');
		ExplorerItem.mergeLocalWithDisk(merge2, merge1);
		assert.ok(existingChild === merge1.getChild(existingChild!.name));
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
