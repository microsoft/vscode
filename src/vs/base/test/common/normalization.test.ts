/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tryNormalizeToBase } from '../../common/normalization.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Normalization', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tryNormalizeToBase', function () {
		assert.strictEqual(tryNormalizeToBase('joào'), 'joao');
		assert.strictEqual(tryNormalizeToBase('joáo'), 'joao');
		assert.strictEqual(tryNormalizeToBase('joâo'), 'joao');
		assert.strictEqual(tryNormalizeToBase('joäo'), 'joao');
		// assert.strictEqual(strings.tryNormalizeToBase('joæo'), 'joao'); // not an accent
		assert.strictEqual(tryNormalizeToBase('joão'), 'joao');
		assert.strictEqual(tryNormalizeToBase('joåo'), 'joao');
		assert.strictEqual(tryNormalizeToBase('joåo'), 'joao');
		assert.strictEqual(tryNormalizeToBase('joāo'), 'joao');

		assert.strictEqual(tryNormalizeToBase('fôo'), 'foo');
		assert.strictEqual(tryNormalizeToBase('föo'), 'foo');
		assert.strictEqual(tryNormalizeToBase('fòo'), 'foo');
		assert.strictEqual(tryNormalizeToBase('fóo'), 'foo');
		// assert.strictEqual(strings.tryNormalizeToBase('fœo'), 'foo');
		// assert.strictEqual(strings.tryNormalizeToBase('føo'), 'foo');
		assert.strictEqual(tryNormalizeToBase('fōo'), 'foo');
		assert.strictEqual(tryNormalizeToBase('fõo'), 'foo');

		assert.strictEqual(tryNormalizeToBase('andrè'), 'andre');
		assert.strictEqual(tryNormalizeToBase('andré'), 'andre');
		assert.strictEqual(tryNormalizeToBase('andrê'), 'andre');
		assert.strictEqual(tryNormalizeToBase('andrë'), 'andre');
		assert.strictEqual(tryNormalizeToBase('andrē'), 'andre');
		assert.strictEqual(tryNormalizeToBase('andrė'), 'andre');
		assert.strictEqual(tryNormalizeToBase('andrę'), 'andre');

		assert.strictEqual(tryNormalizeToBase('hvîc'), 'hvic');
		assert.strictEqual(tryNormalizeToBase('hvïc'), 'hvic');
		assert.strictEqual(tryNormalizeToBase('hvíc'), 'hvic');
		assert.strictEqual(tryNormalizeToBase('hvīc'), 'hvic');
		assert.strictEqual(tryNormalizeToBase('hvįc'), 'hvic');
		assert.strictEqual(tryNormalizeToBase('hvìc'), 'hvic');

		assert.strictEqual(tryNormalizeToBase('ûdo'), 'udo');
		assert.strictEqual(tryNormalizeToBase('üdo'), 'udo');
		assert.strictEqual(tryNormalizeToBase('ùdo'), 'udo');
		assert.strictEqual(tryNormalizeToBase('údo'), 'udo');
		assert.strictEqual(tryNormalizeToBase('ūdo'), 'udo');

		assert.strictEqual(tryNormalizeToBase('heÿ'), 'hey');

		// assert.strictEqual(strings.tryNormalizeToBase('gruß'), 'grus');
		assert.strictEqual(tryNormalizeToBase('gruś'), 'grus');
		assert.strictEqual(tryNormalizeToBase('gruš'), 'grus');

		assert.strictEqual(tryNormalizeToBase('çool'), 'cool');
		assert.strictEqual(tryNormalizeToBase('ćool'), 'cool');
		assert.strictEqual(tryNormalizeToBase('čool'), 'cool');

		assert.strictEqual(tryNormalizeToBase('ñice'), 'nice');
		assert.strictEqual(tryNormalizeToBase('ńice'), 'nice');

		// Different cases
		assert.strictEqual(tryNormalizeToBase('CAFÉ'), 'cafe');
		assert.strictEqual(tryNormalizeToBase('Café'), 'cafe');
		assert.strictEqual(tryNormalizeToBase('café'), 'cafe');
		assert.strictEqual(tryNormalizeToBase('JOÃO'), 'joao');
		assert.strictEqual(tryNormalizeToBase('João'), 'joao');

		// Mixed cases with accents
		assert.strictEqual(tryNormalizeToBase('CaFé'), 'cafe');
		assert.strictEqual(tryNormalizeToBase('JoÃo'), 'joao');
		assert.strictEqual(tryNormalizeToBase('AnDrÉ'), 'andre');

		// Precomposed accents
		assert.strictEqual(tryNormalizeToBase('\u00E9'), 'e');
		assert.strictEqual(tryNormalizeToBase('\u00E0'), 'a');
		assert.strictEqual(tryNormalizeToBase('caf\u00E9'), 'cafe');

		// Base + combining accents - lower only
		assert.strictEqual(tryNormalizeToBase('\u0065\u0301'), '\u0065\u0301');
		assert.strictEqual(tryNormalizeToBase('Ã\u0061\u0300'), 'ã\u0061\u0300');
		assert.strictEqual(tryNormalizeToBase('CaF\u0065\u0301'), 'caf\u0065\u0301');
	});
});
