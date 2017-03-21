/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { BufferedContent } from 'vs/workbench/parts/output/browser/outputServices';

suite('Workbench - Output Buffered Content', () => {

	test('Buffered Content - Simple', () => {
		const bufferedContent = new BufferedContent();
		bufferedContent.append('first');
		bufferedContent.append('second');
		bufferedContent.append('third');
		const delta = bufferedContent.getDelta();
		assert.equal(bufferedContent.getDelta().value, 'firstsecondthird');
		bufferedContent.clear();
		assert.equal(bufferedContent.getDelta().value, '');
		assert.equal(bufferedContent.getDelta(delta).value, '');
	});

	test('Buffered Content - Lots of output', () => {
		const bufferedContent = new BufferedContent();
		bufferedContent.append('first line');
		const firstDelta = bufferedContent.getDelta();
		for (var i = 0; i < 100000; i++) {
			bufferedContent.append(i.toString());
		}
		const secondDelta = bufferedContent.getDelta(firstDelta);
		assert.equal(!!secondDelta.append, false);
		assert.equal(secondDelta.value.substr(secondDelta.value.length - 5), '99999');
		bufferedContent.clear();
		assert.equal(bufferedContent.getDelta().value, '');
	});
});
