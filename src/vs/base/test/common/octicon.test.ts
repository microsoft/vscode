/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { IMatch } from 'vs/base/common/filters';
import { matchesFuzzyOcticonAware, parseOcticons } from 'vs/base/common/octicon';

export interface IOcticonFilter {
	// Returns null if word doesn't match.
	(query: string, target: { text: string, octiconOffsets?: number[] }): IMatch[] | null;
}

function filterOk(filter: IOcticonFilter, word: string, target: { text: string, octiconOffsets?: number[] }, highlights?: { start: number; end: number; }[]) {
	let r = filter(word, target);
	assert(r);
	if (highlights) {
		assert.deepEqual(r, highlights);
	}
}

suite('Octicon', () => {
	test('matchesFuzzzyOcticonAware', () => {

		// Camel Case

		filterOk(matchesFuzzyOcticonAware, 'ccr', parseOcticons('$(octicon)CamelCaseRocks$(octicon)'), [
			{ start: 10, end: 11 },
			{ start: 15, end: 16 },
			{ start: 19, end: 20 }
		]);

		filterOk(matchesFuzzyOcticonAware, 'ccr', parseOcticons('$(octicon) CamelCaseRocks $(octicon)'), [
			{ start: 11, end: 12 },
			{ start: 16, end: 17 },
			{ start: 20, end: 21 }
		]);

		filterOk(matchesFuzzyOcticonAware, 'iut', parseOcticons('$(octicon) Indent $(octico) Using $(octic) Tpaces'), [
			{ start: 11, end: 12 },
			{ start: 28, end: 29 },
			{ start: 43, end: 44 },
		]);

		// Prefix

		filterOk(matchesFuzzyOcticonAware, 'using', parseOcticons('$(octicon) Indent Using Spaces'), [
			{ start: 18, end: 23 },
		]);

		// Broken Octicon

		filterOk(matchesFuzzyOcticonAware, 'octicon', parseOcticons('This $(octicon Indent Using Spaces'), [
			{ start: 7, end: 14 },
		]);

		filterOk(matchesFuzzyOcticonAware, 'indent', parseOcticons('This $octicon Indent Using Spaces'), [
			{ start: 14, end: 20 },
		]);

		// Testing #59343
		filterOk(matchesFuzzyOcticonAware, 'unt', parseOcticons('$(primitive-dot) $(file-text) Untitled-1'), [
			{ start: 30, end: 33 },
		]);
	});
});
