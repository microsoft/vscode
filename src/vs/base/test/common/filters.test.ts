/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IFilter, or, matchesPrefix, matchesStrictPrefix, matchesCamelCase, matchesSubString, matchesContiguousSubString, matchesWords, fuzzyMatchAndScore } from 'vs/base/common/filters';

function filterOk(filter: IFilter, word: string, wordToMatchAgainst: string, highlights?: { start: number; end: number; }[]) {
	let r = filter(word, wordToMatchAgainst);
	assert(r);
	if (highlights) {
		assert.deepEqual(r, highlights);
	}
}

function filterNotOk(filter, word, suggestion) {
	assert(!filter(word, suggestion));
}

suite('Filters', () => {
	test('or', function () {
		let filter, counters;
		let newFilter = function (i, r) {
			return function () { counters[i]++; return r; };
		};

		counters = [0, 0];
		filter = or(newFilter(0, false), newFilter(1, false));
		filterNotOk(filter, 'anything', 'anything');
		assert.deepEqual(counters, [1, 1]);

		counters = [0, 0];
		filter = or(newFilter(0, true), newFilter(1, false));
		filterOk(filter, 'anything', 'anything');
		assert.deepEqual(counters, [1, 0]);

		counters = [0, 0];
		filter = or(newFilter(0, true), newFilter(1, true));
		filterOk(filter, 'anything', 'anything');
		assert.deepEqual(counters, [1, 0]);

		counters = [0, 0];
		filter = or(newFilter(0, false), newFilter(1, true));
		filterOk(filter, 'anything', 'anything');
		assert.deepEqual(counters, [1, 1]);
	});

	test('PrefixFilter - case sensitive', function () {
		filterNotOk(matchesStrictPrefix, '', '');
		filterOk(matchesStrictPrefix, '', 'anything', []);
		filterOk(matchesStrictPrefix, 'alpha', 'alpha', [{ start: 0, end: 5 }]);
		filterOk(matchesStrictPrefix, 'alpha', 'alphasomething', [{ start: 0, end: 5 }]);
		filterNotOk(matchesStrictPrefix, 'alpha', 'alp');
		filterOk(matchesStrictPrefix, 'a', 'alpha', [{ start: 0, end: 1 }]);
		filterNotOk(matchesStrictPrefix, 'x', 'alpha');
		filterNotOk(matchesStrictPrefix, 'A', 'alpha');
		filterNotOk(matchesStrictPrefix, 'AlPh', 'alPHA');
	});

	test('PrefixFilter - ignore case', function () {
		filterOk(matchesPrefix, 'alpha', 'alpha', [{ start: 0, end: 5 }]);
		filterOk(matchesPrefix, 'alpha', 'alphasomething', [{ start: 0, end: 5 }]);
		filterNotOk(matchesPrefix, 'alpha', 'alp');
		filterOk(matchesPrefix, 'a', 'alpha', [{ start: 0, end: 1 }]);
		filterOk(matchesPrefix, 'ä', 'Älpha', [{ start: 0, end: 1 }]);
		filterNotOk(matchesPrefix, 'x', 'alpha');
		filterOk(matchesPrefix, 'A', 'alpha', [{ start: 0, end: 1 }]);
		filterOk(matchesPrefix, 'AlPh', 'alPHA', [{ start: 0, end: 4 }]);
		filterNotOk(matchesPrefix, 'T', '4'); // see https://github.com/Microsoft/vscode/issues/22401
	});

	test('CamelCaseFilter', function () {
		filterNotOk(matchesCamelCase, '', '');
		filterOk(matchesCamelCase, '', 'anything', []);
		filterOk(matchesCamelCase, 'alpha', 'alpha', [{ start: 0, end: 5 }]);
		filterOk(matchesCamelCase, 'AlPhA', 'alpha', [{ start: 0, end: 5 }]);
		filterOk(matchesCamelCase, 'alpha', 'alphasomething', [{ start: 0, end: 5 }]);
		filterNotOk(matchesCamelCase, 'alpha', 'alp');

		filterOk(matchesCamelCase, 'c', 'CamelCaseRocks', [
			{ start: 0, end: 1 }
		]);
		filterOk(matchesCamelCase, 'cc', 'CamelCaseRocks', [
			{ start: 0, end: 1 },
			{ start: 5, end: 6 }
		]);
		filterOk(matchesCamelCase, 'ccr', 'CamelCaseRocks', [
			{ start: 0, end: 1 },
			{ start: 5, end: 6 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, 'cacr', 'CamelCaseRocks', [
			{ start: 0, end: 2 },
			{ start: 5, end: 6 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, 'cacar', 'CamelCaseRocks', [
			{ start: 0, end: 2 },
			{ start: 5, end: 7 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, 'ccarocks', 'CamelCaseRocks', [
			{ start: 0, end: 1 },
			{ start: 5, end: 7 },
			{ start: 9, end: 14 }
		]);
		filterOk(matchesCamelCase, 'cr', 'CamelCaseRocks', [
			{ start: 0, end: 1 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, 'fba', 'FooBarAbe', [
			{ start: 0, end: 1 },
			{ start: 3, end: 5 }
		]);
		filterOk(matchesCamelCase, 'fbar', 'FooBarAbe', [
			{ start: 0, end: 1 },
			{ start: 3, end: 6 }
		]);
		filterOk(matchesCamelCase, 'fbara', 'FooBarAbe', [
			{ start: 0, end: 1 },
			{ start: 3, end: 7 }
		]);
		filterOk(matchesCamelCase, 'fbaa', 'FooBarAbe', [
			{ start: 0, end: 1 },
			{ start: 3, end: 5 },
			{ start: 6, end: 7 }
		]);
		filterOk(matchesCamelCase, 'fbaab', 'FooBarAbe', [
			{ start: 0, end: 1 },
			{ start: 3, end: 5 },
			{ start: 6, end: 8 }
		]);
		filterOk(matchesCamelCase, 'c2d', 'canvasCreation2D', [
			{ start: 0, end: 1 },
			{ start: 14, end: 16 }
		]);
		filterOk(matchesCamelCase, 'cce', '_canvasCreationEvent', [
			{ start: 1, end: 2 },
			{ start: 7, end: 8 },
			{ start: 15, end: 16 }
		]);
	});

	test('CamelCaseFilter - #19256', function () {
		assert(matchesCamelCase('Debug Console', 'Open: Debug Console'));
		assert(matchesCamelCase('Debug console', 'Open: Debug Console'));
		assert(matchesCamelCase('debug console', 'Open: Debug Console'));
	});

	test('matchesContiguousSubString', function () {
		filterOk(matchesContiguousSubString, 'cela', 'cancelAnimationFrame()', [
			{ start: 3, end: 7 }
		]);
	});

	test('matchesSubString', function () {
		filterOk(matchesSubString, 'cmm', 'cancelAnimationFrame()', [
			{ start: 0, end: 1 },
			{ start: 9, end: 10 },
			{ start: 18, end: 19 }
		]);
	});

	test('WordFilter', function () {
		filterOk(matchesWords, 'alpha', 'alpha', [{ start: 0, end: 5 }]);
		filterOk(matchesWords, 'alpha', 'alphasomething', [{ start: 0, end: 5 }]);
		filterNotOk(matchesWords, 'alpha', 'alp');
		filterOk(matchesWords, 'a', 'alpha', [{ start: 0, end: 1 }]);
		filterNotOk(matchesWords, 'x', 'alpha');
		filterOk(matchesWords, 'A', 'alpha', [{ start: 0, end: 1 }]);
		filterOk(matchesWords, 'AlPh', 'alPHA', [{ start: 0, end: 4 }]);
		assert(matchesWords('Debug Console', 'Open: Debug Console'));

		filterOk(matchesWords, 'gp', 'Git: Pull', [{ start: 0, end: 1 }, { start: 5, end: 6 }]);
		filterOk(matchesWords, 'g p', 'Git: Pull', [{ start: 0, end: 1 }, { start: 4, end: 6 }]);
		filterOk(matchesWords, 'gipu', 'Git: Pull', [{ start: 0, end: 2 }, { start: 5, end: 7 }]);

		filterOk(matchesWords, 'gp', 'Category: Git: Pull', [{ start: 10, end: 11 }, { start: 15, end: 16 }]);
		filterOk(matchesWords, 'g p', 'Category: Git: Pull', [{ start: 10, end: 11 }, { start: 14, end: 16 }]);
		filterOk(matchesWords, 'gipu', 'Category: Git: Pull', [{ start: 10, end: 12 }, { start: 15, end: 17 }]);

		filterNotOk(matchesWords, 'it', 'Git: Pull');
		filterNotOk(matchesWords, 'll', 'Git: Pull');

		filterOk(matchesWords, 'git: プル', 'git: プル', [{ start: 0, end: 7 }]);
		filterOk(matchesWords, 'git プル', 'git: プル', [{ start: 0, end: 3 }, { start: 4, end: 7 }]);

		filterOk(matchesWords, 'öäk', 'Öhm: Älles Klar', [{ start: 0, end: 1 }, { start: 5, end: 6 }, { start: 11, end: 12 }]);

		assert.ok(matchesWords('gipu', 'Category: Git: Pull', true) === null);
		assert.deepEqual(matchesWords('pu', 'Category: Git: Pull', true), [{ start: 15, end: 17 }]);
	});

	test('fuzzyMatchAndScore', function () {

		function assertMatches(pattern: string, word: string, decoratedWord: string, filter: typeof fuzzyMatchAndScore) {
			let r = filter(pattern, word);
			assert.ok(Boolean(r) === Boolean(decoratedWord));
			if (r) {
				const [, matches] = r;
				let pos = 0;
				for (let i = 0; i < matches.length; i++) {
					let actual = matches[i];
					let expected = decoratedWord.indexOf('^', pos) - i;
					assert.equal(actual, expected);
					pos = expected + 1 + i;
				}
			}
		}

		assertMatches('no', 'match', undefined, fuzzyMatchAndScore);
		assertMatches('no', '', undefined, fuzzyMatchAndScore);
		assertMatches('BK', 'the_black_knight', 'the_^black_^knight', fuzzyMatchAndScore);
		assertMatches('bkn', 'the_black_knight', 'the_^black_^k^night', fuzzyMatchAndScore);
		assertMatches('bt', 'the_black_knight', 'the_^black_knigh^t', fuzzyMatchAndScore);
		assertMatches('bti', 'the_black_knight', undefined, fuzzyMatchAndScore);
		assertMatches('LLL', 'SVisualLoggerLogsList', 'SVisual^Logger^Logs^List', fuzzyMatchAndScore);
		assertMatches('LLLL', 'SVisualLoggerLogsList', undefined, fuzzyMatchAndScore);
		assertMatches('sllll', 'SVisualLoggerLogsList', '^SVisua^l^Logger^Logs^List', fuzzyMatchAndScore);
		assertMatches('sl', 'SVisualLoggerLogsList', '^SVisual^LoggerLogsList', fuzzyMatchAndScore);
		assertMatches('foobar', 'foobar', '^f^o^o^b^a^r', fuzzyMatchAndScore);
		assertMatches('fob', 'foobar', '^f^oo^bar', fuzzyMatchAndScore);
		assertMatches('ob', 'foobar', undefined, fuzzyMatchAndScore);
		assertMatches('gp', 'Git: Pull', '^Git: ^Pull', fuzzyMatchAndScore);
		assertMatches('gp', 'Git_Git_Pull', '^Git_Git_^Pull', fuzzyMatchAndScore);
		assertMatches('g p', 'Git: Pull', '^Git:^ ^Pull', fuzzyMatchAndScore);
		assertMatches('gip', 'Git: Pull', '^G^it: ^Pull', fuzzyMatchAndScore);
		assertMatches('is', 'isValid', '^i^sValid', fuzzyMatchAndScore);
		assertMatches('is', 'ImportStatement', '^Import^Statement', fuzzyMatchAndScore);
		assertMatches('lowrd', 'lowWord', '^l^o^wWo^r^d', fuzzyMatchAndScore);
		assertMatches('ccm', 'cacmelCase', '^ca^c^melCase', fuzzyMatchAndScore);
		assertMatches('ccm', 'camelCase', undefined, fuzzyMatchAndScore);
		assertMatches('ccm', 'camelCasecm', '^camel^Casec^m', fuzzyMatchAndScore);
		assertMatches('myvable', 'myvariable', '^m^y^v^aria^b^l^e', fuzzyMatchAndScore);
		assertMatches('fdm', 'findModel', '^fin^d^Model', fuzzyMatchAndScore);
		assertMatches('form', 'editor.formatOnSave', 'editor.^f^o^r^matOnSave', fuzzyMatchAndScore);
	});

	test('topScore', function () {

		function assertTopScore(pattern: string, expected: number, ...words: string[]) {
			let topScore = Number.MIN_VALUE;
			let topIdx = 0;
			for (let i = 0; i < words.length; i++) {
				const word = words[i];
				const m = fuzzyMatchAndScore(pattern, word);
				if (m) {
					const [score] = m;
					if (score > topScore) {
						topScore = score;
						topIdx = i;
					}
				}
			}
			assert.equal(topIdx, expected);
		}

		assertTopScore('cons', 2, 'ArrayBufferConstructor', 'Console', 'console');
		assertTopScore('Foo', 1, 'foo', 'Foo', 'foo');

		assertTopScore('CC', 1, 'camelCase', 'CamelCase');
		assertTopScore('cC', 0, 'camelCase', 'CamelCase');
		assertTopScore('cC', 1, 'ccfoo', 'camelCase');
		assertTopScore('cC', 1, 'ccfoo', 'camelCase', 'foo-cC-bar');

		// issue #17836
		assertTopScore('p', 0, 'parse', 'posix', 'pafdsa', 'path', 'p');
		assertTopScore('pa', 0, 'parse', 'pafdsa', 'path');

		// issue #14583
		assertTopScore('log', 3, 'HTMLOptGroupElement', 'ScrollLogicalPosition', 'SVGFEMorphologyElement', 'log');
		assertTopScore('e', 2, 'AbstractWorker', 'ActiveXObject', 'else');

		// issue #14446
		assertTopScore('workbench.sideb', 1, 'workbench.editor.defaultSideBySideLayout', 'workbench.sideBar.location');

		// issue #11423
		assertTopScore('editor.r', 2, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
		// assertTopScore('editor.R', 1, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
		// assertTopScore('Editor.r', 0, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');

		assertTopScore('-mo', 1, '-ms-ime-mode', '-moz-columns');
		// // dupe, issue #14861
		assertTopScore('convertModelPosition', 0, 'convertModelPositionToViewPosition', 'convertViewToModelPosition');
		// // dupe, issue #14942
		assertTopScore('is', 0, 'isValidViewletId', 'import statement');

	});
});
