/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parsePartialToolInput, parsePartialToolInputForDisplay } from '../../common/partialToolInput.js';

suite('PartialToolInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns useful object fields from incomplete JSON', () => {
		assert.deepStrictEqual(parsePartialToolInputForDisplay('{"command":"npm test","description":"Run'), {
			command: 'npm test',
			description: 'Run',
		});
	});

	test('returns undefined when no object fields are parseable', () => {
		assert.deepStrictEqual([
			parsePartialToolInputForDisplay('{"comm'),
			parsePartialToolInputForDisplay('custom input'),
			parsePartialToolInputForDisplay('["item"]'),
		], [
			undefined,
			undefined,
			undefined,
		]);
	});

	test('returns a snapshot instead of the cached object', () => {
		const raw = '{"command":"npm test"}';
		const first = parsePartialToolInputForDisplay(raw);
		assert.ok(first);
		first['command'] = 'modified';

		assert.deepStrictEqual(parsePartialToolInputForDisplay(raw), {
			command: 'npm test',
		});
	});

	test('bounds generic display parsing', () => {
		const raw = `{"command":"npm test","content":"${'x'.repeat(70 * 1024)}"}`;
		const parsed = parsePartialToolInputForDisplay(raw);
		assert.deepStrictEqual({
			command: parsed?.['command'],
			contentIsTruncated: typeof parsed?.['content'] === 'string' && parsed['content'].length < raw.length,
		}, {
			command: 'npm test',
			contentIsTruncated: true,
		});
	});

	test('supports uncapped provider parsing', () => {
		const content = 'x'.repeat(70 * 1024);
		assert.strictEqual(parsePartialToolInput(`{"content":"${content}"}`)?.['content'], content);
	});
});
