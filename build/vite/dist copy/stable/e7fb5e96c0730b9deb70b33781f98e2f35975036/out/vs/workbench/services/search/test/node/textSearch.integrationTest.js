/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { flakySuite } from '../../../../../base/test/node/testUtils.js';
import { deserializeSearchError, SearchErrorCode } from '../../common/search.js';
import { TextSearchEngineAdapter } from '../../node/textSearchAdapter.js';
const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const EXAMPLES_FIXTURES = path.join(TEST_FIXTURES, 'examples');
const MORE_FIXTURES = path.join(TEST_FIXTURES, 'more');
const TEST_ROOT_FOLDER = { folder: URI.file(TEST_FIXTURES) };
const ROOT_FOLDER_QUERY = [
    TEST_ROOT_FOLDER
];
const MULTIROOT_QUERIES = [
    { folder: URI.file(EXAMPLES_FIXTURES) },
    { folder: URI.file(MORE_FIXTURES) }
];
function doSearchTest(query, expectedResultCount) {
    const engine = new TextSearchEngineAdapter(query);
    let c = 0;
    const results = [];
    return engine.search(new CancellationTokenSource().token, _results => {
        if (_results) {
            c += _results.reduce((acc, cur) => acc + cur.numMatches, 0);
            results.push(..._results);
        }
    }, () => { }).then(() => {
        if (typeof expectedResultCount === 'function') {
            assert(expectedResultCount(c));
        }
        else {
            assert.strictEqual(c, expectedResultCount, `rg ${c} !== ${expectedResultCount}`);
        }
        return results;
    });
}
flakySuite('TextSearch-integration', function () {
    test('Text: GameOfLife', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'GameOfLife' },
        };
        return doSearchTest(config, 4);
    });
    test('Text: GameOfLife (RegExp)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'Game.?fL\\w?fe', isRegExp: true }
        };
        return doSearchTest(config, 4);
    });
    test('Text: GameOfLife (unicode escape sequences)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'G\\u{0061}m\\u0065OfLife', isRegExp: true }
        };
        return doSearchTest(config, 4);
    });
    test('Text: GameOfLife (unicode escape sequences, force PCRE2)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: '(?<!a)G\\u{0061}m\\u0065OfLife', isRegExp: true }
        };
        return doSearchTest(config, 4);
    });
    test('Text: GameOfLife (PCRE2 RegExp)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            usePCRE2: true,
            contentPattern: { pattern: 'Life(?!P)', isRegExp: true }
        };
        return doSearchTest(config, 8);
    });
    test('Text: GameOfLife (RegExp to EOL)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'GameOfLife.*', isRegExp: true }
        };
        return doSearchTest(config, 4);
    });
    test('Text: GameOfLife (Word Match, Case Sensitive)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'GameOfLife', isWordMatch: true, isCaseSensitive: true }
        };
        return doSearchTest(config, 4);
    });
    test('Text: GameOfLife (Word Match, Spaces)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: ' GameOfLife ', isWordMatch: true }
        };
        return doSearchTest(config, 1);
    });
    test('Text: GameOfLife (Word Match, Punctuation and Spaces)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: ', as =', isWordMatch: true }
        };
        return doSearchTest(config, 1);
    });
    test('Text: Helvetica (UTF 16)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'Helvetica' }
        };
        return doSearchTest(config, 3);
    });
    test('Text: e', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'e' }
        };
        return doSearchTest(config, 785);
    });
    test('Text: e (with excludes)', () => {
        const config = {
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'e' },
            excludePattern: { '**/examples': true }
        };
        return doSearchTest(config, 391);
    });
    test('Text: e (with includes)', () => {
        const config = {
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'e' },
            includePattern: { '**/examples/**': true }
        };
        return doSearchTest(config, 394);
    });
    // TODO
    // test('Text: e (with absolute path excludes)', () => {
    // 	const config: any = {
    // 		folderQueries: ROOT_FOLDER_QUERY,
    // 		contentPattern: { pattern: 'e' },
    // 		excludePattern: makeExpression(path.join(TEST_FIXTURES, '**/examples'))
    // 	};
    // 	return doSearchTest(config, 394);
    // });
    // test('Text: e (with mixed absolute/relative path excludes)', () => {
    // 	const config: any = {
    // 		folderQueries: ROOT_FOLDER_QUERY,
    // 		contentPattern: { pattern: 'e' },
    // 		excludePattern: makeExpression(path.join(TEST_FIXTURES, '**/examples'), '*.css')
    // 	};
    // 	return doSearchTest(config, 310);
    // });
    test('Text: sibling exclude', () => {
        const config = {
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'm' },
            includePattern: makeExpression('**/site*'),
            excludePattern: { '*.css': { when: '$(basename).less' } }
        };
        return doSearchTest(config, 1);
    });
    test('Text: e (with includes and exclude)', () => {
        const config = {
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'e' },
            includePattern: { '**/examples/**': true },
            excludePattern: { '**/examples/small.js': true }
        };
        return doSearchTest(config, 371);
    });
    test('Text: a (capped)', () => {
        const maxResults = 520;
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'a' },
            maxResults
        };
        return doSearchTest(config, maxResults);
    });
    test('Text: a (no results)', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'ahsogehtdas' }
        };
        return doSearchTest(config, 0);
    });
    test('Text: -size', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: '-size' }
        };
        return doSearchTest(config, 9);
    });
    test('Multiroot: Conway', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: MULTIROOT_QUERIES,
            contentPattern: { pattern: 'conway' }
        };
        return doSearchTest(config, 8);
    });
    test('Multiroot: e with partial global exclude', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: MULTIROOT_QUERIES,
            contentPattern: { pattern: 'e' },
            excludePattern: makeExpression('**/*.txt')
        };
        return doSearchTest(config, 394);
    });
    test('Multiroot: e with global excludes', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: MULTIROOT_QUERIES,
            contentPattern: { pattern: 'e' },
            excludePattern: makeExpression('**/*.txt', '**/*.js')
        };
        return doSearchTest(config, 0);
    });
    test('Multiroot: e with folder exclude', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: [
                {
                    folder: URI.file(EXAMPLES_FIXTURES), excludePattern: [{
                            pattern: makeExpression('**/e*.js')
                        }]
                },
                { folder: URI.file(MORE_FIXTURES) }
            ],
            contentPattern: { pattern: 'e' }
        };
        return doSearchTest(config, 298);
    });
    test('Text: 语', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: '语' }
        };
        return doSearchTest(config, 1).then(results => {
            const matchRange = results[0].results[0].rangeLocations.map(e => e.source);
            assert.deepStrictEqual(matchRange, [{
                    startLineNumber: 0,
                    startColumn: 1,
                    endLineNumber: 0,
                    endColumn: 2
                }]);
        });
    });
    test('Multiple matches on line: h\\d,', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'h\\d,', isRegExp: true }
        };
        return doSearchTest(config, 15).then(results => {
            assert.strictEqual(results.length, 3);
            assert.strictEqual(results[0].results.length, 1);
            const match = results[0].results[0];
            assert.strictEqual(match.rangeLocations.map(e => e.source).length, 5);
        });
    });
    test('Search with context matches', () => {
        const config = {
            type: 2 /* QueryType.Text */,
            folderQueries: ROOT_FOLDER_QUERY,
            contentPattern: { pattern: 'compiler.typeCheck();' },
            surroundingContext: 1,
        };
        return doSearchTest(config, 3).then(results => {
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].results.length, 3);
            assert.strictEqual(results[0].results[0].lineNumber, 24);
            assert.strictEqual(results[0].results[0].text, '        compiler.addUnit(prog,"input.ts");');
            assert.strictEqual(results[0].results[2].lineNumber, 26);
            assert.strictEqual(results[0].results[2].text, '        compiler.emit();');
        });
    });
    suite('error messages', () => {
        test('invalid encoding', () => {
            const config = {
                type: 2 /* QueryType.Text */,
                folderQueries: [
                    {
                        ...TEST_ROOT_FOLDER,
                        fileEncoding: 'invalidEncoding'
                    }
                ],
                contentPattern: { pattern: 'test' },
            };
            return doSearchTest(config, 0).then(() => {
                throw new Error('expected fail');
            }, err => {
                const searchError = deserializeSearchError(err);
                assert.strictEqual(searchError.message, 'Unknown encoding: invalidEncoding');
                assert.strictEqual(searchError.code, SearchErrorCode.unknownEncoding);
            });
        });
        test('invalid regex case 1', () => {
            const config = {
                type: 2 /* QueryType.Text */,
                folderQueries: ROOT_FOLDER_QUERY,
                contentPattern: { pattern: ')', isRegExp: true },
            };
            return doSearchTest(config, 0).then(() => {
                throw new Error('expected fail');
            }, err => {
                const searchError = deserializeSearchError(err);
                const regexParseErrorForUnclosedParenthesis = 'Regex parse error: unmatched closing parenthesis';
                assert.strictEqual(searchError.message, regexParseErrorForUnclosedParenthesis);
                assert.strictEqual(searchError.code, SearchErrorCode.regexParseError);
            });
        });
        test('invalid regex case 2', () => {
            const config = {
                type: 2 /* QueryType.Text */,
                folderQueries: ROOT_FOLDER_QUERY,
                contentPattern: { pattern: '(?<!a.*)', isRegExp: true },
            };
            return doSearchTest(config, 0).then(() => {
                throw new Error('expected fail');
            }, err => {
                const searchError = deserializeSearchError(err);
                const regexParseErrorForLookAround = 'Regex parse error: length of lookbehind assertion is not limited';
                assert.strictEqual(searchError.message, regexParseErrorForLookAround);
                assert.strictEqual(searchError.code, SearchErrorCode.regexParseError);
            });
        });
    });
});
function makeExpression(...patterns) {
    return patterns.reduce((glob, pattern) => {
        // glob.ts needs forward slashes
        pattern = pattern.replace(/\\/g, '/');
        glob[pattern] = true;
        return glob;
    }, Object.create(null));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFNlYXJjaC5pbnRlZ3JhdGlvblRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS90ZXh0U2VhcmNoLmludGVncmF0aW9uVGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFckYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25FLE9BQU8sS0FBSyxJQUFJLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsc0JBQXNCLEVBQWlILGVBQWUsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2hNLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTFFLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3JILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDL0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDdkQsTUFBTSxnQkFBZ0IsR0FBaUIsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO0FBQzNFLE1BQU0saUJBQWlCLEdBQW1C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