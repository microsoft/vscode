/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getNewSessionWelcomePhrases, resolveWelcomePhraseTemplate } from '../../common/welcomePhrases.js';

suite('New session welcome phrases', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('positions the welcome name anywhere in a custom phrase', () => {
		const templates = [
			'Back at it, {name}',
			'{name}, what are we shipping?',
			'Hey {name}!',
			'What are we building, {name}?',
			'Ready when you are',
		];

		assert.deepStrictEqual({
			named: templates.map(template => resolveWelcomePhraseTemplate(template, 'Megan')),
			unnamed: templates.map(template => resolveWelcomePhraseTemplate(template, undefined)),
		}, {
			named: [
				'Back at it, Megan',
				'Megan, what are we shipping?',
				'Hey Megan!',
				'What are we building, Megan?',
				'Ready when you are',
			],
			unnamed: [
				'Back at it',
				'What are we shipping?',
				'Hey!',
				'What are we building?',
				'Ready when you are',
			],
		});
	});

	test('appends, replaces, and falls back to the default phrases', () => {
		const defaults = getNewSessionWelcomePhrases(undefined, undefined);
		const namedDefaults = getNewSessionWelcomePhrases(undefined, 'Megan');
		const appended = getNewSessionWelcomePhrases({ mode: 'append', phrases: ['Back at it, {name}', '   '] }, 'Megan');
		const replaced = getNewSessionWelcomePhrases({ mode: 'replace', phrases: ['Back at it, {name}'] }, 'Megan');
		const replacedWithoutPhrases = getNewSessionWelcomePhrases({ mode: 'replace', phrases: ['  '] }, undefined);

		assert.deepStrictEqual({
			defaultCount: defaults.length,
			appendedExtras: appended.slice(namedDefaults.length),
			replaced,
			replacedWithoutPhrases,
		}, {
			defaultCount: 5,
			appendedExtras: ['Back at it, Megan'],
			replaced: ['Back at it, Megan'],
			replacedWithoutPhrases: defaults,
		});
	});
});
