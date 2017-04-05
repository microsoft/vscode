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

	test('Buffered Content - Appending Output', () => {
		const bufferedContent = new BufferedContent();
		bufferedContent.append('first');
		const firstDelta = bufferedContent.getDelta();
		bufferedContent.append('second');
		bufferedContent.append('third');
		const secondDelta = bufferedContent.getDelta(firstDelta);
		assert.equal(secondDelta.append, true);
		assert.equal(secondDelta.value, 'secondthird');
		bufferedContent.append('fourth');
		bufferedContent.append('fifth');
		assert.equal(bufferedContent.getDelta(firstDelta).value, 'secondthirdfourthfifth');
		assert.equal(bufferedContent.getDelta(secondDelta).value, 'fourthfifth');
	});

	test('Buffered Content - Lots of Output', function () {
		this.timeout(10000);
		const bufferedContent = new BufferedContent();
		bufferedContent.append('first line');
		const firstDelta = bufferedContent.getDelta();
		let longString = '';
		for (var i = 0; i < 50000; i++) {
			bufferedContent.append(i.toString());
			longString += i.toString();
		}
		const secondDelta = bufferedContent.getDelta(firstDelta);
		assert.equal(secondDelta.append, true);
		assert.equal(secondDelta.value.substr(secondDelta.value.length - 5), '49999');
		longString = longString + longString + longString + longString;
		bufferedContent.append(longString);
		bufferedContent.append(longString);
		const thirdDelta = bufferedContent.getDelta(firstDelta);
		assert.equal(!!thirdDelta.append, false);
		assert.equal(thirdDelta.value.substr(thirdDelta.value.length - 5), '49999');

		bufferedContent.clear();
		assert.equal(bufferedContent.getDelta().value, '');
	});
});
