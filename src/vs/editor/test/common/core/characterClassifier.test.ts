/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CharCode } from '../../../../base/common/charCode.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CharacterClassifier } from '../../../common/core/characterClassifier.js';

suite('CharacterClassifier', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('works', () => {
		const classifier = new CharacterClassifier<number>(0);

		assert.strictEqual(classifier.get(-1), 0);
		assert.strictEqual(classifier.get(0), 0);
		assert.strictEqual(classifier.get(CharCode.a), 0);
		assert.strictEqual(classifier.get(CharCode.b), 0);
		assert.strictEqual(classifier.get(CharCode.z), 0);
		assert.strictEqual(classifier.get(255), 0);
		assert.strictEqual(classifier.get(1000), 0);
		assert.strictEqual(classifier.get(2000), 0);

		classifier.set(CharCode.a, 1);
		classifier.set(CharCode.z, 2);
		classifier.set(1000, 3);

		assert.strictEqual(classifier.get(-1), 0);
		assert.strictEqual(classifier.get(0), 0);
		assert.strictEqual(classifier.get(CharCode.a), 1);
		assert.strictEqual(classifier.get(CharCode.b), 0);
		assert.strictEqual(classifier.get(CharCode.z), 2);
		assert.strictEqual(classifier.get(255), 0);
		assert.strictEqual(classifier.get(1000), 3);
		assert.strictEqual(classifier.get(2000), 0);
	});

});
