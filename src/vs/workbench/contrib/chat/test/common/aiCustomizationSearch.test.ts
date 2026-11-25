/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { customizationSearchMatchesAny, matchesCustomizationSearchQuery, splitCustomizationSearchWords } from '../../common/aiCustomizationSearch.js';

suite('Customization search', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('treats dashes, underscores, dots, slashes and spaces as interchangeable separators', () => {
		const cases: [query: string, target: string][] = [
			['handy commands', 'handy-commands'],
			['handy-commands', 'handy-commands'],
			['handy_commands', 'handy-commands'],
			['handy commands', 'handy_commands'],
			['chrome-devtools', 'Chrome DevTools MCP'],
			['chrome devtools', 'chrome-devtools-mcp'],
			['github/issues', 'GitHub Issues'],
			['settings json', 'settings.json'],
			['  handy   commands ', 'handy-commands'],
			['Take  Screenshot', 'Take  Screenshot'],
			['CHROME DevTools', 'chrome-devtools'],
			['chrome', 'Chrome DevTools MCP'],
			['timeline', 'session-timeline'],
			['timeline session', 'session-timeline'],
			['chrome tools', 'Chrome DevTools MCP'],
			['', 'anything'],
		];
		assert.deepStrictEqual({
			matches: cases.map(([query, target]) => `${query} -> ${target}: ${JSON.stringify(matchesCustomizationSearchQuery(query, target))}`),
			any: [
				customizationSearchMatchesAny('handy commands', [undefined, 'A plugin', 'handy-commands']),
				customizationSearchMatchesAny('missing', [undefined, 'handy-commands']),
				customizationSearchMatchesAny(' ', []),
			],
			words: splitCustomizationSearchWords(' GitHub-issues_tracker.v2/api  docs '),
		}, {
			matches: [
				'handy commands -> handy-commands: [{"start":0,"end":5},{"start":6,"end":14}]',
				'handy-commands -> handy-commands: [{"start":0,"end":14}]',
				'handy_commands -> handy-commands: [{"start":0,"end":14}]',
				'handy commands -> handy_commands: [{"start":0,"end":5},{"start":6,"end":14}]',
				'chrome-devtools -> Chrome DevTools MCP: [{"start":0,"end":6},{"start":7,"end":15}]',
				'chrome devtools -> chrome-devtools-mcp: [{"start":0,"end":6},{"start":7,"end":15}]',
				'github/issues -> GitHub Issues: [{"start":0,"end":6},{"start":7,"end":13}]',
				'settings json -> settings.json: [{"start":0,"end":8},{"start":9,"end":13}]',
				'  handy   commands  -> handy-commands: [{"start":0,"end":5},{"start":6,"end":14}]',
				'Take  Screenshot -> Take  Screenshot: [{"start":0,"end":16}]',
				'CHROME DevTools -> chrome-devtools: [{"start":0,"end":6},{"start":7,"end":15}]',
				'chrome -> Chrome DevTools MCP: [{"start":0,"end":6}]',
				'timeline -> session-timeline: [{"start":8,"end":16}]',
				'timeline session -> session-timeline: null',
				'chrome tools -> Chrome DevTools MCP: null',
				' -> anything: []',
			],
			any: [true, false, true],
			words: ['github', 'issues', 'tracker', 'v2', 'api', 'docs'],
		});
	});
});
