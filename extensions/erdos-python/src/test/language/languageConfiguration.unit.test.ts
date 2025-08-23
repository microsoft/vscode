// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';

import { getLanguageConfiguration } from '../../client/language/languageConfiguration';

const NEEDS_INDENT = [
    /^break$/,
    /^continue$/,
    // raise is indented unless it's the only thing on the line
    /^raise\b/,
    /^return\b/,
];
const INDENT_ON_ENTER = [
    // block-beginning statements
    /^async\s+def\b/,
    /^async\s+for\b/,
    /^async\s+with\b/,
    /^class\b/,
    /^def\b/,
    /^with\b/,
    /^try\b/,
    /^except\b/,
    /^finally\b/,
    /^while\b/,
    /^for\b/,
    /^if\b/,
    /^elif\b/,
    /^else\b/,
    /^match\b/,
    /^case\b/,
];
const DEDENT_ON_ENTER = [
    // block-ending statements
    // For now we are ignoring "return" completely.
    // See https://github.com/microsoft/vscode-python/issues/6564.
    /// ^return\b/,
    /^break$/,
    /^continue$/,
    // For now we are mostly ignoring "return".
    // See https://github.com/microsoft/vscode-python/issues/10583.
    /^raise$/,
    /^pass\b/,
];

function isMember(line: string, regexes: RegExp[]): boolean {
    for (const regex of regexes) {
        if (regex.test(line)) {
            return true;
        }
    }
    return false;
}

function resolveExample(
    base: string,
    leading: string,
    postKeyword: string,
    preColon: string,
    trailing: string,
): [string | undefined, string | undefined, boolean] {
    let invalid: string | undefined;
    if (base.trim() === '') {
        invalid = 'blank line';
    } else if (leading === '' && isMember(base, NEEDS_INDENT)) {
        invalid = 'expected indent';
    } else if (leading.trim() !== '') {
        invalid = 'look-alike - pre-keyword';
    } else if (postKeyword.trim() !== '') {
        invalid = 'look-alike - post-keyword';
    }

    let resolvedBase = base;
    if (postKeyword !== '') {
        if (resolvedBase.includes(' ')) {
            const kw = resolvedBase.split(' ', 1)[0];
            const remainder = resolvedBase.substring(kw.length);
            resolvedBase = `${kw}${postKeyword} ${remainder}`;
        } else if (resolvedBase.endsWith(':')) {
            resolvedBase = `${resolvedBase.substring(0, resolvedBase.length - 1)}${postKeyword}:`;
        } else {
            resolvedBase = `${resolvedBase}${postKeyword}`;
        }
    }
    if (preColon !== '') {
        if (resolvedBase.endsWith(':')) {
            resolvedBase = `${resolvedBase.substring(0, resolvedBase.length - 1)}${preColon}:`;
        } else {
            return [undefined, undefined, true];
        }
    }
    const example = `${leading}${resolvedBase}${trailing}`;
    return [example, invalid, false];
}

suite('Language Configuration', () => {
    const cfg = getLanguageConfiguration();

    suite('"brackets"', () => {
        test('brackets is not defined', () => {
            expect(cfg.brackets).to.be.equal(undefined, 'missing tests');
        });
    });

    suite('"comments"', () => {
        test('comments is not defined', () => {
            expect(cfg.comments).to.be.equal(undefined, 'missing tests');
        });
    });

    suite('"indentationRules"', () => {
        test('indentationRules is not defined', () => {
            expect(cfg.indentationRules).to.be.equal(undefined, 'missing tests');
        });
    });

    suite('"onEnterRules"', () => {
        const MULTILINE_SEPARATOR_INDENT_REGEX = cfg.onEnterRules![0].beforeText;
        const INDENT_ONENTER_REGEX = cfg.onEnterRules![2].beforeText;
        const OUTDENT_ONENTER_REGEX = cfg.onEnterRules![3].beforeText;
        // To see the actual (non-verbose) regex patterns, un-comment
        // the following lines:
        // console.log(INDENT_ONENTER_REGEX.source);
        // console.log(OUTDENT_ONENTER_REGEX.source);

        test('Multiline separator indent regex should not pick up strings with no multiline separator', async () => {
            const result = MULTILINE_SEPARATOR_INDENT_REGEX.test('a = "test"');
            expect(result).to.be.equal(
                false,
                'Multiline separator indent regex for regular strings should not have matches',
            );
        });

        test('Multiline separator indent regex should not pick up strings with escaped characters', async () => {
            const result = MULTILINE_SEPARATOR_INDENT_REGEX.test("a = 'hello \\n'");
            expect(result).to.be.equal(
                false,
                'Multiline separator indent regex for strings with escaped characters should not have matches',
            );
        });

        test('Multiline separator indent regex should pick up strings ending with a multiline separator', async () => {
            const result = MULTILINE_SEPARATOR_INDENT_REGEX.test("a = 'multiline \\");
            expect(result).to.be.equal(
                true,
                'Multiline separator indent regex for strings with newline separator should have matches',
            );
        });

        [
            // compound statements
            'async def test(self):',
            'async def :',
            'async :',
            'async for spam in bacon:',
            'async with context:',
            'async with context in manager:',
            'class Test:',
            'class Test(object):',
            'class :',
            'def spam():',
            'def spam(self, node, namespace=""):',
            'def :',
            'for item in items:',
            'for item in :',
            'for :',
            'if foo is None:',
            'if :',
            'try:',
            "while '::' in macaddress:",
            'while :',
            'with self.test:',
            'with :',
            'elif x < 5:',
            'elif :',
            'else:',
            'except TestError:',
            'except :',
            'finally:',
            'match item:',
            'case 200:',
            'case (1, 1):',
            'case Point(x=0, y=0):',
            'case [Point(0, 0)]:',
            'case Point(x, y) if x == y:',
            'case (Point(x1, y1), Point(x2, y2) as p2):',
            'case Color.RED:',
            'case 401 | 403 | 404:',
            'case _:',
            // simple statemenhts
            'pass',
            'raise Exception(msg)',
            'raise Exception',
            'raise', // re-raise
            'break',
            'continue',
            'return',
            'return True',
            'return (True, False, False)',
            'return [True, False, False]',
            'return {True, False, False}',
            'return (',
            'return [',
            'return {',
            'return',
            // bogus
            '',
            ' ',
            '  ',
        ].forEach((base) => {
            [
                ['', '', '', ''],
                // leading
                ['    ', '', '', ''],
                ['   ', '', '', ''], // unusual indent
                ['\t\t', '', '', ''],
                // pre-keyword
                ['x', '', '', ''],
                // post-keyword
                ['', 'x', '', ''],
                // pre-colon
                ['', '', ' ', ''],
                // trailing
                ['', '', '', ' '],
                ['', '', '', '# a comment'],
                ['', '', '', ' # ...'],
            ].forEach((whitespace) => {
                const [leading, postKeyword, preColon, trailing] = whitespace;
                const [_example, invalid, ignored] = resolveExample(base, leading, postKeyword, preColon, trailing);
                if (ignored) {
                    return;
                }
                const example = _example!;

                if (invalid) {
                    test(`Line "${example}" ignored (${invalid})`, () => {
                        let result: boolean;

                        result = INDENT_ONENTER_REGEX.test(example);
                        expect(result).to.be.equal(false, 'unexpected match');

                        result = OUTDENT_ONENTER_REGEX.test(example);
                        expect(result).to.be.equal(false, 'unexpected match');
                    });
                    return;
                }

                test(`Check indent-on-enter for line "${example}"`, () => {
                    let expected = false;
                    if (isMember(base, INDENT_ON_ENTER)) {
                        expected = true;
                    }

                    const result = INDENT_ONENTER_REGEX.test(example);

                    expect(result).to.be.equal(expected, 'unexpected result');
                });

                test(`Check dedent-on-enter for line "${example}"`, () => {
                    let expected = false;
                    if (isMember(base, DEDENT_ON_ENTER)) {
                        expected = true;
                    }

                    const result = OUTDENT_ONENTER_REGEX.test(example);

                    expect(result).to.be.equal(expected, 'unexpected result');
                });
            });
        });
    });

    suite('"wordPattern"', () => {
        test('wordPattern is not defined', () => {
            expect(cfg.wordPattern).to.be.equal(undefined, 'missing tests');
        });
    });
});
