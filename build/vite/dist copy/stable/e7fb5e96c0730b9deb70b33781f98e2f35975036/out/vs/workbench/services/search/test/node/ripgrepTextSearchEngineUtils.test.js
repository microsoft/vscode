/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { fixRegexNewline, RipgrepParser, unicodeEscapesToPCRE2, fixNewline, getRgArgs, performBraceExpansionForRipgrep } from '../../node/ripgrepTextSearchEngine.js';
import { Range, TextSearchMatch2 } from '../../common/searchExtTypes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS } from '../../common/search.js';
suite('RipgrepTextSearchEngine', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('unicodeEscapesToPCRE2', async () => {
        assert.strictEqual(unicodeEscapesToPCRE2('\\u1234'), '\\x{1234}');
        assert.strictEqual(unicodeEscapesToPCRE2('\\u1234\\u0001'), '\\x{1234}\\x{0001}');
        assert.strictEqual(unicodeEscapesToPCRE2('foo\\u1234bar'), 'foo\\x{1234}bar');
        assert.strictEqual(unicodeEscapesToPCRE2('\\\\\\u1234'), '\\\\\\x{1234}');
        assert.strictEqual(unicodeEscapesToPCRE2('foo\\\\\\u1234'), 'foo\\\\\\x{1234}');
        assert.strictEqual(unicodeEscapesToPCRE2('\\u{1234}'), '\\x{1234}');
        assert.strictEqual(unicodeEscapesToPCRE2('\\u{1234}\\u{0001}'), '\\x{1234}\\x{0001}');
        assert.strictEqual(unicodeEscapesToPCRE2('foo\\u{1234}bar'), 'foo\\x{1234}bar');
        assert.strictEqual(unicodeEscapesToPCRE2('[\\u00A0-\\u00FF]'), '[\\x{00A0}-\\x{00FF}]');
        assert.strictEqual(unicodeEscapesToPCRE2('foo\\u{123456}7bar'), 'foo\\u{123456}7bar');
        assert.strictEqual(unicodeEscapesToPCRE2('\\u123'), '\\u123');
        assert.strictEqual(unicodeEscapesToPCRE2('foo'), 'foo');
        assert.strictEqual(unicodeEscapesToPCRE2(''), '');
    });
    test('fixRegexNewline - src', () => {
        const ttable = [
            ['foo', 'foo'],
            ['invalid(', 'invalid('],
            ['fo\\no', 'fo\\r?\\no'],
            ['f\\no\\no', 'f\\r?\\no\\r?\\no'],
            ['f[a-z\\n1]', 'f(?:[a-z1]|\\r?\\n)'],
            ['f[\\n-a]', 'f[\\n-a]'],
            ['(?<=\\n)\\w', '(?<=\\n)\\w'],
            ['fo\\n+o', 'fo(?:\\r?\\n)+o'],
            ['fo[^\\n]o', 'fo(?!\\r?\\n)o'],
            ['fo[^\\na-z]o', 'fo(?!\\r?\\n|[a-z])o'],
            ['foo[^\\n]+o', 'foo.+o'],
            ['foo[^\\nzq]+o', 'foo[^zq]+o'],
            ['foo[^\\nzq]+o', 'foo[^zq]+o'],
            // preserves quantifies, #137899
            ['fo[^\\S\\n]*o', 'fo[^\\S]*o'],
            ['fo[^\\S\\n]{3,}o', 'fo[^\\S]{3,}o'],
        ];
        for (const [input, expected] of ttable) {
            assert.strictEqual(fixRegexNewline(input), expected, `${input} -> ${expected}`);
        }
    });
    test('fixRegexNewline - re', () => {
        function testFixRegexNewline([inputReg, testStr, shouldMatch]) {
            const fixed = fixRegexNewline(inputReg);
            const reg = new RegExp(fixed);
            assert.strictEqual(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
        }
        [
            ['foo', 'foo', true],
            ['foo\\n', 'foo\r\n', true],
            ['foo\\n\\n', 'foo\n\n', true],
            ['foo\\n\\n', 'foo\r\n\r\n', true],
            ['foo\\n', 'foo\n', true],
            ['foo\\nabc', 'foo\r\nabc', true],
            ['foo\\nabc', 'foo\nabc', true],
            ['foo\\r\\n', 'foo\r\n', true],
            ['foo\\n+abc', 'foo\r\nabc', true],
            ['foo\\n+abc', 'foo\n\n\nabc', true],
            ['foo\\n+abc', 'foo\r\n\r\n\r\nabc', true],
            ['foo[\\n-9]+abc', 'foo1abc', true],
        ].forEach(testFixRegexNewline);
    });
    test('fixNewline - matching', () => {
        function testFixNewline([inputReg, testStr, shouldMatch = true]) {
            const fixed = fixNewline(inputReg);
            const reg = new RegExp(fixed);
            assert.strictEqual(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
        }
        [
            ['foo', 'foo'],
            ['foo\n', 'foo\r\n'],
            ['foo\n', 'foo\n'],
            ['foo\nabc', 'foo\r\nabc'],
            ['foo\nabc', 'foo\nabc'],
            ['foo\r\n', 'foo\r\n'],
            ['foo\nbarc', 'foobar', false],
            ['foobar', 'foo\nbar', false],
        ].forEach(testFixNewline);
    });
    suite('RipgrepParser', () => {
        const TEST_FOLDER = URI.file('/foo/bar');
        function testParser(inputData, expectedResults) {
            const testParser = new RipgrepParser(1000, TEST_FOLDER, DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS);
            const actualResults = [];
            testParser.on('result', r => {
                actualResults.push(r);
            });
            inputData.forEach(d => testParser.handleData(d));
            testParser.flush();
            assert.deepStrictEqual(actualResults, expectedResults);
        }
        function makeRgMatch(relativePath, text, lineNumber, matchRanges) {
            return JSON.stringify({
                type: 'match',
                data: {
                    path: {
                        text: relativePath
                    },
                    lines: {
                        text
                    },
                    line_number: lineNumber,
                    absolute_offset: 0, // unused
                    submatches: matchRanges.map(mr => {
                        return {
                            ...mr,
                            match: { text: text.substring(mr.start, mr.end) }
                        };
                    })
                }
            }) + '\n';
        }
        test('single result', () => {
            testParser([
                makeRgMatch('file1.js', 'foobar', 4, [{ start: 3, end: 6 }])
            ], [
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'file1.js'), [{
                        previewRange: new Range(0, 3, 0, 6),
                        sourceRange: new Range(3, 3, 3, 6),
                    }], 'foobar')
            ]);
        });
        test('multiple results', () => {
            testParser([
                makeRgMatch('file1.js', 'foobar', 4, [{ start: 3, end: 6 }]),
                makeRgMatch('app/file2.js', 'foobar', 4, [{ start: 3, end: 6 }]),
                makeRgMatch('app2/file3.js', 'foobar', 4, [{ start: 3, end: 6 }]),
            ], [
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'file1.js'), [{
                        previewRange: new Range(0, 3, 0, 6),
                        sourceRange: new Range(3, 3, 3, 6),
                    }], 'foobar'),
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'app/file2.js'), [{
                        previewRange: new Range(0, 3, 0, 6),
                        sourceRange: new Range(3, 3, 3, 6),
                    }], 'foobar'),
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'app2/file3.js'), [{
                        previewRange: new Range(0, 3, 0, 6),
                        sourceRange: new Range(3, 3, 3, 6),
                    }], 'foobar')
            ]);
        });
        test('chopped-up input chunks', () => {
            const dataStrs = [
                makeRgMatch('file1.js', 'foo bar', 4, [{ start: 3, end: 7 }]),
                makeRgMatch('app/file2.js', 'foobar', 4, [{ start: 3, end: 6 }]),
                makeRgMatch('app2/file3.js', 'foobar', 4, [{ start: 3, end: 6 }]),
            ];
            const dataStr0Space = dataStrs[0].indexOf(' ');
            testParser([
                dataStrs[0].substring(0, dataStr0Space + 1),
                dataStrs[0].substring(dataStr0Space + 1),
                '\n',
                dataStrs[1].trim(),
                '\n' + dataStrs[2].substring(0, 25),
                dataStrs[2].substring(25)
            ], [
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'file1.js'), [{
                        previewRange: new Range(0, 3, 0, 7),
                        sourceRange: new Range(3, 3, 3, 7),
                    }], 'foo bar'),
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'app/file2.js'), [{
                        previewRange: new Range(0, 3, 0, 6),
                        sourceRange: new Range(3, 3, 3, 6),
                    }], 'foobar'),
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'app2/file3.js'), [{
                        previewRange: new Range(0, 3, 0, 6),
                        sourceRange: new Range(3, 3, 3, 6),
                    }], 'foobar')
            ]);
        });
        test('empty result (#100569)', () => {
            testParser([
                makeRgMatch('file1.js', 'foobar', 4, []),
                makeRgMatch('file1.js', '', 5, []),
            ], [
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'file1.js'), [
                    {
                        previewRange: new Range(0, 0, 0, 1),
                        sourceRange: new Range(3, 0, 3, 1),
                    }
                ], 'foobar'),
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'file1.js'), [
                    {
                        previewRange: new Range(0, 0, 0, 0),
                        sourceRange: new Range(4, 0, 4, 0),
                    }
                ], '')
            ]);
        });
        test('multiple submatches without newline in between (#131507)', () => {
            testParser([
                makeRgMatch('file1.js', 'foobarbazquux', 4, [{ start: 0, end: 4 }, { start: 6, end: 10 }]),
            ], [
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'file1.js'), [
                    {
                        previewRange: new Range(0, 0, 0, 4),
                        sourceRange: new Range(3, 0, 3, 4),
                    },
                    {
                        previewRange: new Range(0, 6, 0, 10),
                        sourceRange: new Range(3, 6, 3, 10),
                    }
                ], 'foobarbazquux')
            ]);
        });
        test('multiple submatches with newline in between (#131507)', () => {
            testParser([
                makeRgMatch('file1.js', 'foo\nbar\nbaz\nquux', 4, [{ start: 0, end: 5 }, { start: 8, end: 13 }]),
            ], [
                new TextSearchMatch2(joinPath(TEST_FOLDER, 'file1.js'), [
                    {
                        previewRange: new Range(0, 0, 1, 1),
                        sourceRange: new Range(3, 0, 4, 1),
                    },
                    {
                        previewRange: new Range(2, 0, 3, 1),
                        sourceRange: new Range(5, 0, 6, 1),
                    }
                ], 'foo\nbar\nbaz\nquux')
            ]);
        });
    });
    suite('getRgArgs', () => {
        test('simple includes', () => {
            // Only testing the args that come from includes.
            function testGetRgArgs(includes, expectedFromIncludes) {
                const query = {
                    pattern: 'test'
                };
                const options = {
                    folderOptions: {
                        includes: includes,
                        excludes: [],
                        useIgnoreFiles: {
                            local: false,
                            global: false,
                            parent: false
                        },
                        followSymlinks: false,
                        folder: URI.file('/some/folder'),
                        encoding: 'utf8',
                    },
                    maxResults: 1000,
                };
                const expected = [
                    '--hidden',
                    '--no-require-git',
                    '--ignore-case',
                    ...expectedFromIncludes,
                    '--no-ignore',
                    '--crlf',
                    '--fixed-strings',
                    '--no-config',
                    '--no-ignore-global',
                    '--json',
                    '--',
                    'test',
                    '.'
                ];
                const result = getRgArgs(query, options);
                assert.deepStrictEqual(result, expected);
            }
            ([
                [['a/*', 'b/*'], ['-g', '!*', '-g', '/a', '-g', '/a/*', '-g', '/b', '-g', '/b/*']],
                [['**/a/*', 'b/*'], ['-g', '!*', '-g', '/b', '-g', '/b/*', '-g', '**/a/*']],
                [['**/a/*', '**/b/*'], ['-g', '**/a/*', '-g', '**/b/*']],
                [['foo/*bar/something/**'], ['-g', '!*', '-g', '/foo', '-g', '/foo/*bar', '-g', '/foo/*bar/something', '-g', '/foo/*bar/something/**']],
            ].forEach(([includes, expectedFromIncludes]) => testGetRgArgs(includes, expectedFromIncludes)));
        });
    });
    test('brace expansion for ripgrep', () => {
        function testBraceExpansion(argGlob, expectedGlob) {
            const result = performBraceExpansionForRipgrep(argGlob);
            assert.deepStrictEqual(result, expectedGlob);
        }
        [
            ['eep/{a,b}/test', ['eep/a/test', 'eep/b/test']],
            ['eep/{a,b}/{c,d,e}', ['eep/a/c', 'eep/a/d', 'eep/a/e', 'eep/b/c', 'eep/b/d', 'eep/b/e']],
            ['eep/{a,b}/\\{c,d,e}', ['eep/a/{c,d,e}', 'eep/b/{c,d,e}']],
            ['eep/{a,b\\}/test', ['eep/{a,b}/test']],
            ['eep/{a,b\\\\}/test', ['eep/a/test', 'eep/b\\\\/test']],
            ['eep/{a,b\\\\\\}/test', ['eep/{a,b\\\\}/test']],
            ['e\\{ep/{a,b}/test', ['e{ep/a/test', 'e{ep/b/test']],
            ['eep/{a,\\b}/test', ['eep/a/test', 'eep/\\b/test']],
            ['{a/*.*,b/*.*}', ['a/*.*', 'b/*.*']],
            ['{{}', ['{{}']],
            ['aa{{}', ['aa{{}']],
            ['{b{}', ['{b{}']],
            ['{{}c', ['{{}c']],
            ['{{}}', ['{{}}']],
            ['\\{{}}', ['{}']],
            ['{}foo', ['foo']],
            ['bar{ }foo', ['bar foo']],
            ['{}', ['']],
        ].forEach(([includePattern, expectedPatterns]) => testBraceExpansion(includePattern, expectedPatterns));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmlwZ3JlcFRleHRTZWFyY2hFbmdpbmVVdGlscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC90ZXN0L25vZGUvcmlwZ3JlcFRleHRTZWFyY2hFbmdpbmVVdGlscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQXdCLGFBQWEsRUFBRSxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLCtCQUErQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDNUwsT0FBTyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBdUMsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM5RyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUU3RSxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLHVDQUF1QyxFQUFFLENBQUM7SUFDMUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUMsU0FBUyxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxlQUFlLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUMsYUFBYSxDQUFDLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFaEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixDQUFDLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUNoRixNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLG1CQUFtQixDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztRQUV4RixNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNuRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7UUFDbEMsTUFBTSxNQUFNLEdBQUc7WUFDZCxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUM7WUFDZCxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7WUFDeEIsQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDO1lBQ3hCLENBQUMsV0FBVyxFQUFFLG1CQUFtQixDQUFDO1lBQ2xDLENBQUMsWUFBWSxFQUFFLHFCQUFxQixDQUFDO1lBQ3JDLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQztZQUN4QixDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUM7WUFDOUIsQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUM7WUFDOUIsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLENBQUM7WUFDL0IsQ0FBQyxjQUFjLEVBQUUsc0JBQXNCLENBQUM7WUFDeEMsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDO1lBQ3pCLENBQUMsZUFBZSxFQUFFLFlBQVksQ0FBQztZQUMvQixDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUM7WUFDL0IsZ0NBQWdDO1lBQ2hDLENBQUMsZUFBZSxFQUFFLFlBQVksQ0FBQztZQUMvQixDQUFDLGtCQUFrQixFQUFFLGVBQWUsQ0FBQztTQUNyQyxDQUFDO1FBRUYsS0FBSyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxFQUFFLFFBQVEsRUFBRSxHQUFHLEtBQUssT0FBTyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDakMsU0FBUyxtQkFBbUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFxQztZQUNoRyxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFdBQVcsRUFBRSxHQUFHLFFBQVEsT0FBTyxHQUFHLEtBQUssT0FBTyxLQUFLLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDekcsQ0FBQztRQUVBO1lBQ0EsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQztZQUVwQixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDO1lBQzNCLENBQUMsV0FBVyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUM7WUFDOUIsQ0FBQyxXQUFXLEVBQUUsYUFBYSxFQUFFLElBQUksQ0FBQztZQUNsQyxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDO1lBQ3pCLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUM7WUFDakMsQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQztZQUMvQixDQUFDLFdBQVcsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDO1lBRTlCLENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUM7WUFDbEMsQ0FBQyxZQUFZLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQztZQUNwQyxDQUFDLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxJQUFJLENBQUM7WUFDMUMsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDO1NBQ3pCLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLFNBQVMsY0FBYyxDQUFDLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxXQUFXLEdBQUcsSUFBSSxDQUFzQztZQUNuRyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbkMsTUFBTSxHQUFHLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFdBQVcsRUFBRSxHQUFHLFFBQVEsT0FBTyxHQUFHLEtBQUssT0FBTyxLQUFLLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDekcsQ0FBQztRQUVBO1lBQ0EsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDO1lBRWQsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDO1lBQ3BCLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztZQUNsQixDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUM7WUFDMUIsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDO1lBQ3hCLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQztZQUV0QixDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDO1lBQzlCLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUM7U0FDbkIsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDckMsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUMzQixNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXpDLFNBQVMsVUFBVSxDQUFDLFNBQW1CLEVBQUUsZUFBb0M7WUFDNUUsTUFBTSxVQUFVLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1lBRTdGLE1BQU0sYUFBYSxHQUF3QixFQUFFLENBQUM7WUFDOUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLEVBQUU7Z0JBQzNCLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkIsQ0FBQyxDQUFDLENBQUM7WUFFSCxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pELFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUVuQixNQUFNLENBQUMsZUFBZSxDQUFDLGFBQWEsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsU0FBUyxXQUFXLENBQUMsWUFBb0IsRUFBRSxJQUFZLEVBQUUsVUFBa0IsRUFBRSxXQUE2QztZQUN6SCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQWE7Z0JBQ2pDLElBQUksRUFBRSxPQUFPO2dCQUNiLElBQUksRUFBWTtvQkFDZixJQUFJLEVBQUU7d0JBQ0wsSUFBSSxFQUFFLFlBQVk7cUJBQ2xCO29CQUNELEtBQUssRUFBRTt3QkFDTixJQUFJO3FCQUNKO29CQUNELFdBQVcsRUFBRSxVQUFVO29CQUN2QixlQUFlLEVBQUUsQ0FBQyxFQUFFLFNBQVM7b0JBQzdCLFVBQVUsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFO3dCQUNoQyxPQUFPOzRCQUNOLEdBQUcsRUFBRTs0QkFDTCxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRTt5QkFDakQsQ0FBQztvQkFDSCxDQUFDLENBQUM7aUJBQ0Y7YUFDRCxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQ1gsQ0FBQztRQUVELElBQUksQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1lBQzFCLFVBQVUsQ0FDVDtnQkFDQyxXQUFXLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDNUQsRUFDRDtnQkFDQyxJQUFJLGdCQUFnQixDQUNuQixRQUFRLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUNqQyxDQUFDO3dCQUNBLFlBQVksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ25DLFdBQVcsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7cUJBQ2xDLENBQUMsRUFDRixRQUFRLENBQ1I7YUFDRCxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7WUFDN0IsVUFBVSxDQUNUO2dCQUNDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUQsV0FBVyxDQUFDLGNBQWMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNoRSxXQUFXLENBQUMsZUFBZSxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDakUsRUFDRDtnQkFDQyxJQUFJLGdCQUFnQixDQUNuQixRQUFRLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUNqQyxDQUFDO3dCQUNBLFlBQVksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ25DLFdBQVcsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7cUJBQ2xDLENBQUMsRUFDRixRQUFRLENBQ1I7Z0JBQ0QsSUFBSSxnQkFBZ0IsQ0FDbkIsUUFBUSxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsRUFDckMsQ0FBQzt3QkFDQSxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNuQyxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUNsQyxDQUFDLEVBQ0YsUUFBUSxDQUNSO2dCQUNELElBQUksZ0JBQWdCLENBQ25CLFFBQVEsQ0FBQyxXQUFXLEVBQUUsZUFBZSxDQUFDLEVBQ3RDLENBQUM7d0JBQ0EsWUFBWSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDbkMsV0FBVyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztxQkFDbEMsQ0FBQyxFQUNGLFFBQVEsQ0FDUjthQUNELENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtZQUNwQyxNQUFNLFFBQVEsR0FBRztnQkFDaEIsV0FBVyxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3RCxXQUFXLENBQUMsY0FBYyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hFLFdBQVcsQ0FBQyxlQUFlLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUNqRSxDQUFDO1lBRUYsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMvQyxVQUFVLENBQ1Q7Z0JBQ0MsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsYUFBYSxHQUFHLENBQUMsQ0FBQztnQkFDM0MsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJO2dCQUNKLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUU7Z0JBQ2xCLElBQUksR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ25DLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2FBQ3pCLEVBQ0Q7Z0JBQ0MsSUFBSSxnQkFBZ0IsQ0FDbkIsUUFBUSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsRUFDakMsQ0FBQzt3QkFDQSxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNuQyxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUNsQyxDQUFDLEVBQ0YsU0FBUyxDQUNUO2dCQUNELElBQUksZ0JBQWdCLENBQ25CLFFBQVEsQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLEVBQ3JDLENBQUM7d0JBQ0EsWUFBWSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDbkMsV0FBVyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztxQkFDbEMsQ0FBQyxFQUNGLFFBQVEsQ0FDUjtnQkFDRCxJQUFJLGdCQUFnQixDQUNuQixRQUFRLENBQUMsV0FBVyxFQUFFLGVBQWUsQ0FBQyxFQUN0QyxDQUFDO3dCQUNBLFlBQVksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ25DLFdBQVcsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7cUJBQ2xDLENBQUMsRUFDRixRQUFRLENBQ1I7YUFDRCxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUdILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7WUFDbkMsVUFBVSxDQUNUO2dCQUNDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3hDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7YUFDbEMsRUFDRDtnQkFDQyxJQUFJLGdCQUFnQixDQUNuQixRQUFRLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUNqQztvQkFDQzt3QkFDQyxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNuQyxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUNsQztpQkFDRCxFQUNELFFBQVEsQ0FDUjtnQkFDRCxJQUFJLGdCQUFnQixDQUNuQixRQUFRLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUNqQztvQkFDQzt3QkFDQyxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNuQyxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUNsQztpQkFDRCxFQUNELEVBQUUsQ0FDRjthQUNELENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEdBQUcsRUFBRTtZQUNyRSxVQUFVLENBQ1Q7Z0JBQ0MsV0FBVyxDQUFDLFVBQVUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7YUFDMUYsRUFDRDtnQkFDQyxJQUFJLGdCQUFnQixDQUNuQixRQUFRLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUNqQztvQkFDQzt3QkFDQyxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNuQyxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUNsQztvQkFDRDt3QkFDQyxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO3dCQUNwQyxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO3FCQUNuQztpQkFDRCxFQUNELGVBQWUsQ0FDZjthQUNELENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEdBQUcsRUFBRTtZQUNsRSxVQUFVLENBQ1Q7Z0JBQ0MsV0FBVyxDQUFDLFVBQVUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNoRyxFQUNEO2dCQUNDLElBQUksZ0JBQWdCLENBQ25CLFFBQVEsQ0FBQyxXQUFXLEVBQUUsVUFBVSxDQUFDLEVBQ2pDO29CQUNDO3dCQUNDLFlBQVksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ25DLFdBQVcsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7cUJBQ2xDO29CQUNEO3dCQUNDLFlBQVksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ25DLFdBQVcsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7cUJBQ2xDO2lCQUNELEVBQ0QscUJBQXFCLENBQ3JCO2FBQ0QsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7WUFDNUIsaURBQWlEO1lBQ2pELFNBQVMsYUFBYSxDQUFDLFFBQWtCLEVBQUUsb0JBQThCO2dCQUN4RSxNQUFNLEtBQUssR0FBcUI7b0JBQy9CLE9BQU8sRUFBRSxNQUFNO2lCQUNmLENBQUM7Z0JBRUYsTUFBTSxPQUFPLEdBQTZCO29CQUN6QyxhQUFhLEVBQUU7d0JBQ2QsUUFBUSxFQUFFLFFBQVE7d0JBQ2xCLFFBQVEsRUFBRSxFQUFFO3dCQUNaLGNBQWMsRUFBRTs0QkFDZixLQUFLLEVBQUUsS0FBSzs0QkFDWixNQUFNLEVBQUUsS0FBSzs0QkFDYixNQUFNLEVBQUUsS0FBSzt5QkFDYjt3QkFDRCxjQUFjLEVBQUUsS0FBSzt3QkFDckIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDO3dCQUNoQyxRQUFRLEVBQUUsTUFBTTtxQkFDaEI7b0JBQ0QsVUFBVSxFQUFFLElBQUk7aUJBQ2hCLENBQUM7Z0JBQ0YsTUFBTSxRQUFRLEdBQUc7b0JBQ2hCLFVBQVU7b0JBQ1Ysa0JBQWtCO29CQUNsQixlQUFlO29CQUNmLEdBQUcsb0JBQW9CO29CQUN2QixhQUFhO29CQUNiLFFBQVE7b0JBQ1IsaUJBQWlCO29CQUNqQixhQUFhO29CQUNiLG9CQUFvQjtvQkFDcEIsUUFBUTtvQkFDUixJQUFJO29CQUNKLE1BQU07b0JBQ04sR0FBRztpQkFBQyxDQUFDO2dCQUNOLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzFDLENBQUM7WUFFRCxDQUFDO2dCQUNBLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDbEYsQ0FBQyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDM0UsQ0FBQyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUN4RCxDQUFDLENBQUMsdUJBQXVCLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxxQkFBcUIsRUFBRSxJQUFJLEVBQUUsd0JBQXdCLENBQUMsQ0FBQzthQUN2SSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxDQUFDLGFBQWEsQ0FBVyxRQUFRLEVBQVksb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckgsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7UUFDeEMsU0FBUyxrQkFBa0IsQ0FBQyxPQUFlLEVBQUUsWUFBc0I7WUFDbEUsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUVEO1lBQ0MsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQztZQUNoRCxDQUFDLG1CQUFtQixFQUFFLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RixDQUFDLHFCQUFxQixFQUFFLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQzNELENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3hDLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxZQUFZLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUN4RCxDQUFDLHNCQUFzQixFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUNoRCxDQUFDLG1CQUFtQixFQUFFLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFDcEQsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDckMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoQixDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BCLENBQUMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsQixDQUFDLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2xCLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixDQUFDLFdBQVcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzFCLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDWixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsY0FBYyxFQUFFLGdCQUFnQixDQUFDLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFTLGNBQWMsRUFBWSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7SUFDM0gsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9