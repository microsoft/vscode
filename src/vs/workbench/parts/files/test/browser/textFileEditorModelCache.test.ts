/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {TextFileEditorModelCache} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {EditorModel} from 'vs/workbench/common/editor';

suite('Files - TextFileEditorModelCache', () => {

	test('add, remove, clear', function () {
		const cache = new TextFileEditorModelCache();

		const m1 = new EditorModel();
		const m2 = new EditorModel();
		const m3 = new EditorModel();

		cache.add(URI.file('/test.html'), <any>m1);
		cache.add(URI.file('/some/other.html'), <any>m2);
		cache.add(URI.file('/some/this.txt'), <any>m3);

		assert(!cache.get(URI.file('foo')));
		assert.strictEqual(cache.get(URI.file('/test.html')), m1);

		let result = cache.getAll();
		assert.strictEqual(3, result.length);

		result = cache.getAll(URI.file('/yes'));
		assert.strictEqual(0, result.length);

		result = cache.getAll(URI.file('/some/other.txt'));
		assert.strictEqual(0, result.length);

		result = cache.getAll(URI.file('/some/other.html'));
		assert.strictEqual(1, result.length);

		cache.remove(URI.file(''));

		result = cache.getAll();
		assert.strictEqual(3, result.length);

		cache.remove(URI.file('/test.html'));

		result = cache.getAll();
		assert.strictEqual(2, result.length);

		cache.clear();
		result = cache.getAll();
		assert.strictEqual(0, result.length);
	});
});