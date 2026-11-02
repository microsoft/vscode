/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createMatches } from '../../../../../base/common/filters.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { findSearchWords, getSessionSearchHint, ISessionSearchDocument, ISessionSearchField, matchSessionSearch, SessionsListSearchQuery, SessionsListSearchTelemetry, toSearchFilterData } from '../../browser/views/sessionsListSearch.js';

suite('Sessions - SessionsListSearch', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * How a session matches, as the matched text of its title, and the hint that explains it when its row and section
	 * headers show `shownTexts`; or `undefined` when it does not match.
	 */
	function match(pattern: string, title: string, fields: readonly ISessionSearchField[] = [], chatTitles: readonly string[] = [], shownTexts: readonly string[] = []) {
		const document: ISessionSearchDocument = { title, chatTitles, fields };
		const result = matchSessionSearch(new SessionsListSearchQuery(pattern), document);
		const hint = result && getSessionSearchHint(result, shownTexts);
		return result && {
			title: result.titleMatches.map(range => title.slice(range.start, range.end)),
			beyondTitle: result.matchesBeyondTitle,
			hint: hint && { kind: hint.kind, text: hint.text, matches: hint.matches.map(range => hint.text.slice(range.start, range.end)) },
		};
	}

	test('matches every word in any order, ignoring case and accents, and not scattered letters', () => {
		assert.deepStrictEqual({
			scatteredLetters: match('hlow', 'hello world'),
			anyOrder: match('WORLD hello', 'hello world'),
			accents: match('cafe', 'Café menu'),
			everyOccurrence: match('test', 'test the tests'),
			whitespace: new SessionsListSearchQuery('  \t ').isEmpty,
			missingWord: match('hello nope', 'hello world'),
		}, {
			scatteredLetters: undefined,
			anyOrder: { title: ['hello', 'world'], beyondTitle: false, hint: undefined },
			accents: { title: ['Café'], beyondTitle: false, hint: undefined },
			everyOccurrence: { title: ['test', 'test'], beyondTitle: false, hint: undefined },
			whitespace: true,
			missingWord: undefined,
		});
	});

	test('names the first field of a word that neither the title, the chat titles, nor what the row shows contains', () => {
		const fields: ISessionSearchField[] = [
			{ kind: 'folder', text: 'vscode' },
			{ kind: 'repository', text: 'microsoft/vscode' },
			{ kind: 'group', text: 'Perf work' },
			{ kind: 'branch', text: 'alex/vscode-flake' },
			{ kind: 'pullRequest', text: '#4242 Fix the flake' },
			{ kind: 'host', text: 'devbox' },
		];
		assert.deepStrictEqual({
			chatTitle: match('hello review', 'hello world', fields, ['Review it']),
			folderShown: match('vscode', 'hello world', fields, [], ['vscode']),
			folderHidden: match('vscode', 'hello world', fields),
			owner: match('microsoft', 'hello world', fields, [], ['vscode']),
			// Group headers above a row always show the names of its groups.
			group: match('perf', 'hello world', fields),
			branch: match('flake hello', 'hello world', fields, [], ['vscode']),
			pullRequest: match('4242', 'hello world', fields, [], ['vscode']),
			hostShown: match('devbox', 'hello world', fields, [], ['devbox']),
			hostHidden: match('devbox', 'hello world', fields, [], ['vscode']),
		}, {
			chatTitle: { title: ['hello'], beyondTitle: true, hint: undefined },
			folderShown: { title: [], beyondTitle: true, hint: undefined },
			folderHidden: { title: [], beyondTitle: true, hint: { kind: 'folder', text: 'vscode', matches: ['vscode'] } },
			owner: { title: [], beyondTitle: true, hint: { kind: 'repository', text: 'microsoft/vscode', matches: ['microsoft'] } },
			group: { title: [], beyondTitle: true, hint: undefined },
			branch: { title: ['hello'], beyondTitle: true, hint: { kind: 'branch', text: 'alex/vscode-flake', matches: ['flake'] } },
			pullRequest: { title: [], beyondTitle: true, hint: { kind: 'pullRequest', text: '#4242 Fix the flake', matches: ['4242'] } },
			hostShown: { title: [], beyondTitle: true, hint: undefined },
			hostHidden: { title: [], beyondTitle: true, hint: { kind: 'host', text: 'devbox', matches: ['devbox'] } },
		});
	});

	test('folds composed and decomposed accents alike, keeping the characters of other scripts whole', () => {
		const decomposed = 'Re\u0301sume\u0301 work';
		assert.deepStrictEqual({
			decomposedTitle: match('resume', decomposed)?.title,
			decomposedQuery: match('re\u0301sume\u0301', 'R\u00e9sum\u00e9 work')?.title,
			composedQuery: match('r\u00e9sum\u00e9', decomposed)?.title,
			// Japanese voicing marks and Hangul jamo are not accents: \u304b does not match \u304c.
			kana: match('\u304b', '\u304c\u3044'),
			decomposedKana: match('\u304c', '\u304b\u3099\u3044')?.title,
			decomposedHangul: match('\ud55c', '\u1112\u1161\u11ab\uad6d')?.title,
			onlyAnAccent: new SessionsListSearchQuery('\u0301').isEmpty,
			// Lowercase \u03ba\u03cc\u03c3\u03bc\u03bf\u03c2 ends in a final sigma, which uppercase \u039a\u039f\u03a3\u039c\u039f\u03a3 does not have.
			greekUppercaseTitle: match('\u03ba\u03cc\u03c3\u03bc\u03bf\u03c2', '\u039a\u039f\u03a3\u039c\u039f\u03a3 news')?.title,
			greekUppercaseQuery: match('\u039a\u039f\u03a3\u039c\u039f\u03a3', '\u03ba\u03cc\u03c3\u03bc\u03bf\u03c2 news')?.title,
		}, {
			// Highlights cover the original characters, accents included.
			decomposedTitle: ['Re\u0301sume\u0301'],
			decomposedQuery: ['R\u00e9sum\u00e9'],
			composedQuery: ['Re\u0301sume\u0301'],
			kana: undefined,
			decomposedKana: ['\u304b\u3099'],
			decomposedHangul: ['\u1112\u1161\u11ab'],
			onlyAnAccent: true,
			greekUppercaseTitle: ['\u039a\u039f\u03a3\u039c\u039f\u03a3'],
			greekUppercaseQuery: ['\u03ba\u03cc\u03c3\u03bc\u03bf\u03c2'],
		});
	});

	test('encodes highlights as the filter data that rows render', () => {
		const matches = findSearchWords(['ab', 'bc', 'd', 'x'], 'abcd x ab');
		assert.deepStrictEqual({
			matches,
			rendered: createMatches(toSearchFilterData(matches)),
		}, {
			// Overlapping and adjacent occurrences merge.
			matches: [{ start: 0, end: 4 }, { start: 5, end: 6 }, { start: 7, end: 9 }],
			rendered: [{ start: 0, end: 4 }, { start: 5, end: 6 }, { start: 7, end: 9 }],
		});
	});

	test('logs one event per search, from its first word until it is cleared, without its query', () => {
		const events: { readonly name: string; readonly data: unknown }[] = [];
		let now = 1000;
		const telemetry = new SessionsListSearchTelemetry(upcastPartial<ITelemetryService>({ publicLog2: (name, data) => { events.push({ name, data }); } }), () => now);

		telemetry.queryChanged(0, 0, 0);
		telemetry.resultOpened();
		telemetry.queryChanged(1, 5, 1);
		now = 1500;
		telemetry.queryChanged(2, 2, 2);
		telemetry.resultOpened();
		now = 3000;
		telemetry.queryChanged(0, 0, 0);
		telemetry.queryChanged(0, 0, 0);

		assert.deepStrictEqual(events, [{
			name: 'agents/sessionsListSearch',
			data: { wordCount: 2, resultCount: 2, beyondTitleResultCount: 2, queryChangeCount: 2, openCount: 1, durationMs: 2000 },
		}]);
	});

	test('logs a search that is still open when it is disposed, as when the window reloads', () => {
		const events: { readonly name: string; readonly data: unknown }[] = [];
		let now = 1000;
		const telemetry = new SessionsListSearchTelemetry(upcastPartial<ITelemetryService>({ publicLog2: (name, data) => { events.push({ name, data }); } }), () => now);

		telemetry.queryChanged(1, 3, 1);
		telemetry.resultOpened();
		now = 1500;
		telemetry.dispose();
		telemetry.dispose();

		assert.deepStrictEqual(events, [{
			name: 'agents/sessionsListSearch',
			data: { wordCount: 1, resultCount: 3, beyondTitleResultCount: 1, queryChangeCount: 1, openCount: 1, durationMs: 500 },
		}]);
	});

	test('logs the results of a query that changed after it was typed, without counting a query change', () => {
		const events: { readonly name: string; readonly data: unknown }[] = [];
		const telemetry = new SessionsListSearchTelemetry(upcastPartial<ITelemetryService>({ publicLog2: (name, data) => { events.push({ name, data }); } }), () => 1000);

		// Without a search, there are no results to record.
		telemetry.resultsChanged(7, 7);
		telemetry.queryChanged(1, 0, 0);
		telemetry.resultsChanged(2, 1);
		telemetry.dispose();

		assert.deepStrictEqual(events, [{
			name: 'agents/sessionsListSearch',
			data: { wordCount: 1, resultCount: 2, beyondTitleResultCount: 1, queryChangeCount: 1, openCount: 0, durationMs: 0 },
		}]);
	});
});
