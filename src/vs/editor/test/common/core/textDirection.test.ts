/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EditorOptions } from '../../../common/config/editorOptions.js';
import { getConfiguredTextDirection, getConfiguredTypingDirection } from '../../../common/core/textDirection.js';
import { TextDirection } from '../../../common/model.js';

suite('TextDirection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates editor.textDirection defaults and invalid values', () => {
		assert.strictEqual(EditorOptions.textDirection.validate(undefined), 'auto');
		assert.strictEqual(EditorOptions.textDirection.validate('auto'), 'auto');
		assert.strictEqual(EditorOptions.textDirection.validate('auto-keep'), 'auto-keep');
		assert.strictEqual(EditorOptions.textDirection.validate('auto-follow'), 'auto-follow');
		assert.strictEqual(EditorOptions.textDirection.validate('default'), 'default');
		assert.strictEqual(EditorOptions.textDirection.validate('ltr'), 'ltr');
		assert.strictEqual(EditorOptions.textDirection.validate('rtl'), 'rtl');
		assert.strictEqual(EditorOptions.textDirection.validate('nope'), 'auto');
		assert.strictEqual(EditorOptions.textDirection.validate({ mode: 'auto' }), 'auto');
	});

	test('detects rtl when content starts with a strong rtl character', () => {
		assert.strictEqual(getConfiguredTextDirection('فارسی test', 'auto', TextDirection.LTR), TextDirection.RTL);
	});

	test('detects ltr when content starts with a strong ltr character', () => {
		assert.strictEqual(getConfiguredTextDirection('comment فارسی', 'auto-follow', TextDirection.RTL), TextDirection.LTR);
	});

	test('ignores leading whitespace during auto detection', () => {
		assert.strictEqual(getConfiguredTextDirection('   فارسی', 'auto', TextDirection.LTR), TextDirection.RTL);
	});

	test('keeps the base direction when leading neutral characters are configured to do so', () => {
		assert.strictEqual(getConfiguredTextDirection('# فارسی', 'auto', TextDirection.LTR), TextDirection.LTR);
	});

	test('allows leading neutral characters to follow content when configured', () => {
		assert.strictEqual(getConfiguredTextDirection('# فارسی', 'auto-follow', TextDirection.LTR), TextDirection.RTL);
	});

	test('respects explicit force modes', () => {
		assert.strictEqual(getConfiguredTextDirection('hello', 'rtl', TextDirection.LTR), TextDirection.RTL);
		assert.strictEqual(getConfiguredTextDirection('فارسی', 'ltr', TextDirection.RTL), TextDirection.LTR);
	});

	test('respects default mode and falls back when no strong character exists', () => {
		assert.strictEqual(getConfiguredTextDirection('# 123', 'default', TextDirection.RTL), TextDirection.RTL);
		assert.strictEqual(getConfiguredTextDirection('# 123', 'auto-follow', TextDirection.LTR), TextDirection.LTR);
	});

	suite('auto-keep', () => {
		// Line rendering: line stays LTR so neutral prefix anchors at the left edge
		test('line direction stays LTR when neutral prefix precedes RTL content', () => {
			assert.strictEqual(getConfiguredTextDirection('# فارسی', 'auto-keep', TextDirection.LTR), TextDirection.LTR);
		});

		// Typing direction: RTL so user types right-to-left after the neutral prefix
		test('typing direction becomes RTL for neutral + RTL content', () => {
			assert.strictEqual(getConfiguredTypingDirection('# فارسی', 'auto-keep', TextDirection.LTR), TextDirection.RTL);
		});

		// When the strong character after neutral is LTR, typing stays LTR
		test('typing direction stays LTR when first strong character after neutral is LTR', () => {
			assert.strictEqual(getConfiguredTypingDirection('# hello', 'auto-keep', TextDirection.LTR), TextDirection.LTR);
		});

		// Compare all three auto modes for the same '# فارسی' input:
		test('all three auto modes produce distinct line + typing directions for # + RTL', () => {
			const input = '# فارسی';

			// auto: line LTR, typing LTR
			assert.deepStrictEqual({
				line: getConfiguredTextDirection(input, 'auto', TextDirection.LTR),
				typing: getConfiguredTypingDirection(input, 'auto', TextDirection.LTR),
			}, { line: TextDirection.LTR, typing: TextDirection.LTR });

			// auto-keep: line LTR (# stays at left), typing RTL (right-to-left input)
			assert.deepStrictEqual({
				line: getConfiguredTextDirection(input, 'auto-keep', TextDirection.LTR),
				typing: getConfiguredTypingDirection(input, 'auto-keep', TextDirection.LTR),
			}, { line: TextDirection.LTR, typing: TextDirection.RTL });

			// auto-follow: line RTL (# moves to right), typing RTL
			assert.deepStrictEqual({
				line: getConfiguredTextDirection(input, 'auto-follow', TextDirection.LTR),
				typing: getConfiguredTypingDirection(input, 'auto-follow', TextDirection.LTR),
			}, { line: TextDirection.RTL, typing: TextDirection.RTL });
		});
	});
});
