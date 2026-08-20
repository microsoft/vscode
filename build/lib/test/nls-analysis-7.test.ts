/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import { after, suite, test } from 'node:test';
import { analyzeLocalizeCalls as analyzeLocalizeCalls6 } from '../nls-analysis.ts';
import { NlsAnalyzer } from '../nls-analysis-7.ts';

suite('TypeScript 7 NLS analysis', () => {
	const analyzer = new NlsAnalyzer();

	after(() => analyzer.dispose());

	test('matches TypeScript 6 analysis', () => {
		const sources = [
			[
				'import { localize, localize2 as translate } from "vs/nls";',
				'const one = localize("one", "One");',
				'const two = translate({ key: "two", comment: ["context"] }, `Two`);',
				'function nested(localize: (key: string, value: string) => string) {',
				'\treturn localize("shadowed", "Shadowed");',
				'}',
			].join('\n'),
			[
				'import * as nls from "vs/nls.js";',
				'const one = nls.localize("one", "One");',
				'const two = nls.localize2("two", "Two");',
			].join('\n'),
			[
				'import nls = require("vs/nls");',
				'const one = nls.localize("one", "One");',
			].join('\n'),
			[
				'import { localize } from "other/module";',
				'const ignored = localize("ignored", "Ignored");',
			].join('\n'),
		];

		const expected = sources.map(source => ({
			localize: analyzeLocalizeCalls6(source, 'localize'),
			localize2: analyzeLocalizeCalls6(source, 'localize2'),
		}));
		const actual = sources.map(source => ({
			localize: analyzer.analyzeLocalizeCalls(source, 'localize'),
			localize2: analyzer.analyzeLocalizeCalls(source, 'localize2'),
		}));

		assert.deepStrictEqual(actual, expected);
	});
});
