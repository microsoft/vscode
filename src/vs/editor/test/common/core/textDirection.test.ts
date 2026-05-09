/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EditorOptions } from '../../../common/config/editorOptions.js';
import { getConfiguredTextDirection, getConfiguredTypingDirection, resolveTextDirectionPreset } from '../../../common/core/textDirection.js';
import { TextDirection } from '../../../common/model.js';

suite('TextDirection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates editor.textDirection defaults and invalid values', () => {
		assert.strictEqual(EditorOptions.textDirection.validate(undefined), 'contextual');
		assert.strictEqual(EditorOptions.textDirection.validate('contextual'), 'contextual');
		assert.strictEqual(EditorOptions.textDirection.validate('auto'), 'auto');
		assert.strictEqual(EditorOptions.textDirection.validate('auto-keep'), 'auto');
		assert.strictEqual(EditorOptions.textDirection.validate('auto-follow'), 'auto-follow');
		assert.strictEqual(EditorOptions.textDirection.validate('default'), 'default');
		assert.strictEqual(EditorOptions.textDirection.validate('ltr'), 'ltr');
		assert.strictEqual(EditorOptions.textDirection.validate('rtl'), 'rtl');
		assert.strictEqual(EditorOptions.textDirection.validate('nope'), 'contextual');
		assert.strictEqual(EditorOptions.textDirection.validate({ mode: 'auto' }), 'contextual');
	});

	test('resolves contextual text direction by language', () => {
		assert.strictEqual(resolveTextDirectionPreset('contextual', 'plaintext'), 'auto-follow');
		assert.strictEqual(resolveTextDirectionPreset('contextual', 'markdown'), 'auto-follow');
		assert.strictEqual(resolveTextDirectionPreset('contextual', 'python'), 'auto');
		assert.strictEqual(resolveTextDirectionPreset('contextual'), 'auto-follow');
	});

	test('contextual mode lets prose-like documents follow leading neutral characters', () => {
		assert.deepStrictEqual({
			line: getConfiguredTextDirection('# فارسی', 'contextual', TextDirection.LTR, 'plaintext'),
			typing: getConfiguredTypingDirection('# فارسی', 'contextual', TextDirection.LTR, 'plaintext'),
		}, { line: TextDirection.RTL, typing: TextDirection.RTL });
	});

	test('contextual mode keeps leading neutral characters in syntax-heavy languages', () => {
		assert.deepStrictEqual({
			line: getConfiguredTextDirection('# فارسی', 'contextual', TextDirection.LTR, 'python'),
			typing: getConfiguredTypingDirection('# فارسی', 'contextual', TextDirection.LTR, 'python'),
		}, { line: TextDirection.LTR, typing: TextDirection.LTR });
	});

	test('auto and contextual keep strong rtl content ltr in syntax-heavy languages', () => {
		assert.deepStrictEqual({
			autoLine: getConfiguredTextDirection('سلام', 'auto', TextDirection.LTR, 'typescript'),
			autoTyping: getConfiguredTypingDirection('سلام', 'auto', TextDirection.LTR, 'typescript'),
			contextualLine: getConfiguredTextDirection('سلام', 'contextual', TextDirection.LTR, 'typescript'),
			contextualTyping: getConfiguredTypingDirection('سلام', 'contextual', TextDirection.LTR, 'typescript'),
		}, {
			autoLine: TextDirection.LTR,
			autoTyping: TextDirection.LTR,
			contextualLine: TextDirection.LTR,
			contextualTyping: TextDirection.LTR,
		});
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

	test('treats Arabic-script digits as weak numbers instead of strong rtl characters', () => {
		assert.deepStrictEqual({
			ascii: getConfiguredTextDirection('123 hello', 'auto-follow', TextDirection.RTL),
			persian: getConfiguredTextDirection('۱۲۳ hello', 'auto-follow', TextDirection.RTL),
			arabicIndic: getConfiguredTextDirection('١٢٣ hello', 'auto-follow', TextDirection.RTL),
		}, { ascii: TextDirection.LTR, persian: TextDirection.LTR, arabicIndic: TextDirection.LTR });

		assert.deepStrictEqual({
			ascii: getConfiguredTypingDirection('123 فارسی', 'auto', TextDirection.LTR),
			persian: getConfiguredTypingDirection('۱۲۳ فارسی', 'auto', TextDirection.LTR),
			arabicIndic: getConfiguredTypingDirection('١٢٣ فارسی', 'auto', TextDirection.LTR),
		}, { ascii: TextDirection.LTR, persian: TextDirection.LTR, arabicIndic: TextDirection.LTR });
	});

	test('respects explicit force modes', () => {
		assert.strictEqual(getConfiguredTextDirection('hello', 'rtl', TextDirection.LTR), TextDirection.RTL);
		assert.strictEqual(getConfiguredTextDirection('فارسی', 'ltr', TextDirection.RTL), TextDirection.LTR);
	});

	test('respects default mode and falls back when no strong character exists', () => {
		assert.strictEqual(getConfiguredTextDirection('# 123', 'default', TextDirection.RTL), TextDirection.RTL);
		assert.strictEqual(getConfiguredTextDirection('# 123', 'auto-follow', TextDirection.LTR), TextDirection.LTR);
	});

	test('auto keeps the base direction for neutral-prefix RTL content', () => {
		assert.deepStrictEqual({
			line: getConfiguredTextDirection('# فارسی', 'auto', TextDirection.LTR),
			typing: getConfiguredTypingDirection('# فارسی', 'auto', TextDirection.LTR),
		}, { line: TextDirection.LTR, typing: TextDirection.LTR });
	});

	test('auto keeps the base direction for mixed RTL/LTR content after a neutral prefix', () => {
		assert.strictEqual(getConfiguredTextDirection('. سلام kami چطوری', 'auto', TextDirection.LTR), TextDirection.LTR);
		assert.strictEqual(getConfiguredTypingDirection('# hello', 'auto', TextDirection.LTR), TextDirection.LTR);
	});

	test('auto and auto-follow remain the two distinct auto modes for neutral-prefix RTL content', () => {
		const input = '# فارسی';

		assert.deepStrictEqual({
			line: getConfiguredTextDirection(input, 'auto', TextDirection.LTR),
			typing: getConfiguredTypingDirection(input, 'auto', TextDirection.LTR),
		}, { line: TextDirection.LTR, typing: TextDirection.LTR });

		assert.deepStrictEqual({
			line: getConfiguredTextDirection(input, 'auto-follow', TextDirection.LTR),
			typing: getConfiguredTypingDirection(input, 'auto-follow', TextDirection.LTR),
		}, { line: TextDirection.RTL, typing: TextDirection.RTL });
	});

	test('auto detects direction from markdown inline code content', () => {
		const input = '```سلام World خوب هستی```';

		assert.deepStrictEqual({
			line: getConfiguredTextDirection(input, 'auto', TextDirection.LTR),
			typing: getConfiguredTypingDirection(input, 'auto', TextDirection.LTR),
		}, { line: TextDirection.RTL, typing: TextDirection.RTL });
	});

	test('auto detects direction from markdown fenced block content', () => {
		const input = '```md\nسلام World خوب هستی\n```';

		assert.deepStrictEqual({
			line: getConfiguredTextDirection(input, 'auto', TextDirection.LTR),
			typing: getConfiguredTypingDirection(input, 'auto', TextDirection.LTR),
		}, { line: TextDirection.RTL, typing: TextDirection.RTL });
	});
});
