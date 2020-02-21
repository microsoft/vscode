/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { BoundModelReferenceCollection } from 'vs/workbench/api/browser/mainThreadDocuments';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';
import { timeout } from 'vs/base/common/async';

suite('BoundModelReferenceCollection', () => {

	let col = new BoundModelReferenceCollection(15, 75);

	teardown(() => {
		col.dispose();
	});

	test('max age', async () => {

		let didDispose = false;

		col.add({
			object: <any>{ textEditorModel: createTextModel('farboo') },
			dispose() {
				didDispose = true;
			}
		});

		await timeout(30);
		assert.equal(didDispose, true);
	});

	test('max size', () => {

		let disposed: number[] = [];

		col.add({
			object: <any>{ textEditorModel: createTextModel('farboo') },
			dispose() {
				disposed.push(0);
			}
		});
		col.add({
			object: <any>{ textEditorModel: createTextModel('boofar') },
			dispose() {
				disposed.push(1);
			}
		});

		col.add({
			object: <any>{ textEditorModel: createTextModel(new Array(71).join('x')) },
			dispose() {
				disposed.push(2);
			}
		});

		assert.deepEqual(disposed, [0, 1]);
	});

});
