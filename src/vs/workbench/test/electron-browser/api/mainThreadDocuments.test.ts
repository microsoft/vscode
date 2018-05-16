/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { BoundModelReferenceCollection } from 'vs/workbench/api/electron-browser/mainThreadDocuments';
import { TextModel } from 'vs/editor/common/model/textModel';
import { timeout } from 'vs/base/common/async';

suite('BoundModelReferenceCollection', () => {

	let col = new BoundModelReferenceCollection(15, 75);

	teardown(() => {
		col.dispose();
	});

	test('max age', () => {

		let didDispose = false;

		col.add({
			object: <any>{ textEditorModel: TextModel.createFromString('farboo') },
			dispose() {
				didDispose = true;
			}
		});

		return timeout(30).then(() => {
			assert.equal(didDispose, true);
		});
	});

	test('max size', () => {

		let disposed: number[] = [];

		col.add({
			object: <any>{ textEditorModel: TextModel.createFromString('farboo') },
			dispose() {
				disposed.push(0);
			}
		});
		col.add({
			object: <any>{ textEditorModel: TextModel.createFromString('boofar') },
			dispose() {
				disposed.push(1);
			}
		});

		col.add({
			object: <any>{ textEditorModel: TextModel.createFromString(new Array(71).join('x')) },
			dispose() {
				disposed.push(2);
			}
		});

		assert.deepEqual(disposed, [0, 1]);
	});

});
