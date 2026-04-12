/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { anyScore, createMatches, fuzzyScore, fuzzyScoreGraceful, fuzzyScoreGracefulAggressive, matchesBaseContiguousSubString, matchesCamelCase, matchesContiguousSubString, matchesPrefix, matchesStrictPrefix, matchesSubString, matchesWords, or } from '../../common/filters.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
function filterOk(filter, word, wordToMatchAgainst, highlights) {
    const r = filter(word, wordToMatchAgainst);
    assert(r, `${word} didn't match ${wordToMatchAgainst}`);
    if (highlights) {
        assert.deepStrictEqual(r, highlights);
    }
}
function filterNotOk(filter, word, wordToMatchAgainst) {
    assert(!filter(word, wordToMatchAgainst), `${word} matched ${wordToMatchAgainst}`);
}
suite('Filters', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('or', () => {
        let filter;
        let counters;
        const newFilter = function (i, r) {
            // eslint-disable-next-line local/code-no-any-casts
            return function () { counters[i]++; return r; };
        };
        counters = [0, 0];
        filter = or(newFilter(0, false), newFilter(1, false));
        filterNotOk(filter, 'anything', 'anything');
        assert.deepStrictEqual(counters, [1, 1]);
        counters = [0, 0];
        filter = or(newFilter(0, true), newFilter(1, false));
        filterOk(filter, 'anything', 'anything');
        assert.deepStrictEqual(counters, [1, 0]);
        counters = [0, 0];
        filter = or(newFilter(0, true), newFilter(1, true));
        filterOk(filter, 'anything', 'anything');
        assert.deepStrictEqual(counters, [1, 0]);
        counters = [0, 0];
        filter = or(newFilter(0, false), newFilter(1, true));
        filterOk(filter, 'anything', 'anything');
        assert.deepStrictEqual(counters, [1, 1]);
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
        filterNotOk(matchesPrefix, 'T', '4'); // see https://github.com/microsoft/vscode/issues/22401
    });
    test('CamelCaseFilter', () => {
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
    test('matchesContiguousSubString', () => {
        filterOk(matchesContiguousSubString, 'cela', 'cancelAnimationFrame()', [
            { start: 3, end: 7 }
        ]);
    });
    test('matchesBaseContiguousSubString', () => {
        filterOk(matchesBaseContiguousSubString, 'cela', 'cancelAnimationFrame()', [
            { start: 3, end: 7 }
        ]);
        filterOk(matchesBaseContiguousSubString, 'cafe', 'café', [
            { start: 0, end: 4 }
        ]);
        filterOk(matchesBaseContiguousSubString, 'cafe', 'caféBar', [
            { start: 0, end: 4 }
        ]);
        filterOk(matchesBaseContiguousSubString, 'resume', 'résumé', [
            { start: 0, end: 6 }
        ]);
        filterOk(matchesBaseContiguousSubString, 'naïve', 'naïve', [
            { start: 0, end: 5 }
        ]);
        filterOk(matchesBaseContiguousSubString, 'naive', 'naïve', [
            { start: 0, end: 5 }
        ]);
        filterOk(matchesBaseContiguousSubString, 'aeou', 'àéöü', [
            { start: 0, end: 4 }
        ]);
    });
    test('matchesSubString', () => {
        filterOk(matchesSubString, 'cmm', 'cancelAnimationFrame()', [
            { start: 0, end: 1 },
            { start: 9, end: 10 },
            { start: 18, end: 19 }
        ]);
        filterOk(matchesSubString, 'abc', 'abcabc', [
            { start: 0, end: 3 },
        ]);
        filterOk(matchesSubString, 'abc', 'aaabbbccc', [
            { start: 0, end: 1 },
            { start: 3, end: 4 },
            { start: 6, end: 7 },
        ]);
    });
    test('matchesSubString performance (#35346)', function () {
        filterNotOk(matchesSubString, 'aaaaaaaaaaaaaaaaaaaax', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });
    test('WordFilter', () => {
        filterOk(matchesWords, 'alpha', 'alpha', [{ start: 0, end: 5 }]);
        filterOk(matchesWords, 'alpha', 'alphasomething', [{ start: 0, end: 5 }]);
        filterNotOk(matchesWords, 'alpha', 'alp');
        filterOk(matchesWords, 'a', 'alpha', [{ start: 0, end: 1 }]);
        filterNotOk(matchesWords, 'x', 'alpha');
        filterOk(matchesWords, 'A', 'alpha', [{ start: 0, end: 1 }]);
        filterOk(matchesWords, 'AlPh', 'alPHA', [{ start: 0, end: 4 }]);
        assert(matchesWords('Debug Console', 'Open: Debug Console'));
        filterOk(matchesWords, 'gp', 'Git: Pull', [{ start: 0, end: 1 }, { start: 5, end: 6 }]);
        filterOk(matchesWords, 'g p', 'Git: Pull', [{ start: 0, end: 1 }, { start: 5, end: 6 }]);
        filterOk(matchesWords, 'gipu', 'Git: Pull', [{ start: 0, end: 2 }, { start: 5, end: 7 }]);
        filterOk(matchesWords, 'gp', 'Category: Git: Pull', [{ start: 10, end: 11 }, { start: 15, end: 16 }]);
        filterOk(matchesWords, 'g p', 'Category: Git: Pull', [{ start: 10, end: 11 }, { start: 15, end: 16 }]);
        filterOk(matchesWords, 'gipu', 'Category: Git: Pull', [{ start: 10, end: 12 }, { start: 15, end: 17 }]);
        filterNotOk(matchesWords, 'it', 'Git: Pull');
        filterNotOk(matchesWords, 'll', 'Git: Pull');
        filterOk(matchesWords, 'git: プル', 'git: プル', [{ start: 0, end: 7 }]);
        filterOk(matchesWords, 'git プル', 'git: プル', [{ start: 0, end: 3 }, { start: 5, end: 7 }]);
        filterOk(matchesWords, 'öäk', 'Öhm: Älles Klar', [{ start: 0, end: 1 }, { start: 5, end: 6 }, { start: 11, end: 12 }]);
        // Handles issue #123915
        filterOk(matchesWords, 'C++', 'C/C++: command', [{ start: 2, end: 5 }]);
        // Handles issue #154533
        filterOk(matchesWords, '.', ':', []);
        filterOk(matchesWords, '.', '.', [{ start: 0, end: 1 }]);
        // assert.ok(matchesWords('gipu', 'Category: Git: Pull', true) === null);
        // assert.deepStrictEqual(matchesWords('pu', 'Category: Git: Pull', true), [{ start: 15, end: 17 }]);
        filterOk(matchesWords, 'bar', 'foo-bar');
        filterOk(matchesWords, 'bar test', 'foo-bar test');
        filterOk(matchesWords, 'fbt', 'foo-bar test');
        filterOk(matchesWords, 'bar test', 'foo-bar (test)');
        filterOk(matchesWords, 'foo bar', 'foo (bar)');
        filterNotOk(matchesWords, 'bar est', 'foo-bar test');
        filterNotOk(matchesWords, 'fo ar', 'foo-bar test');
        filterNotOk(matchesWords, 'for', 'foo-bar test');
        filterOk(matchesWords, 'foo bar', 'foo-bar');
        filterOk(matchesWords, 'foo bar', '123 foo-bar 456');
        filterOk(matchesWords, 'foo-bar', 'foo bar');
        filterOk(matchesWords, 'foo:bar', 'foo:bar');
    });
    function assertMatches(pattern, word, decoratedWord, filter, opts = {}) {
        const r = filter(pattern, pattern.toLowerCase(), opts.patternPos || 0, word, word.toLowerCase(), opts.wordPos || 0, { firstMatchCanBeWeak: opts.firstMatchCanBeWeak ?? false, boostFullMatch: true });
        assert.ok(!decoratedWord === !r);
        if (r) {
            const matches = createMatches(r);
            let actualWord = '';
            let pos = 0;
            for (const match of matches) {
                actualWord += word.substring(pos, match.start);
                actualWord += '^' + word.substring(match.start, match.end).split('').join('^');
                pos = match.end;
            }
            actualWord += word.substring(pos);
            assert.strictEqual(actualWord, decoratedWord);
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
    test('fuzzyScore', () => {
        assertMatches('ab', 'abA', '^a^bA', fuzzyScore);
        assertMatches('ccm', 'cacmelCase', '^ca^c^melCase', fuzzyScore);
        assertMatches('bti', 'the_black_knight', undefined, fuzzyScore);
        assertMatches('ccm', 'camelCase', undefined, fuzzyScore);
        assertMatches('cmcm', 'camelCase', undefined, fuzzyScore);
        assertMatches('BK', 'the_black_knight', 'the_^black_^knight', fuzzyScore);
        assertMatches('KeyboardLayout=', 'KeyboardLayout', undefined, fuzzyScore);
        assertMatches('LLL', 'SVisualLoggerLogsList', 'SVisual^Logger^Logs^List', fuzzyScore);
        assertMatches('LLLL', 'SVilLoLosLi', undefined, fuzzyScore);
        assertMatches('LLLL', 'SVisualLoggerLogsList', undefined, fuzzyScore);
        assertMatches('TEdit', 'TextEdit', '^Text^E^d^i^t', fuzzyScore);
        assertMatches('TEdit', 'TextEditor', '^Text^E^d^i^tor', fuzzyScore);
        assertMatches('TEdit', 'Textedit', '^Text^e^d^i^t', fuzzyScore);
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
        assertMatches('Three', 'HTMLHRElement', undefined, fuzzyScore);
        assertMatches('Three', 'Three', '^T^h^r^e^e', fuzzyScore);
        assertMatches('fo', 'barfoo', undefined, fuzzyScore);
        assertMatches('fo', 'bar_foo', 'bar_^f^oo', fuzzyScore);
        assertMatches('fo', 'bar_Foo', 'bar_^F^oo', fuzzyScore);
        assertMatches('fo', 'bar foo', 'bar ^f^oo', fuzzyScore);
        assertMatches('fo', 'bar.foo', 'bar.^f^oo', fuzzyScore);
        assertMatches('fo', 'bar/foo', 'bar/^f^oo', fuzzyScore);
        assertMatches('fo', 'bar\\foo', 'bar\\^f^oo', fuzzyScore);
    });
    test('fuzzyScore (first match can be weak)', function () {
        assertMatches('Three', 'HTMLHRElement', 'H^TML^H^R^El^ement', fuzzyScore, { firstMatchCanBeWeak: true });
        assertMatches('tor', 'constructor', 'construc^t^o^r', fuzzyScore, { firstMatchCanBeWeak: true });
        assertMatches('ur', 'constructor', 'constr^ucto^r', fuzzyScore, { firstMatchCanBeWeak: true });
        assertTopScore(fuzzyScore, 'tor', 2, 'constructor', 'Thor', 'cTor');
    });
    test('fuzzyScore, many matches', function () {
        assertMatches('aaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '^a^a^a^a^a^aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', fuzzyScore);
    });
    test('Freeze when fjfj -> jfjf, https://github.com/microsoft/vscode/issues/91807', function () {
        assertMatches('jfjfj', 'fjfjfjfjfjfjfjfjfjfjfj', undefined, fuzzyScore);
        assertMatches('jfjfjfjfjfjfjfjfjfj', 'fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', undefined, fuzzyScore);
        assertMatches('jfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfj', 'fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', undefined, fuzzyScore);
        assertMatches('jfjfjfjfjfjfjfjfjfj', 'fJfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', 'f^J^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', // strong match
        fuzzyScore);
        assertMatches('jfjfjfjfjfjfjfjfjfj', 'fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', 'f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj', // any match
        fuzzyScore, { firstMatchCanBeWeak: true });
    });
    test('fuzzyScore, issue #26423', function () {
        assertMatches('baba', 'abababab', undefined, fuzzyScore);
        assertMatches('fsfsfs', 'dsafdsafdsafdsafdsafdsafdsafasdfdsa', undefined, fuzzyScore);
        assertMatches('fsfsfsfsfsfsfsf', 'dsafdsafdsafdsafdsafdsafdsafasdfdsafdsafdsafdsafdsfdsafdsfdfdfasdnfdsajfndsjnafjndsajlknfdsa', undefined, fuzzyScore);
    });
    test('Fuzzy IntelliSense matching vs Haxe metadata completion, #26995', function () {
        assertMatches('f', ':Foo', ':^Foo', fuzzyScore);
        assertMatches('f', ':foo', ':^foo', fuzzyScore);
    });
    test('Separator only match should not be weak #79558', function () {
        assertMatches('.', 'foo.bar', 'foo^.bar', fuzzyScore);
    });
    test('Cannot set property \'1\' of undefined, #26511', function () {
        const word = new Array(123).join('a');
        const pattern = new Array(120).join('a');
        fuzzyScore(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0);
        assert.ok(true); // must not explode
    });
    test('Vscode 1.12 no longer obeys \'sortText\' in completion items (from language server), #26096', function () {
        assertMatches('  ', '  group', undefined, fuzzyScore, { patternPos: 2 });
        assertMatches('  g', '  group', '  ^group', fuzzyScore, { patternPos: 2 });
        assertMatches('g', '  group', '  ^group', fuzzyScore);
        assertMatches('g g', '  groupGroup', undefined, fuzzyScore);
        assertMatches('g g', '  group Group', '  ^group^ ^Group', fuzzyScore);
        assertMatches(' g g', '  group Group', '  ^group^ ^Group', fuzzyScore, { patternPos: 1 });
        assertMatches('zz', 'zzGroup', '^z^zGroup', fuzzyScore);
        assertMatches('zzg', 'zzGroup', '^z^z^Group', fuzzyScore);
        assertMatches('g', 'zzGroup', 'zz^Group', fuzzyScore);
    });
    test('patternPos isn\'t working correctly #79815', function () {
        assertMatches(':p'.substr(1), 'prop', '^prop', fuzzyScore, { patternPos: 0 });
        assertMatches(':p', 'prop', '^prop', fuzzyScore, { patternPos: 1 });
        assertMatches(':p', 'prop', undefined, fuzzyScore, { patternPos: 2 });
        assertMatches(':p', 'proP', 'pro^P', fuzzyScore, { patternPos: 1, wordPos: 1 });
        assertMatches(':p', 'aprop', 'a^prop', fuzzyScore, { patternPos: 1, firstMatchCanBeWeak: true });
        assertMatches(':p', 'aprop', undefined, fuzzyScore, { patternPos: 1, firstMatchCanBeWeak: false });
    });
    function assertTopScore(filter, pattern, expected, ...words) {
        let topScore = -(100 * 10);
        let topIdx = 0;
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const m = filter(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0);
            if (m) {
                const [score] = m;
                if (score > topScore) {
                    topScore = score;
                    topIdx = i;
                }
            }
        }
        assert.strictEqual(topIdx, expected, `${pattern} -> actual=${words[topIdx]} <> expected=${words[expected]}`);
    }
    test('topScore - fuzzyScore', function () {
        assertTopScore(fuzzyScore, 'cons', 2, 'ArrayBufferConstructor', 'Console', 'console');
        assertTopScore(fuzzyScore, 'Foo', 1, 'foo', 'Foo', 'foo');
        // #24904
        assertTopScore(fuzzyScore, 'onMess', 1, 'onmessage', 'onMessage', 'onThisMegaEscape');
        assertTopScore(fuzzyScore, 'CC', 1, 'camelCase', 'CamelCase');
        assertTopScore(fuzzyScore, 'cC', 0, 'camelCase', 'CamelCase');
        // assertTopScore(fuzzyScore, 'cC', 1, 'ccfoo', 'camelCase');
        // assertTopScore(fuzzyScore, 'cC', 1, 'ccfoo', 'camelCase', 'foo-cC-bar');
        // issue #17836
        // assertTopScore(fuzzyScore, 'TEdit', 1, 'TextEditorDecorationType', 'TextEdit', 'TextEditor');
        assertTopScore(fuzzyScore, 'p', 4, 'parse', 'posix', 'pafdsa', 'path', 'p');
        assertTopScore(fuzzyScore, 'pa', 0, 'parse', 'pafdsa', 'path');
        // issue #14583
        assertTopScore(fuzzyScore, 'log', 3, 'HTMLOptGroupElement', 'ScrollLogicalPosition', 'SVGFEMorphologyElement', 'log', 'logger');
        assertTopScore(fuzzyScore, 'e', 2, 'AbstractWorker', 'ActiveXObject', 'else');
        // issue #14446
        assertTopScore(fuzzyScore, 'workbench.sideb', 1, 'workbench.editor.defaultSideBySideLayout', 'workbench.sideBar.location');
        // issue #11423
        assertTopScore(fuzzyScore, 'editor.r', 2, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
        // assertTopScore(fuzzyScore, 'editor.R', 1, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
        // assertTopScore(fuzzyScore, 'Editor.r', 0, 'diffEditor.renderSideBySide', 'editor.overviewRulerlanes', 'editor.renderControlCharacter', 'editor.renderWhitespace');
        assertTopScore(fuzzyScore, '-mo', 1, '-ms-ime-mode', '-moz-columns');
        // dupe, issue #14861
        assertTopScore(fuzzyScore, 'convertModelPosition', 0, 'convertModelPositionToViewPosition', 'convertViewToModelPosition');
        // dupe, issue #14942
        assertTopScore(fuzzyScore, 'is', 0, 'isValidViewletId', 'import statement');
        assertTopScore(fuzzyScore, 'title', 1, 'files.trimTrailingWhitespace', 'window.title');
        assertTopScore(fuzzyScore, 'const', 1, 'constructor', 'const', 'cuOnstrul');
    });
    test('Unexpected suggestion scoring, #28791', function () {
        assertTopScore(fuzzyScore, '_lines', 1, '_lineStarts', '_lines');
        assertTopScore(fuzzyScore, '_lines', 1, '_lineS', '_lines');
        assertTopScore(fuzzyScore, '_lineS', 0, '_lineS', '_lines');
    });
    test.skip('Bad completion ranking changes valid variable name to class name when pressing "." #187055', function () {
        assertTopScore(fuzzyScore, 'a', 1, 'A', 'a');
        assertTopScore(fuzzyScore, 'theme', 1, 'Theme', 'theme');
    });
    test('HTML closing tag proposal filtered out #38880', function () {
        assertMatches('\t\t<', '\t\t</body>', '^\t^\t^</body>', fuzzyScore, { patternPos: 0 });
        assertMatches('\t\t<', '\t\t</body>', '\t\t^</body>', fuzzyScore, { patternPos: 2 });
        assertMatches('\t<', '\t</body>', '\t^</body>', fuzzyScore, { patternPos: 1 });
    });
    test('fuzzyScoreGraceful', () => {
        assertMatches('rlut', 'result', undefined, fuzzyScore);
        assertMatches('rlut', 'result', '^res^u^l^t', fuzzyScoreGraceful);
        assertMatches('cno', 'console', '^co^ns^ole', fuzzyScore);
        assertMatches('cno', 'console', '^co^ns^ole', fuzzyScoreGraceful);
        assertMatches('cno', 'console', '^c^o^nsole', fuzzyScoreGracefulAggressive);
        assertMatches('cno', 'co_new', '^c^o_^new', fuzzyScoreGraceful);
        assertMatches('cno', 'co_new', '^c^o_^new', fuzzyScoreGracefulAggressive);
    });
    test('List highlight filter: Not all characters from match are highlighterd #66923', () => {
        assertMatches('foo', 'barbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo', 'barbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_^f^o^o', fuzzyScore);
    });
    test('Autocompletion is matched against truncated filterText to 54 characters #74133', () => {
        assertMatches('foo', 'ffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo', 'ffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_^f^o^o', fuzzyScore);
        assertMatches('Aoo', 'Affffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo', '^Affffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_f^o^o', fuzzyScore);
        assertMatches('foo', 'Gffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo', undefined, fuzzyScore);
    });
    test('"Go to Symbol" with the exact method name doesn\'t work as expected #84787', function () {
        const match = fuzzyScore(':get', ':get', 1, 'get', 'get', 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
        assert.ok(Boolean(match));
    });
    test('Wrong highlight after emoji #113404', function () {
        assertMatches('di', '✨div classname=""></div>', '✨^d^iv classname=""></div>', fuzzyScore);
        assertMatches('di', 'adiv classname=""></div>', 'adiv classname=""></^d^iv>', fuzzyScore);
    });
    test('Suggestion is not highlighted #85826', function () {
        assertMatches('SemanticTokens', 'SemanticTokensEdits', '^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits', fuzzyScore);
        assertMatches('SemanticTokens', 'SemanticTokensEdits', '^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits', fuzzyScoreGracefulAggressive);
    });
    test('IntelliSense completion not correctly highlighting text in front of cursor #115250', function () {
        assertMatches('lo', 'log', '^l^og', fuzzyScore);
        assertMatches('.lo', 'log', '^l^og', anyScore);
        assertMatches('.', 'log', 'log', anyScore);
    });
    test('anyScore should not require a strong first match', function () {
        assertMatches('bar', 'foobAr', 'foo^b^A^r', anyScore);
        assertMatches('bar', 'foobar', 'foo^b^a^r', anyScore);
    });
    test('configurable full match boost', function () {
        const prefix = 'create';
        const a = 'createModelServices';
        const b = 'create';
        let aBoost = fuzzyScore(prefix, prefix, 0, a, a.toLowerCase(), 0, { boostFullMatch: true, firstMatchCanBeWeak: true });
        let bBoost = fuzzyScore(prefix, prefix, 0, b, b.toLowerCase(), 0, { boostFullMatch: true, firstMatchCanBeWeak: true });
        assert.ok(aBoost);
        assert.ok(bBoost);
        assert.ok(aBoost[0] < bBoost[0]);
        // also works with wordStart > 0 (https://github.com/microsoft/vscode/issues/187921)
        const wordPrefix = '$(symbol-function) ';
        aBoost = fuzzyScore(prefix, prefix, 0, `${wordPrefix}${a}`, `${wordPrefix}${a}`.toLowerCase(), wordPrefix.length, { boostFullMatch: true, firstMatchCanBeWeak: true });
        bBoost = fuzzyScore(prefix, prefix, 0, `${wordPrefix}${b}`, `${wordPrefix}${b}`.toLowerCase(), wordPrefix.length, { boostFullMatch: true, firstMatchCanBeWeak: true });
        assert.ok(aBoost);
        assert.ok(bBoost);
        assert.ok(aBoost[0] < bBoost[0]);
        const aScore = fuzzyScore(prefix, prefix, 0, a, a.toLowerCase(), 0, { boostFullMatch: false, firstMatchCanBeWeak: true });
        const bScore = fuzzyScore(prefix, prefix, 0, b, b.toLowerCase(), 0, { boostFullMatch: false, firstMatchCanBeWeak: true });
        assert.ok(aScore);
        assert.ok(bScore);
        assert.ok(aScore[0] === bScore[0]);
    });
    test('Unexpected suggest highlighting ignores whole word match in favor of matching first letter#147423', function () {
        assertMatches('i', 'machine/{id}', 'machine/{^id}', fuzzyScore);
        assertMatches('ok', 'obobobf{ok}/user', '^obobobf{o^k}/user', fuzzyScore);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsdGVycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9maWx0ZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSw0QkFBNEIsRUFBZ0MsOEJBQThCLEVBQUUsZ0JBQWdCLEVBQUUsMEJBQTBCLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxFQUFFLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNwVCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsU0FBUyxRQUFRLENBQUMsTUFBZSxFQUFFLElBQVksRUFBRSxrQkFBMEIsRUFBRSxVQUE2QztJQUN6SCxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDM0MsTUFBTSxDQUFDLENBQUMsRUFBRSxHQUFHLElBQUksaUJBQWlCLGtCQUFrQixFQUFFLENBQUMsQ0FBQztJQUN4RCxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2hCLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsTUFBZSxFQUFFLElBQVksRUFBRSxrQkFBMEI7SUFDN0UsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLEdBQUcsSUFBSSxZQUFZLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUNwRixDQUFDO0FBRUQsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7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RSxNQUFNLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQztJQUNsRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLE1BQU0sRUFBRSx3QkFBd0IsRUFBRTtZQUN0RSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtTQUNwQixDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFDM0MsUUFBUSxDQUFDLDhCQUE4QixFQUFFLE1BQU0sRUFBRSx3QkFBd0IsRUFBRTtZQUMxRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtTQUNwQixDQUFDLENBQUM7UUFDSCxRQUFRLENBQUMsOEJBQThCLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtZQUN4RCxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtTQUNwQixDQUFDLENBQUM7UUFDSCxRQUFRLENBQUMsOEJBQThCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRTtZQUMzRCxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtTQUNwQixDQUFDLENBQUM7UUFDSCxRQUFRLENBQUMsOEJBQThCLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRTtZQUM1RCxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtTQUNwQixDQUFDLENBQUM7UUFDSCxRQUFRLENBQUMsOEJBQThCLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTtZQUMxRCxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtTQUNwQixDQUFDLENBQUM7UUFDSCxRQUFRLENBQUMsOEJBQThCLEVBQUUsT0FBTyxFQUFFLE9B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QUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEYsUUFBUSxDQUFDLFlBQVksRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6RixRQUFRLENBQUMsWUFBWSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFGLFFBQVEsQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0RyxRQUFRLENBQUMsWUFBWSxFQUFFLEtBQUssRUFBRSxxQkFBcUIsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkcsUUFBUSxDQUFDLFlBQVksRUFBRSxNQUFNLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXhHLFdBQVcsQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzdD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