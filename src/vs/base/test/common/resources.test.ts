/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { normalize } from 'vs/base/common/paths';
import { dirname, distinctParents, joinPath, isEqual, isEqualOrParent, hasToIgnoreCase } from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';

suite('Resources', () => {

	test('distinctParents', () => {

		// Basic
		let resources = [
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderB/file.txt'),
			URI.file('/some/folderC/file.txt')
		];

		let distinct = distinctParents(resources, r => r);
		assert.equal(distinct.length, 3);
		assert.equal(distinct[0].toString(), resources[0].toString());
		assert.equal(distinct[1].toString(), resources[1].toString());
		assert.equal(distinct[2].toString(), resources[2].toString());

		// Parent / Child
		resources = [
			URI.file('/some/folderA'),
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderA/child/file.txt'),
			URI.file('/some/folderA2/file.txt'),
			URI.file('/some/file.txt')
		];

		distinct = distinctParents(resources, r => r);
		assert.equal(distinct.length, 3);
		assert.equal(distinct[0].toString(), resources[0].toString());
		assert.equal(distinct[1].toString(), resources[3].toString());
		assert.equal(distinct[2].toString(), resources[4].toString());
	});

	test('dirname', () => {
		const f = URI.file('/some/file/test.txt');
		const d = dirname(f);
		assert.equal(d.fsPath, normalize('/some/file', true));

		// does not explode (https://github.com/Microsoft/vscode/issues/41987)
		dirname(URI.from({ scheme: 'file', authority: '/users/someone/portal.h' }));
	});

	test('joinPath', () => {
		assert.equal(
			joinPath(URI.file('/foo/bar'), '/file.js').toString(),
			'file:///foo/bar/file.js');

		assert.equal(
			joinPath(URI.file('/foo/bar/'), '/file.js').toString(),
			'file:///foo/bar/file.js');

		assert.equal(
			joinPath(URI.file('/'), '/file.js').toString(),
			'file:///file.js');

		assert.equal(
			joinPath(URI.from({ scheme: 'myScheme', authority: 'authority', path: '/path', query: 'query', fragment: 'fragment' }), '/file.js').toString(),
			'myScheme://authority/path/file.js?query#fragment');
	});

	test('isEqual', () => {
		let fileURI = URI.file('/foo/bar');
		let fileURI2 = URI.file('/foo/Bar');
		assert.equal(isEqual(fileURI, fileURI, true), true);
		assert.equal(isEqual(fileURI, fileURI, false), true);
		assert.equal(isEqual(fileURI, fileURI, hasToIgnoreCase(fileURI)), true);
		assert.equal(isEqual(fileURI, fileURI2, true), true);
		assert.equal(isEqual(fileURI, fileURI2, false), false);

		let fileURI3 = URI.parse('foo://server:453/foo/bar');
		let fileURI4 = URI.parse('foo://server:453/foo/Bar');
		assert.equal(isEqual(fileURI3, fileURI3, true), true);
		assert.equal(isEqual(fileURI3, fileURI3, false), true);
		assert.equal(isEqual(fileURI3, fileURI3, hasToIgnoreCase(fileURI3)), true);
		assert.equal(isEqual(fileURI3, fileURI4, true), true);
		assert.equal(isEqual(fileURI3, fileURI4, false), false);


		assert.equal(isEqual(fileURI, fileURI3, true), false);
	});

	test('isEqualOrParent', () => {
		let fileURI = isWindows ? URI.file('c:\\foo\\bar') : URI.file('/foo/bar');
		let fileURI2 = isWindows ? URI.file('c:\\foo') : URI.file('/foo');
		let fileURI2b = isWindows ? URI.file('C:\\Foo\\') : URI.file('/Foo/');
		assert.equal(isEqualOrParent(fileURI, fileURI, true), true, '1');
		assert.equal(isEqualOrParent(fileURI, fileURI, false), true, '2');
		assert.equal(isEqualOrParent(fileURI, fileURI2, true), true, '3');
		assert.equal(isEqualOrParent(fileURI, fileURI2, false), true, '4');
		assert.equal(isEqualOrParent(fileURI, fileURI2b, true), true, '5');
		assert.equal(isEqualOrParent(fileURI, fileURI2b, false), false, '6');

		assert.equal(isEqualOrParent(fileURI2, fileURI, false), false, '7');
		assert.equal(isEqualOrParent(fileURI2b, fileURI2, true), true, '8');

		let fileURI3 = URI.parse('foo://server:453/foo/bar/goo');
		let fileURI4 = URI.parse('foo://server:453/foo/');
		let fileURI5 = URI.parse('foo://server:453/foo');
		assert.equal(isEqualOrParent(fileURI3, fileURI3, true), true, '11');
		assert.equal(isEqualOrParent(fileURI3, fileURI3, false), true, '12');
		assert.equal(isEqualOrParent(fileURI3, fileURI4, true), true, '13');
		assert.equal(isEqualOrParent(fileURI3, fileURI4, false), true, '14');
		assert.equal(isEqualOrParent(fileURI3, fileURI, true), false, '15');
		assert.equal(isEqualOrParent(fileURI5, fileURI5, true), true, '16');
	});
});