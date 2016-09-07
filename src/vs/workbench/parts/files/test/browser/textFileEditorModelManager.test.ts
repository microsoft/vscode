/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {TextFileEditorModelManager} from 'vs/workbench/parts/files/common/editors/textFileEditorModelManager';
import {EditorModel} from 'vs/workbench/common/editor';

suite('Files - TextFileEditorModelManager', () => {

	test('add, remove, clear', function () {
		const manager = new TextFileEditorModelManager();

		const model1 = new EditorModel();
		const model2 = new EditorModel();
		const model3 = new EditorModel();

		manager.add(URI.file('/test.html'), <any>model1);
		manager.add(URI.file('/some/other.html'), <any>model2);
		manager.add(URI.file('/some/this.txt'), <any>model3);

		assert(!manager.get(URI.file('foo')));
		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		let result = manager.getAll();
		assert.strictEqual(3, result.length);

		result = manager.getAll(URI.file('/yes'));
		assert.strictEqual(0, result.length);

		result = manager.getAll(URI.file('/some/other.txt'));
		assert.strictEqual(0, result.length);

		result = manager.getAll(URI.file('/some/other.html'));
		assert.strictEqual(1, result.length);

		manager.remove(URI.file(''));

		result = manager.getAll();
		assert.strictEqual(3, result.length);

		manager.remove(URI.file('/test.html'));

		result = manager.getAll();
		assert.strictEqual(2, result.length);

		manager.clear();
		result = manager.getAll();
		assert.strictEqual(0, result.length);
	});
});