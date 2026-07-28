/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parsePartialToolInput } from '../../common/partialToolInput.js';

suite('PartialToolInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns useful object fields from incomplete JSON', () => {
		assert.deepStrictEqual(parsePartialToolInput('{"command":"npm test","description":"Run'), {
			raw: '{"command":"npm test","description":"Run',
			value: {
				command: 'npm test',
				description: 'Run',
			},
		});
	});

	test('preserves raw input when no object fields are parseable', () => {
		assert.deepStrictEqual([
			parsePartialToolInput('{"comm'),
			parsePartialToolInput('custom input'),
			parsePartialToolInput('["item"]'),
		], [
			{ raw: '{"comm', value: {} },
			{ raw: 'custom input', value: undefined },
			{ raw: '["item"]', value: undefined },
		]);
	});

	test('bounds display parsing while preserving the complete raw input', () => {
		const raw = `{"command":"npm test","content":"${'x'.repeat(70 * 1024)}"}`;
		const parsed = parsePartialToolInput(raw);
		assert.strictEqual(parsed.raw, raw);
		assert.strictEqual(parsed.value?.['command'], 'npm test');
		assert.ok(typeof parsed.value?.['content'] === 'string');
		assert.ok(parsed.value['content'].length < raw.length);
	});
});
