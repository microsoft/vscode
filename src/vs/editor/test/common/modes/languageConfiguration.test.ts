/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { LanguageIdentifier, StandardTokenType } from 'vs/editor/common/modes';
import { StandardAutoClosingPairConditional } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';

suite('StandardAutoClosingPairConditional', () => {

	test('Missing notIn', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}' });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), true);
		assert.strictEqual(v.isOK(StandardTokenType.String), true);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), true);
	});

	test('Empty notIn', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: [] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), true);
		assert.strictEqual(v.isOK(StandardTokenType.String), true);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), true);
	});

	test('Invalid notIn', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['bla'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), true);
		assert.strictEqual(v.isOK(StandardTokenType.String), true);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in strings', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), true);
		assert.strictEqual(v.isOK(StandardTokenType.String), false);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in comments', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['comment'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), false);
		assert.strictEqual(v.isOK(StandardTokenType.String), true);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['regex'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), true);
		assert.strictEqual(v.isOK(StandardTokenType.String), true);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), false);
	});

	test('notIn in strings nor comments', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string', 'comment'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), false);
		assert.strictEqual(v.isOK(StandardTokenType.String), false);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in strings nor regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string', 'regex'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), true);
		assert.strictEqual(v.isOK(StandardTokenType.String), false);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), false);
	});

	test('notIn in comments nor regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['comment', 'regex'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), false);
		assert.strictEqual(v.isOK(StandardTokenType.String), true);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), false);
	});

	test('notIn in strings, comments nor regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string', 'comment', 'regex'] });
		assert.strictEqual(v.isOK(StandardTokenType.Other), true);
		assert.strictEqual(v.isOK(StandardTokenType.Comment), false);
		assert.strictEqual(v.isOK(StandardTokenType.String), false);
		assert.strictEqual(v.isOK(StandardTokenType.RegEx), false);
	});

	test('language configurations priorities', () => {
		const id = new LanguageIdentifier('testLang1', 15);
		const d1 = LanguageConfigurationRegistry.register(id, { comments: { lineComment: '1' } }, 100);
		const d2 = LanguageConfigurationRegistry.register(id, { comments: { lineComment: '2' } }, 10);
		assert.strictEqual(LanguageConfigurationRegistry.getComments(id.id)?.lineCommentToken, '1');
		d1.dispose();
		d2.dispose();
	});
});
