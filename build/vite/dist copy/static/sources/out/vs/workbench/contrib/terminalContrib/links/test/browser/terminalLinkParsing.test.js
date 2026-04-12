/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { detectLinks, detectLinkSuffixes, getLinkSuffix, removeLinkQueryString, removeLinkSuffix } from '../../browser/terminalLinkParsing.js';
const operatingSystems = [
    3 /* OperatingSystem.Linux */,
    2 /* OperatingSystem.Macintosh */,
    1 /* OperatingSystem.Windows */
];
const osTestPath = {
    [3 /* OperatingSystem.Linux */]: '/test/path/linux',
    [2 /* OperatingSystem.Macintosh */]: '/test/path/macintosh',
    [1 /* OperatingSystem.Windows */]: 'C:\\test\\path\\windows'
};
const osLabel = {
    [3 /* OperatingSystem.Linux */]: '[Linux]',
    [2 /* OperatingSystem.Macintosh */]: '[macOS]',
    [1 /* OperatingSystem.Windows */]: '[Windows]'
};
const testRow = 339;
const testCol = 12;
const testRowEnd = 341;
const testColEnd = 789;
const testLinks = [
    // Simple
    { link: 'foo', prefix: undefined, suffix: undefined, hasRow: false, hasCol: false },
    { link: 'foo:339', prefix: undefined, suffix: ':339', hasRow: true, hasCol: false },
    { link: 'foo:339:12', prefix: undefined, suffix: ':339:12', hasRow: true, hasCol: true },
    { link: 'foo:339:12-789', prefix: undefined, suffix: ':339:12-789', hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
    { link: 'foo:339.12', prefix: undefined, suffix: ':339.12', hasRow: true, hasCol: true },
    { link: 'foo:339.12-789', prefix: undefined, suffix: ':339.12-789', hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
    { link: 'foo:339.12-341.789', prefix: undefined, suffix: ':339.12-341.789', hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
    { link: 'foo#339', prefix: undefined, suffix: '#339', hasRow: true, hasCol: false },
    { link: 'foo#339:12', prefix: undefined, suffix: '#339:12', hasRow: true, hasCol: true },
    { link: 'foo#339:12-789', prefix: undefined, suffix: '#339:12-789', hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
    { link: 'foo#339.12', prefix: undefined, suffix: '#339.12', hasRow: true, hasCol: true },
    { link: 'foo#339.12-789', prefix: undefined, suffix: '#339.12-789', hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
    { link: 'foo#339.12-341.789', prefix: undefined, suffix: '#339.12-341.789', hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
    { link: 'foo 339', prefix: undefined, suffix: ' 339', hasRow: true, hasCol: false },
    { link: 'foo 339:12', prefix: undefined, suffix: ' 339:12', hasRow: true, hasCol: true },
    { link: 'foo 339:12-789', prefix: undefined, suffix: ' 339:12-789', hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
    { link: 'foo 339.12', prefix: undefined, suffix: ' 339.12', hasRow: true, hasCol: true },
    { link: 'foo 339.12-789', prefix: undefined, suffix: ' 339.12-789', hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
    { link: 'foo 339.12-341.789', prefix: undefined, suffix: ' 339.12-341.789', hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
    { link: 'foo, 339', prefix: undefined, suffix: ', 339', hasRow: true, hasCol: false },
    // Double quotes
    { link: '"foo",339', prefix: '"', suffix: '",339', hasRow: true, hasCol: false },
    { link: '"foo",339:12', prefix: '"', suffix: '",339:12', hasRow: true, hasCol: true },
    { link: '"foo",339.12', prefix: '"', suffix: '",339.12', hasRow: true, hasCol: true },
    { link: '"foo", line 339', prefix: '"', suffix: '", line 339', hasRow: true, hasCol: false },
    { link: '"foo", line 339, col 12', prefix: '"', suffix: '", line 339, col 12', hasRow: true, hasCol: true },
    { link: '"foo", line 339, column 12', prefix: '"', suffix: '", line 339, column 12', hasRow: true, hasCol: true },
    { link: '"foo":line 339', prefix: '"', suffix: '":line 339', hasRow: true, hasCol: false },
    { link: '"foo":line 339, col 12', prefix: '"', suffix: '":line 339, col 12', hasRow: true, hasCol: true },
    { link: '"foo":line 339, column 12', prefix: '"', suffix: '":line 339, column 12', hasRow: true, hasCol: true },
    { link: '"foo": line 339', prefix: '"', suffix: '": line 339', hasRow: true, hasCol: false },
    { link: '"foo": line 339, col 12', prefix: '"', suffix: '": line 339, col 12', hasRow: true, hasCol: true },
    { link: '"foo": line 339, column 12', prefix: '"', suffix: '": line 339, column 12', hasRow: true, hasCol: true },
    { link: '"foo" on line 339', prefix: '"', suffix: '" on line 339', hasRow: true, hasCol: false },
    { link: '"foo" on line 339, col 12', prefix: '"', suffix: '" on line 339, col 12', hasRow: true, hasCol: true },
    { link: '"foo" on line 339, column 12', prefix: '"', suffix: '" on line 339, column 12', hasRow: true, hasCol: true },
    { link: '"foo" line 339', prefix: '"', suffix: '" line 339', hasRow: true, hasCol: false },
    { link: '"foo" line 339 column 12', prefix: '"', suffix: '" line 339 column 12', hasRow: true, hasCol: true },
    // Single quotes
    { link: '\'foo\',339', prefix: '\'', suffix: '\',339', hasRow: true, hasCol: false },
    { link: '\'foo\',339:12', prefix: '\'', suffix: '\',339:12', hasRow: true, hasCol: true },
    { link: '\'foo\',339.12', prefix: '\'', suffix: '\',339.12', hasRow: true, hasCol: true },
    { link: '\'foo\', line 339', prefix: '\'', suffix: '\', line 339', hasRow: true, hasCol: false },
    { link: '\'foo\', line 339, col 12', prefix: '\'', suffix: '\', line 339, col 12', hasRow: true, hasCol: true },
    { link: '\'foo\', line 339, column 12', prefix: '\'', suffix: '\', line 339, column 12', hasRow: true, hasCol: true },
    { link: '\'foo\':line 339', prefix: '\'', suffix: '\':line 339', hasRow: true, hasCol: false },
    { link: '\'foo\':line 339, col 12', prefix: '\'', suffix: '\':line 339, col 12', hasRow: true, hasCol: true },
    { link: '\'foo\':line 339, column 12', prefix: '\'', suffix: '\':line 339, column 12', hasRow: true, hasCol: true },
    { link: '\'foo\': line 339', prefix: '\'', suffix: '\': line 339', hasRow: true, hasCol: false },
    { link: '\'foo\': line 339, col 12', prefix: '\'', suffix: '\': line 339, col 12', hasRow: true, hasCol: true },
    { link: '\'foo\': line 339, column 12', prefix: '\'', suffix: '\': line 339, column 12', hasRow: true, hasCol: true },
    { link: '\'foo\' on line 339', prefix: '\'', suffix: '\' on line 339', hasRow: true, hasCol: false },
    { link: '\'foo\' on line 339, col 12', prefix: '\'', suffix: '\' on line 339, col 12', hasRow: true, hasCol: true },
    { link: '\'foo\' on line 339, column 12', prefix: '\'', suffix: '\' on line 339, column 12', hasRow: true, hasCol: true },
    { link: '\'foo\' line 339', prefix: '\'', suffix: '\' line 339', hasRow: true, hasCol: false },
    { link: '\'foo\' line 339 column 12', prefix: '\'', suffix: '\' line 339 column 12', hasRow: true, hasCol: true },
    // No quotes
    { link: 'foo, line 339', prefix: undefined, suffix: ', line 339', hasRow: true, hasCol: false },
    { link: 'foo, line 339, col 12', prefix: undefined, suffix: ', line 339, col 12', hasRow: true, hasCol: true },
    { link: 'foo, line 339, column 12', prefix: undefined, suffix: ', line 339, column 12', hasRow: true, hasCol: true },
    { link: 'foo:line 339', prefix: undefined, suffix: ':line 339', hasRow: true, hasCol: false },
    { link: 'foo:line 339, col 12', prefix: undefined, suffix: ':line 339, col 12', hasRow: true, hasCol: true },
    { link: 'foo:line 339, column 12', prefix: undefined, suffix: ':line 339, column 12', hasRow: true, hasCol: true },
    { link: 'foo: line 339', prefix: undefined, suffix: ': line 339', hasRow: true, hasCol: false },
    { link: 'foo: line 339, col 12', prefix: undefined, suffix: ': line 339, col 12', hasRow: true, hasCol: true },
    { link: 'foo: line 339, column 12', prefix: undefined, suffix: ': line 339, column 12', hasRow: true, hasCol: true },
    { link: 'foo on line 339', prefix: undefined, suffix: ' on line 339', hasRow: true, hasCol: false },
    { link: 'foo on line 339, col 12', prefix: undefined, suffix: ' on line 339, col 12', hasRow: true, hasCol: true },
    { link: 'foo on line 339, column 12', prefix: undefined, suffix: ' on line 339, column 12', hasRow: true, hasCol: true },
    { link: 'foo line 339', prefix: undefined, suffix: ' line 339', hasRow: true, hasCol: false },
    { link: 'foo line 339 column 12', prefix: undefined, suffix: ' line 339 column 12', hasRow: true, hasCol: true },
    // Parentheses
    { link: 'foo(339)', prefix: undefined, suffix: '(339)', hasRow: true, hasCol: false },
    { link: 'foo(339,12)', prefix: undefined, suffix: '(339,12)', hasRow: true, hasCol: true },
    { link: 'foo(339, 12)', prefix: undefined, suffix: '(339, 12)', hasRow: true, hasCol: true },
    { link: 'foo (339)', prefix: undefined, suffix: ' (339)', hasRow: true, hasCol: false },
    { link: 'foo (339,12)', prefix: undefined, suffix: ' (339,12)', hasRow: true, hasCol: true },
    { link: 'foo (339, 12)', prefix: undefined, suffix: ' (339, 12)', hasRow: true, hasCol: true },
    { link: 'foo: (339)', prefix: undefined, suffix: ': (339)', hasRow: true, hasCol: false },
    { link: 'foo: (339,12)', prefix: undefined, suffix: ': (339,12)', hasRow: true, hasCol: true },
    { link: 'foo: (339, 12)', prefix: undefined, suffix: ': (339, 12)', hasRow: true, hasCol: true },
    { link: 'foo(339:12)', prefix: undefined, suffix: '(339:12)', hasRow: true, hasCol: true },
    { link: 'foo (339:12)', prefix: undefined, suffix: ' (339:12)', hasRow: true, hasCol: true },
    // Square brackets
    { link: 'foo[339]', prefix: undefined, suffix: '[339]', hasRow: true, hasCol: false },
    { link: 'foo[339,12]', prefix: undefined, suffix: '[339,12]', hasRow: true, hasCol: true },
    { link: 'foo[339, 12]', prefix: undefined, suffix: '[339, 12]', hasRow: true, hasCol: true },
    { link: 'foo [339]', prefix: undefined, suffix: ' [339]', hasRow: true, hasCol: false },
    { link: 'foo [339,12]', prefix: undefined, suffix: ' [339,12]', hasRow: true, hasCol: true },
    { link: 'foo [339, 12]', prefix: undefined, suffix: ' [339, 12]', hasRow: true, hasCol: true },
    { link: 'foo: [339]', prefix: undefined, suffix: ': [339]', hasRow: true, hasCol: false },
    { link: 'foo: [339,12]', prefix: undefined, suffix: ': [339,12]', hasRow: true, hasCol: true },
    { link: 'foo: [339, 12]', prefix: undefined, suffix: ': [339, 12]', hasRow: true, hasCol: true },
    { link: 'foo[339:12]', prefix: undefined, suffix: '[339:12]', hasRow: true, hasCol: true },
    { link: 'foo [339:12]', prefix: undefined, suffix: ' [339:12]', hasRow: true, hasCol: true },
    // OCaml-style
    { link: '"foo", line 339, character 12', prefix: '"', suffix: '", line 339, character 12', hasRow: true, hasCol: true },
    { link: '"foo", line 339, characters 12-789', prefix: '"', suffix: '", line 339, characters 12-789', hasRow: true, hasCol: true, hasColEnd: true },
    { link: '"foo", lines 339-341', prefix: '"', suffix: '", lines 339-341', hasRow: true, hasCol: false, hasRowEnd: true },
    { link: '"foo", lines 339-341, characters 12-789', prefix: '"', suffix: '", lines 339-341, characters 12-789', hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
    // Non-breaking space
    { link: 'foo\u00A0339:12', prefix: undefined, suffix: '\u00A0339:12', hasRow: true, hasCol: true },
    { link: '"foo" on line 339,\u00A0column 12', prefix: '"', suffix: '" on line 339,\u00A0column 12', hasRow: true, hasCol: true },
    { link: '\'foo\' on line\u00A0339, column 12', prefix: '\'', suffix: '\' on line\u00A0339, column 12', hasRow: true, hasCol: true },
    { link: 'foo (339,\u00A012)', prefix: undefined, suffix: ' (339,\u00A012)', hasRow: true, hasCol: true },
    { link: 'foo\u00A0[339, 12]', prefix: undefined, suffix: '\u00A0[339, 12]', hasRow: true, hasCol: true },
];
const testLinksWithSuffix = testLinks.filter(e => !!e.suffix);
suite('TerminalLinkParsing', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('removeLinkSuffix', () => {
        for (const testLink of testLinks) {
            test('`' + testLink.link + '`', () => {
                deepStrictEqual(removeLinkSuffix(testLink.link), testLink.suffix === undefined ? testLink.link : testLink.link.replace(testLink.suffix, ''));
            });
        }
    });
    suite('getLinkSuffix', () => {
        for (const testLink of testLinks) {
            test('`' + testLink.link + '`', () => {
                deepStrictEqual(getLinkSuffix(testLink.link), testLink.suffix === undefined ? null : {
                    row: testLink.hasRow ? testRow : undefined,
                    col: testLink.hasCol ? testCol : undefined,
                    rowEnd: testLink.hasRowEnd ? testRowEnd : undefined,
                    colEnd: testLink.hasColEnd ? testColEnd : undefined,
                    suffix: {
                        index: testLink.link.length - testLink.suffix.length,
                        text: testLink.suffix
                    }
                });
            });
        }
    });
    suite('detectLinkSuffixes', () => {
        for (const testLink of testLinks) {
            test('`' + testLink.link + '`', () => {
                deepStrictEqual(detectLinkSuffixes(testLink.link), testLink.suffix === undefined ? [] : [{
                        row: testLink.hasRow ? testRow : undefined,
                        col: testLink.hasCol ? testCol : undefined,
                        rowEnd: testLink.hasRowEnd ? testRowEnd : undefined,
                        colEnd: testLink.hasColEnd ? testColEnd : undefined,
                        suffix: {
                            index: testLink.link.length - testLink.suffix.length,
                            text: testLink.suffix
                        }
                    }]);
            });
        }
        test('foo(1, 2) bar[3, 4] baz on line 5', () => {
            deepStrictEqual(detectLinkSuffixes('foo(1, 2) bar[3, 4] baz on line 5'), [
                {
                    col: 2,
                    row: 1,
                    rowEnd: undefined,
                    colEnd: undefined,
                    suffix: {
                        index: 3,
                        text: '(1, 2)'
                    }
                },
                {
                    col: 4,
                    row: 3,
                    rowEnd: undefined,
                    colEnd: undefined,
                    suffix: {
                        index: 13,
                        text: '[3, 4]'
                    }
                },
                {
                    col: undefined,
                    row: 5,
                    rowEnd: undefined,
                    colEnd: undefined,
                    suffix: {
                        index: 23,
                        text: ' on line 5'
                    }
                }
            ]);
        });
    });
    suite('removeLinkQueryString', () => {
        test('should remove any query string from the link', () => {
            strictEqual(removeLinkQueryString('?a=b'), '');
            strictEqual(removeLinkQueryString('foo?a=b'), 'foo');
            strictEqual(removeLinkQueryString('./foo?a=b'), './foo');
            strictEqual(removeLinkQueryString('/foo/bar?a=b'), '/foo/bar');
            strictEqual(removeLinkQueryString('foo?a=b?'), 'foo');
            strictEqual(removeLinkQueryString('foo?a=b&c=d'), 'foo');
        });
        test('should respect ? in UNC paths', () => {
            strictEqual(removeLinkQueryString('\\\\?\\foo?a=b'), '\\\\?\\foo');
        });
    });
    suite('detectLinks', () => {
        test('foo(1, 2) bar[3, 4] "baz" on line 5', () => {
            deepStrictEqual(detectLinks('foo(1, 2) bar[3, 4] "baz" on line 5', 3 /* OperatingSystem.Linux */), [
                {
                    path: {
                        index: 0,
                        text: 'foo'
                    },
                    prefix: undefined,
                    suffix: {
                        col: 2,
                        row: 1,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 3,
                            text: '(1, 2)'
                        }
                    }
                },
                {
                    path: {
                        index: 10,
                        text: 'bar'
                    },
                    prefix: undefined,
                    suffix: {
                        col: 4,
                        row: 3,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 13,
                            text: '[3, 4]'
                        }
                    }
                },
                {
                    path: {
                        index: 21,
                        text: 'baz'
                    },
                    prefix: {
                        index: 20,
                        text: '"'
                    },
                    suffix: {
                        col: undefined,
                        row: 5,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 24,
                            text: '" on line 5'
                        }
                    }
                }
            ]);
        });
        test('should detect multiple links when opening brackets are in the text', () => {
            deepStrictEqual(detectLinks('notlink[foo:45]', 3 /* OperatingSystem.Linux */), [
                {
                    path: {
                        index: 0,
                        text: 'notlink[foo'
                    },
                    prefix: undefined,
                    suffix: {
                        col: undefined,
                        row: 45,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 11,
                            text: ':45'
                        }
                    }
                },
                {
                    path: {
                        index: 8,
                        text: 'foo'
                    },
                    prefix: undefined,
                    suffix: {
                        col: undefined,
                        row: 45,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 11,
                            text: ':45'
                        }
                    }
                },
            ]);
        });
        test('should extract the link prefix', () => {
            deepStrictEqual(detectLinks('"foo", line 5, col 6', 3 /* OperatingSystem.Linux */), [
                {
                    path: {
                        index: 1,
                        text: 'foo'
                    },
                    prefix: {
                        index: 0,
                        text: '"',
                    },
                    suffix: {
                        row: 5,
                        col: 6,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 4,
                            text: '", line 5, col 6'
                        }
                    }
                },
            ]);
        });
        test('should be smart about determining the link prefix when multiple prefix characters exist', () => {
            deepStrictEqual(detectLinks('echo \'"foo", line 5, col 6\'', 3 /* OperatingSystem.Linux */), [
                {
                    path: {
                        index: 7,
                        text: 'foo'
                    },
                    prefix: {
                        index: 6,
                        text: '"',
                    },
                    suffix: {
                        row: 5,
                        col: 6,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 10,
                            text: '", line 5, col 6'
                        }
                    }
                },
            ], 'The outer single quotes should be excluded from the link prefix and suffix');
        });
        test('should detect both suffix and non-suffix links on a single line', () => {
            deepStrictEqual(detectLinks('PS C:\\Github\\microsoft\\vscode> echo \'"foo", line 5, col 6\'', 1 /* OperatingSystem.Windows */), [
                {
                    path: {
                        index: 3,
                        text: 'C:\\Github\\microsoft\\vscode'
                    },
                    prefix: undefined,
                    suffix: undefined
                },
                {
                    path: {
                        index: 38,
                        text: 'foo'
                    },
                    prefix: {
                        index: 37,
                        text: '"',
                    },
                    suffix: {
                        row: 5,
                        col: 6,
                        rowEnd: undefined,
                        colEnd: undefined,
                        suffix: {
                            index: 41,
                            text: '", line 5, col 6'
                        }
                    }
                }
            ]);
        });
        suite('"|"', () => {
            test('should exclude pipe characters from link paths', () => {
                deepStrictEqual(detectLinks('|C:\\Github\\microsoft\\vscode|', 1 /* OperatingSystem.Windows */), [
                    {
                        path: {
                            index: 1,
                            text: 'C:\\Github\\microsoft\\vscode'
                        },
                        prefix: undefined,
                        suffix: undefined
                    }
                ]);
            });
            test('should exclude pipe characters from link paths with suffixes', () => {
                deepStrictEqual(detectLinks('|C:\\Github\\microsoft\\vscode:400|', 1 /* OperatingSystem.Windows */), [
                    {
                        path: {
                            index: 1,
                            text: 'C:\\Github\\microsoft\\vscode'
                        },
                        prefix: undefined,
                        suffix: {
                            col: undefined,
                            row: 400,
                            rowEnd: undefined,
                            colEnd: undefined,
                            suffix: {
                                index: 27,
                                text: ':400'
                            }
                        }
                    }
                ]);
            });
        });
        suite('"<>"', () => {
            for (const os of operatingSystems) {
                test(`should exclude bracket characters from link paths ${osLabel[os]}`, () => {
                    deepStrictEqual(detectLinks(`<${osTestPath[os]}<`, os), [
                        {
                            path: {
                                index: 1,
                                text: osTestPath[os]
                            },
                            prefix: undefined,
                            suffix: undefined
                        }
                    ]);
                    deepStrictEqual(detectLinks(`>${osTestPath[os]}>`, os), [
                        {
                            path: {
                                index: 1,
                                text: osTestPath[os]
                            },
                            prefix: undefined,
                            suffix: undefined
                        }
                    ]);
                });
                test(`should exclude bracket characters from link paths with suffixes ${osLabel[os]}`, () => {
                    deepStrictEqual(detectLinks(`<${osTestPath[os]}:400<`, os), [
                        {
                            path: {
                                index: 1,
                                text: osTestPath[os]
                            },
                            prefix: undefined,
                            suffix: {
                                col: undefined,
                                row: 400,
                                rowEnd: undefined,
                                colEnd: undefined,
                                suffix: {
                                    index: 1 + osTestPath[os].length,
                                    text: ':400'
                                }
                            }
                        }
                    ]);
                    deepStrictEqual(detectLinks(`>${osTestPath[os]}:400>`, os), [
                        {
                            path: {
                                index: 1,
                                text: osTestPath[os]
                            },
                            prefix: undefined,
                            suffix: {
                                col: undefined,
                                row: 400,
                                rowEnd: undefined,
                                colEnd: undefined,
                                suffix: {
                                    index: 1 + osTestPath[os].length,
                                    text: ':400'
                                }
                            }
                        }
                    ]);
                });
            }
        });
        suite('query strings', () => {
            for (const os of operatingSystems) {
                test(`should exclude query strings from link paths ${osLabel[os]}`, () => {
                    deepStrictEqual(detectLinks(`${osTestPath[os]}?a=b`, os), [
                        {
                            path: {
                                index: 0,
                                text: osTestPath[os]
                            },
                            prefix: undefined,
                            suffix: undefined
                        }
                    ]);
                    deepStrictEqual(detectLinks(`${osTestPath[os]}?a=b&c=d`, os), [
                        {
                            path: {
                                index: 0,
                                text: osTestPath[os]
                            },
                            prefix: undefined,
                            suffix: undefined
                        }
                    ]);
                });
                test('should not detect links starting with ? within query strings that contain posix-style paths (#204195)', () => {
                    // ? appended to the cwd will exist since it's just the cwd
                    strictEqual(detectLinks(`http://foo.com/?bar=/a/b&baz=c`, os).some(e => e.path.text.startsWith('?')), false);
                });
                test('should not detect links starting with ? within query strings that contain Windows-style paths (#204195)', () => {
                    // ? appended to the cwd will exist since it's just the cwd
                    strictEqual(detectLinks(`http://foo.com/?bar=a:\\b&baz=c`, os).some(e => e.path.text.startsWith('?')), false);
                });
            }
        });
        suite('should detect file names in git diffs', () => {
            test('--- a/foo/bar', () => {
                deepStrictEqual(detectLinks('--- a/foo/bar', 3 /* OperatingSystem.Linux */), [
                    {
                        path: {
                            index: 6,
                            text: 'foo/bar'
                        },
                        prefix: undefined,
                        suffix: undefined
                    }
                ]);
            });
            test('+++ b/foo/bar', () => {
                deepStrictEqual(detectLinks('+++ b/foo/bar', 3 /* OperatingSystem.Linux */), [
                    {
                        path: {
                            index: 6,
                            text: 'foo/bar'
                        },
                        prefix: undefined,
                        suffix: undefined
                    }
                ]);
            });
            test('diff --git a/foo/bar b/foo/baz', () => {
                deepStrictEqual(detectLinks('diff --git a/foo/bar b/foo/baz', 3 /* OperatingSystem.Linux */), [
                    {
                        path: {
                            index: 13,
                            text: 'foo/bar'
                        },
                        prefix: undefined,
                        suffix: undefined
                    },
                    {
                        path: {
                            index: 23,
                            text: 'foo/baz'
                        },
                        prefix: undefined,
                        suffix: undefined
                    }
                ]);
            });
        });
        suite('should detect 3 suffix links on a single line', () => {
            for (let i = 0; i < testLinksWithSuffix.length - 2; i++) {
                const link1 = testLinksWithSuffix[i];
                const link2 = testLinksWithSuffix[i + 1];
                const link3 = testLinksWithSuffix[i + 2];
                const line = ` ${link1.link} ${link2.link} ${link3.link} `;
                test('`' + line.replaceAll('\u00A0', '<nbsp>') + '`', () => {
                    strictEqual(detectLinks(line, 3 /* OperatingSystem.Linux */).length, 3);
                    ok(link1.suffix);
                    ok(link2.suffix);
                    ok(link3.suffix);
                    const detectedLink1 = {
                        prefix: link1.prefix ? {
                            index: 1,
                            text: link1.prefix
                        } : undefined,
                        path: {
                            index: 1 + (link1.prefix?.length ?? 0),
                            text: link1.link.replace(link1.suffix, '').replace(link1.prefix || '', '')
                        },
                        suffix: {
                            row: link1.hasRow ? testRow : undefined,
                            col: link1.hasCol ? testCol : undefined,
                            rowEnd: link1.hasRowEnd ? testRowEnd : undefined,
                            colEnd: link1.hasColEnd ? testColEnd : undefined,
                            suffix: {
                                index: 1 + (link1.link.length - link1.suffix.length),
                                text: link1.suffix
                            }
                        }
                    };
                    const detectedLink2 = {
                        prefix: link2.prefix ? {
                            index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1,
                            text: link2.prefix
                        } : undefined,
                        path: {
                            index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1 + (link2.prefix ?? '').length,
                            text: link2.link.replace(link2.suffix, '').replace(link2.prefix ?? '', '')
                        },
                        suffix: {
                            row: link2.hasRow ? testRow : undefined,
                            col: link2.hasCol ? testCol : undefined,
                            rowEnd: link2.hasRowEnd ? testRowEnd : undefined,
                            colEnd: link2.hasColEnd ? testColEnd : undefined,
                            suffix: {
                                index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1 + (link2.link.length - link2.suffix.length),
                                text: link2.suffix
                            }
                        }
                    };
                    const detectedLink3 = {
                        prefix: link3.prefix ? {
                            index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1,
                            text: link3.prefix
                        } : undefined,
                        path: {
                            index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1 + (link3.prefix ?? '').length,
                            text: link3.link.replace(link3.suffix, '').replace(link3.prefix ?? '', '')
                        },
                        suffix: {
                            row: link3.hasRow ? testRow : undefined,
                            col: link3.hasCol ? testCol : undefined,
                            rowEnd: link3.hasRowEnd ? testRowEnd : undefined,
                            colEnd: link3.hasColEnd ? testColEnd : undefined,
                            suffix: {
                                index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1 + (link3.link.length - link3.suffix.length),
                                text: link3.suffix
                            }
                        }
                    };
                    deepStrictEqual(detectLinks(line, 3 /* OperatingSystem.Linux */), [detectedLink1, detectedLink2, detectedLink3]);
                });
            }
        });
        suite('should ignore links with suffixes when the path itself is the empty string', () => {
            deepStrictEqual(detectLinks('""",1', 3 /* OperatingSystem.Linux */), []);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rUGFyc2luZy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbExpbmtQYXJzaW5nLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBRTFELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsYUFBYSxFQUFlLHFCQUFxQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFhNUosTUFBTSxnQkFBZ0IsR0FBbUM7Ozs7Q0FJeEQsQ0FBQztBQUNGLE1BQU0sVUFBVSxHQUFnRDtJQUMvRCwrQkFBdUIsRUFBRSxrQkFBa0I7SUFDM0MsbUNBQTJCLEVBQUUsc0JBQXNCO0lBQ25ELGlDQUF5QixFQUFFLHlCQUF5QjtDQUNwRCxDQUFDO0FBQ0YsTUFBTSxPQUFPLEdBQWdEO0lBQzVELCtCQUF1QixFQUFFLFNBQVM7SUFDbEMsbUNBQTJCLEVBQUUsU0FBUztJQUN0QyxpQ0FBeUIsRUFBRSxXQUFXO0NBQ3RDLENBQUM7QUFFRixNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUM7QUFDcEIsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQ25CLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQztBQUN2QixNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUM7QUFDdkIsTUFBTSxTQUFTLEdBQWdCO0lBQzlCLFNBQVM7SUFDVCxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtJQUNuRixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtJQUNuRixFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTtJQUN4RixFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTtJQUNuSSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTtJQUN4RixFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTtJQUNuSSxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO0lBQzFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0lBQ25GLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQ3hGLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO0lBQ25JLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQ3hGLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO0lBQ25JLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUU7SUFDMUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7SUFDbkYsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7SUFDeEYsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUU7SUFDbkksRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7SUFDeEYsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUU7SUFDbkksRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTtJQUMxSSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtJQUVyRixnQkFBZ0I7SUFDaEIsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7SUFDaEYsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLE1BQU0s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LE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0lBQ3JGLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzFGLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzVGLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0lBQ3ZGLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzVGLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzlGLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0lBQ3pGLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzlGLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7SUFDaEcsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7SUFDMUYsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7SUFFNUYsa0JBQWtCO0lBQ2xCLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0lBQ3JGLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzFGLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzVGLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0lBQ3ZGLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0lBQzVGLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFB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