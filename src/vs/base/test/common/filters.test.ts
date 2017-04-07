/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IFilter, or, matchesPrefix, matchesStrictPrefix, matchesCamelCase, matchesSubString, matchesContiguousSubString, matchesWords, fuzzyScore, nextTypoPermutation, fuzzyScoreGraceful } from 'vs/base/common/filters';

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

	function assertMatches(pattern: string, word: string, decoratedWord: string, filter: typeof fuzzyScore) {
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

	test('fuzzyScore, #23215', function () {
		assertMatches('tit', 'win.tit', 'win.^t^i^t', fuzzyScore);
		assertMatches('title', 'win.title', 'win.^t^i^t^l^e', fuzzyScore);
		assertMatches('WordCla', 'WordCharacterClassifier', '^W^o^r^dCharacter^C^l^assifier', fuzzyScore);
		assertMatches('WordCCla', 'WordCharacterClassifier', '^W^o^r^d^Character^C^l^assifier', fuzzyScore);
	});

	test('fuzzyScore, #23332', function () {
		assertMatches('dete', '"editor.quickSuggestionsDelay"', undefined, fuzzyScore);
	});

	test('fuzzyScore, #23190', function () {
		assertMatches('c:\\do', '& \'C:\\Documents and Settings\'', '& \'^C^:^\\^D^ocuments and Settings\'', fuzzyScore);
		assertMatches('c:\\do', '& \'c:\\Documents and Settings\'', '& \'^c^:^\\^D^ocuments and Settings\'', fuzzyScore);
	});

	test('fuzzyScore, #23581', function () {
		assertMatches('close', 'css.lint.importStatement', '^css.^lint.imp^ort^Stat^ement', fuzzyScore);
		assertMatches('close', 'css.colorDecorators.enable', '^css.co^l^orDecorator^s.^enable', fuzzyScore);
		assertMatches('close', 'workbench.quickOpen.closeOnFocusOut', 'workbench.quickOpen.^c^l^o^s^eOnFocusOut', fuzzyScore);
		assertTopScore(fuzzyScore, 'close', 2, 'css.lint.importStatement', 'css.colorDecorators.enable', 'workbench.quickOpen.closeOnFocusOut');
	});

	test('fuzzyScore, #23458', function () {
		assertMatches('highlight', 'editorHoverHighlight', 'editorHover^H^i^g^h^l^i^g^h^t', fuzzyScore);
		assertMatches('hhighlight', 'editorHoverHighlight', 'editor^Hover^H^i^g^h^l^i^g^h^t', fuzzyScore);
		assertMatches('dhhighlight', 'editorHoverHighlight', undefined, fuzzyScore);
	});
	test('fuzzyScore, #23746', function () {
		assertMatches('-moz', '-moz-foo', '^-^m^o^z-foo', fuzzyScore);
		assertMatches('moz', '-moz-foo', '-^m^o^z-foo', fuzzyScore);
		assertMatches('moz', '-moz-animation', '-^m^o^z-animation', fuzzyScore);
		assertMatches('moza', '-moz-animation', '-^m^o^z-^animation', fuzzyScore);
	});

	test('fuzzyScore', function () {
		assertMatches('ab', 'abA', '^a^bA', fuzzyScore);
		assertMatches('ccm', 'cacmelCase', '^ca^c^melCase', fuzzyScore);
		assertMatches('bti', 'the_black_knight', undefined, fuzzyScore);
		assertMatches('ccm', 'camelCase', undefined, fuzzyScore);
		assertMatches('BK', 'the_black_knight', 'the_^black_^knight', fuzzyScore);
		assertMatches('KeyboardLayout=', 'KeyboardLayout', undefined, fuzzyScore);
		assertMatches('LLL', 'SVisualLoggerLogsList', 'SVisual^Logger^Logs^List', fuzzyScore);
		assertMatches('LLLL', 'SVilLoLosLi', undefined, fuzzyScore);
		assertMatches('LLLL', 'SVisualLoggerLogsList', undefined, fuzzyScore);
		assertMatches('TEdit', 'TextEdit', '^Text^E^d^i^t', fuzzyScore);
		assertMatches('TEdit', 'TextEditor', '^Text^E^d^i^tor', fuzzyScore);
		assertMatches('TEdit', 'Textedit', '^T^exte^d^i^t', fuzzyScore);
		assertMatches('TEdit', 'text_edit', '^text_^e^d^i^t', fuzzyScore);
		assertMatches('TEditDit', 'TextEditorDecorationType', '^Text^E^d^i^tor^Decorat^ion^Type', fuzzyScore);
		assertMatches('TEdit', 'TextEditorDecorationType', '^Text^E^d^i^torDecorationType', fuzzyScore);
		assertMatches('Tedit', 'TextEdit', '^Text^E^d^i^t', fuzzyScore);
		assertMatches('ba', '?AB?', undefined, fuzzyScore);
		assertMatches('bkn', 'the_black_knight', 'the_^black_^k^night', fuzzyScore);
		assertMatches('bt', 'the_black_knight', 'the_^black_knigh^t', fuzzyScore);
		assertMatches('ccm', 'camelCasecm', '^camel^Casec^m', fuzzyScore);
		assertMatches('fdm', 'findModel', '^fin^d^Model', fuzzyScore);
		assertMatches('fob', 'foobar', '^f^oo^bar', fuzzyScore);
		assertMatches('fobz', 'foobar', undefined, fuzzyScore);
		assertMatches('foobar', 'foobar', '^f^o^o^b^a^r', fuzzyScore);
		assertMatches('form', 'editor.formatOnSave', 'editor.^f^o^r^matOnSave', fuzzyScore);
		assertMatches('g p', 'Git: Pull', '^Git:^ ^Pull', fuzzyScore);
		assertMatches('g p', 'Git: Pull', '^Git:^ ^Pull', fuzzyScore);
		assertMatches('gip', 'Git: Pull', '^G^it: ^Pull', fuzzyScore);
		assertMatches('gip', 'Git: Pull', '^G^it: ^Pull', fuzzyScore);
		assertMatches('gp', 'Git: Pull', '^Git: ^Pull', fuzzyScore);
		assertMatches('gp', 'Git_Git_Pull', '^Git_Git_^Pull', fuzzyScore);
		assertMatches('is', 'ImportStatement', '^Import^Statement', fuzzyScore);
		assertMatches('is', 'isValid', '^i^sValid', fuzzyScore);
		assertMatches('lowrd', 'lowWord', '^l^o^wWo^r^d', fuzzyScore);
		assertMatches('myvable', 'myvariable', '^m^y^v^aria^b^l^e', fuzzyScore);
		assertMatches('no', '', undefined, fuzzyScore);
		assertMatches('no', 'match', undefined, fuzzyScore);
		assertMatches('ob', 'foobar', undefined, fuzzyScore);
		assertMatches('sl', 'SVisualLoggerLogsList', '^SVisual^LoggerLogsList', fuzzyScore);
		assertMatches('sllll', 'SVisualLoggerLogsList', '^SVisua^l^Logger^Logs^List', fuzzyScore);
		assertMatches('Three', 'HTMLHRElement', 'H^TML^H^R^El^ement', fuzzyScore);
		assertMatches('Three', 'Three', '^T^h^r^e^e', fuzzyScore);
		assertMatches('fo', 'barfoo', undefined, fuzzyScore);
		assertMatches('fo', 'bar_foo', 'bar_^f^oo', fuzzyScore);
		assertMatches('fo', 'bar_Foo', 'bar_^F^oo', fuzzyScore);
		assertMatches('fo', 'bar foo', 'bar ^f^oo', fuzzyScore);
		assertMatches('fo', 'bar.foo', 'bar.^f^oo', fuzzyScore);
		assertMatches('fo', 'bar/foo', 'bar/^f^oo', fuzzyScore);
		assertMatches('fo', 'bar\\foo', 'bar\\^f^oo', fuzzyScore);
	});

	test('fuzzyScore, many matches', function () {

		assertMatches(
			'aaaaaa',
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			'^a^a^a^a^a^aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			fuzzyScore
		);
	});

	function assertTopScore(filter: typeof fuzzyScore, pattern: string, expected: number, ...words: string[]) {
		let topScore = -(100 * 10);
		let topIdx = 0;
		for (let i = 0; i < words.length; i++) {
			const word = words[i];
			const m = filter(pattern, word);
			if (m) {
				const [score] = m;
				if (score > topScore) {
					topScore = score;
					topIdx = i;
				}
			}
		}
		assert.equal(topIdx, expected, `${pattern} -> actual=${words[topIdx]} <> expected=${words[expected]}`);
	}

	test('topScore - fuzzyScore', function () {

		assertTopScore(fuzzyScore, 'cons', 2, 'ArrayBufferConstructor', 'Console', 'console');
		assertTopScore(fuzzyScore, 'Foo', 1, 'foo', 'Foo', 'foo');

		assertTopScore(fuzzyScore, 'CC', 1, 'camelCase', 'CamelCase');
		assertTopScore(fuzzyScore, 'cC', 0, 'camelCase', 'CamelCase');
		// assertTopScore(fuzzyScore, 'cC', 1, 'ccfoo', 'camelCase');
		// assertTopScore(fuzzyScore, 'cC', 1, 'ccfoo', 'camelCase', 'foo-cC-bar');

		// issue #17836
		// assertTopScore(fuzzyScore, 'TEdit', 1, 'TextEditorDecorationType', 'TextEdit', 'TextEditor');
		assertTopScore(fuzzyScore, 'p', 0, 'parse', 'posix', 'pafdsa', 'path', 'p');
		assertTopScore(fuzzyScore, 'pa', 0, 'parse', 'pafdsa', 'path');

		// issue #14583
		assertTopScore(fuzzyScore, 'log', 3, 'HTMLOptGroupElement', 'ScrollLogicalPosition', 'SVGFEMorphologyElement', 'log');
		assertTopScore(fuzzyScore, 'e', 2, 'AbstractWorker', 'ActiveXObject', 'else');

		// issue #14446
		assertTopScore(fuzzyScore, 'workbench.sideb', 1, 'workbench.editor.defaultSideBySideLayout', 'workbench.sideBar.location');

		// issue #11423
		assertTopScore(fuzzyScore, 'editor.r', 2, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
		// assertTopScore(fuzzyScore, 'editor.R', 1, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
		// assertTopScore(fuzzyScore, 'Editor.r', 0, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');

		assertTopScore(fuzzyScore, '-mo', 1, '-ms-ime-mode', '-moz-columns');
		// // dupe, issue #14861
		assertTopScore(fuzzyScore, 'convertModelPosition', 0, 'convertModelPositionToViewPosition', 'convertViewToModelPosition');
		// // dupe, issue #14942
		assertTopScore(fuzzyScore, 'is', 0, 'isValidViewletId', 'import statement');

		assertTopScore(fuzzyScore, 'title', 1, 'files.trimTrailingWhitespace', 'window.title');
	});

	test('nextTypoPermutation', function () {

		function assertTypos(pattern: string, ...variants: string[]) {
			let pos = 1;
			for (const expected of variants) {
				const actual = nextTypoPermutation(pattern, pos);
				assert.equal(actual, expected);
				pos += 1;
			}
			assert.equal(nextTypoPermutation(pattern, pos), undefined);
		}

		assertTypos('abc', 'acb');
		assertTypos('foboar', 'fbooar', 'foobar', 'fobaor', 'fobora');
	});

	test('fuzzyScoreGraceful', function () {

		assertMatches('tkb', 'the_black_knight', '^the_^black_^knight', fuzzyScoreGraceful);
		assertMatches('tkbk', 'the_black_knight', '^the_^blac^k_^knight', fuzzyScoreGraceful);
		assertMatches('tkkb', 'the_black_knight', undefined, fuzzyScoreGraceful);
		assertMatches('tkb', 'no_match', undefined, fuzzyScoreGraceful);
	});
});
