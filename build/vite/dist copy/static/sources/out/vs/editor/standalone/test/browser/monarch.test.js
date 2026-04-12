/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Token, TokenizationRegistry } from '../../../common/languages.js';
import { LanguageService } from '../../../common/services/languageService.js';
import { StandaloneConfigurationService } from '../../browser/standaloneServices.js';
import { compile } from '../../common/monarch/monarchCompile.js';
import { MonarchTokenizer } from '../../common/monarch/monarchLexer.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
suite('Monarch', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMonarchTokenizer(languageService, languageId, language, configurationService) {
        return new MonarchTokenizer(languageService, null, languageId, compile(languageId, language), configurationService);
    }
    function getTokens(tokenizer, lines) {
        const actualTokens = [];
        let state = tokenizer.getInitialState();
        for (const line of lines) {
            const result = tokenizer.tokenize(line, true, state);
            actualTokens.push(result.tokens);
            state = result.endState;
        }
        return actualTokens;
    }
    test('Ensure @rematch and nextEmbedded can be used together in Monarch grammar', () => {
        const disposables = new DisposableStore();
        const languageService = disposables.add(new LanguageService());
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        disposables.add(languageService.registerLanguage({ id: 'sql' }));
        disposables.add(TokenizationRegistry.register('sql', disposables.add(createMonarchTokenizer(languageService, 'sql', {
            tokenizer: {
                root: [
                    [/./, 'token']
                ]
            }
        }, configurationService))));
        const SQL_QUERY_START = '(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|ALTER|WITH)';
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test1', {
            tokenizer: {
                root: [
                    [`(\"\"\")${SQL_QUERY_START}`, [{ 'token': 'string.quote', }, { token: '@rematch', next: '@endStringWithSQL', nextEmbedded: 'sql', },]],
                    [/(""")$/, [{ token: 'string.quote', next: '@maybeStringIsSQL', },]],
                ],
                maybeStringIsSQL: [
                    [/(.*)/, {
                            cases: {
                                [`${SQL_QUERY_START}\\b.*`]: { token: '@rematch', next: '@endStringWithSQL', nextEmbedded: 'sql', },
                                '@default': { token: '@rematch', switchTo: '@endDblDocString', },
                            }
                        }],
                ],
                endDblDocString: [
                    ['[^\']+', 'string'],
                    ['\\\\\'', 'string'],
                    ['\'\'\'', 'string', '@popall'],
                    ['\'', 'string']
                ],
                endStringWithSQL: [[/"""/, { token: 'string.quote', next: '@popall', nextEmbedded: '@pop', },]],
            }
        }, configurationService));
        const lines = [
            `mysql_query("""SELECT * FROM table_name WHERE ds = '<DATEID>'""")`,
            `mysql_query("""`,
            `SELECT *`,
            `FROM table_name`,
            `WHERE ds = '<DATEID>'`,
            `""")`,
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [
                new Token(0, 'source.test1', 'test1'),
                new Token(12, 'string.quote.test1', 'test1'),
                new Token(15, 'token.sql', 'sql'),
                new Token(61, 'string.quote.test1', 'test1'),
                new Token(64, 'source.test1', 'test1')
            ],
            [
                new Token(0, 'source.test1', 'test1'),
                new Token(12, 'string.quote.test1', 'test1')
            ],
            [
                new Token(0, 'token.sql', 'sql')
            ],
            [
                new Token(0, 'token.sql', 'sql')
            ],
            [
                new Token(0, 'token.sql', 'sql')
            ],
            [
                new Token(0, 'string.quote.test1', 'test1'),
                new Token(3, 'source.test1', 'test1')
            ]
        ]);
        disposables.dispose();
    });
    test('Test nextEmbedded: "@pop" in cases statement', () => {
        const disposables = new DisposableStore();
        const languageService = disposables.add(new LanguageService());
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        disposables.add(languageService.registerLanguage({ id: 'sql' }));
        disposables.add(TokenizationRegistry.register('sql', disposables.add(createMonarchTokenizer(languageService, 'sql', {
            tokenizer: {
                root: [
                    [/./, 'token']
                ]
            }
        }, configurationService))));
        const SQL_QUERY_START = '(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|ALTER|WITH)';
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test1', {
            tokenizer: {
                root: [
                    [`(\"\"\")${SQL_QUERY_START}`, [{ 'token': 'string.quote', }, { token: '@rematch', next: '@endStringWithSQL', nextEmbedded: 'sql', },]],
                    [/(""")$/, [{ token: 'string.quote', next: '@maybeStringIsSQL', },]],
                ],
                maybeStringIsSQL: [
                    [/(.*)/, {
                            cases: {
                                [`${SQL_QUERY_START}\\b.*`]: { token: '@rematch', next: '@endStringWithSQL', nextEmbedded: 'sql', },
                                '@default': { token: '@rematch', switchTo: '@endDblDocString', },
                            }
                        }],
                ],
                endDblDocString: [
                    ['[^\']+', 'string'],
                    ['\\\\\'', 'string'],
                    ['\'\'\'', 'string', '@popall'],
                    ['\'', 'string']
                ],
                endStringWithSQL: [[/"""/, {
                            cases: {
                                '"""': {
                                    cases: {
                                        '': { token: 'string.quote', next: '@popall', nextEmbedded: '@pop', }
                                    }
                                },
                                '@default': ''
                            }
                        }]],
            }
        }, configurationService));
        const lines = [
            `mysql_query("""SELECT * FROM table_name WHERE ds = '<DATEID>'""")`,
            `mysql_query("""`,
            `SELECT *`,
            `FROM table_name`,
            `WHERE ds = '<DATEID>'`,
            `""")`,
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [
                new Token(0, 'source.test1', 'test1'),
                new Token(12, 'string.quote.test1', 'test1'),
                new Token(15, 'token.sql', 'sql'),
                new Token(61, 'string.quote.test1', 'test1'),
                new Token(64, 'source.test1', 'test1')
            ],
            [
                new Token(0, 'source.test1', 'test1'),
                new Token(12, 'string.quote.test1', 'test1')
            ],
            [
                new Token(0, 'token.sql', 'sql')
            ],
            [
                new Token(0, 'token.sql', 'sql')
            ],
            [
                new Token(0, 'token.sql', 'sql')
            ],
            [
                new Token(0, 'string.quote.test1', 'test1'),
                new Token(3, 'source.test1', 'test1')
            ]
        ]);
        disposables.dispose();
    });
    test('microsoft/monaco-editor#1235: Empty Line Handling', () => {
        const disposables = new DisposableStore();
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const languageService = disposables.add(new LanguageService());
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test', {
            tokenizer: {
                root: [
                    { include: '@comments' },
                ],
                comments: [
                    [/\/\/$/, 'comment'], // empty single-line comment
                    [/\/\//, 'comment', '@comment_cpp'],
                ],
                comment_cpp: [
                    [/(?:[^\\]|(?:\\.))+$/, 'comment', '@pop'],
                    [/.+$/, 'comment'],
                    [/$/, 'comment', '@pop']
                    // No possible rule to detect an empty line and @pop?
                ],
            },
        }, configurationService));
        const lines = [
            `// This comment \\`,
            `   continues on the following line`,
            ``,
            `// This comment does NOT continue \\\\`,
            `   because the escape char was itself escaped`,
            ``,
            `// This comment DOES continue because \\\\\\`,
            `   the 1st '\\' escapes the 2nd; the 3rd escapes EOL`,
            ``,
            `// This comment continues to the following line \\`,
            ``,
            `But the line was empty. This line should not be commented.`,
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [new Token(0, 'comment.test', 'test')],
            [new Token(0, 'comment.test', 'test')],
            [],
            [new Token(0, 'comment.test', 'test')],
            [new Token(0, 'source.test', 'test')],
            [],
            [new Token(0, 'comment.test', 'test')],
            [new Token(0, 'comment.test', 'test')],
            [],
            [new Token(0, 'comment.test', 'test')],
            [],
            [new Token(0, 'source.test', 'test')]
        ]);
        disposables.dispose();
    });
    test('microsoft/monaco-editor#2265: Exit a state at end of line', () => {
        const disposables = new DisposableStore();
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const languageService = disposables.add(new LanguageService());
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test', {
            includeLF: true,
            tokenizer: {
                root: [
                    [/^\*/, '', '@inner'],
                    [/\:\*/, '', '@inner'],
                    [/[^*:]+/, 'string'],
                    [/[*:]/, 'string']
                ],
                inner: [
                    [/\n/, '', '@pop'],
                    [/\d+/, 'number'],
                    [/[^\d]+/, '']
                ]
            }
        }, configurationService));
        const lines = [
            `PRINT 10 * 20`,
            `*FX200, 3`,
            `PRINT 2*3:*FX200, 3`
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [
                new Token(0, 'string.test', 'test'),
            ],
            [
                new Token(0, '', 'test'),
                new Token(3, 'number.test', 'test'),
                new Token(6, '', 'test'),
                new Token(8, 'number.test', 'test'),
            ],
            [
                new Token(0, 'string.test', 'test'),
                new Token(9, '', 'test'),
                new Token(13, 'number.test', 'test'),
                new Token(16, '', 'test'),
                new Token(18, 'number.test', 'test'),
            ]
        ]);
        disposables.dispose();
    });
    test('issue #115662: monarchCompile function need an extra option which can control replacement', () => {
        const disposables = new DisposableStore();
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const languageService = disposables.add(new LanguageService());
        const tokenizer1 = disposables.add(createMonarchTokenizer(languageService, 'test', {
            ignoreCase: false,
            uselessReplaceKey1: '@uselessReplaceKey2',
            uselessReplaceKey2: '@uselessReplaceKey3',
            uselessReplaceKey3: '@uselessReplaceKey4',
            uselessReplaceKey4: '@uselessReplaceKey5',
            uselessReplaceKey5: '@ham',
            tokenizer: {
                root: [
                    {
                        regex: /@\w+/.test('@ham')
                            ? new RegExp(`^${'@uselessReplaceKey1'}$`)
                            : new RegExp(`^${'@ham'}$`),
                        action: { token: 'ham' }
                    },
                ],
            },
        }, configurationService));
        const tokenizer2 = disposables.add(createMonarchTokenizer(languageService, 'test', {
            ignoreCase: false,
            tokenizer: {
                root: [
                    {
                        regex: /@@ham/,
                        action: { token: 'ham' }
                    },
                ],
            },
        }, configurationService));
        const lines = [
            `@ham`
        ];
        const actualTokens1 = getTokens(tokenizer1, lines);
        assert.deepStrictEqual(actualTokens1, [
            [
                new Token(0, 'ham.test', 'test'),
            ]
        ]);
        const actualTokens2 = getTokens(tokenizer2, lines);
        assert.deepStrictEqual(actualTokens2, [
            [
                new Token(0, 'ham.test', 'test'),
            ]
        ]);
        disposables.dispose();
    });
    test('microsoft/monaco-editor#2424: Allow to target @@', () => {
        const disposables = new DisposableStore();
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const languageService = disposables.add(new LanguageService());
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test', {
            ignoreCase: false,
            tokenizer: {
                root: [
                    {
                        regex: /@@@@/,
                        action: { token: 'ham' }
                    },
                ],
            },
        }, configurationService));
        const lines = [
            `@@`
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [
                new Token(0, 'ham.test', 'test'),
            ]
        ]);
        disposables.dispose();
    });
    test('microsoft/monaco-editor#3025: Check maxTokenizationLineLength before tokenizing', async () => {
        const disposables = new DisposableStore();
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const languageService = disposables.add(new LanguageService());
        // Set maxTokenizationLineLength to 4 so that "ham" works but "hamham" would fail
        await configurationService.updateValue('editor.maxTokenizationLineLength', 4);
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test', {
            tokenizer: {
                root: [
                    {
                        regex: /ham/,
                        action: { token: 'ham' }
                    },
                ],
            },
        }, configurationService));
        const lines = [
            'ham', // length 3, should be tokenized
            'hamham' // length 6, should NOT be tokenized
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [
                new Token(0, 'ham.test', 'test'),
            ], [
                new Token(0, '', 'test')
            ]
        ]);
        disposables.dispose();
    });
    test('microsoft/monaco-editor#3128: allow state access within rules', () => {
        const disposables = new DisposableStore();
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const languageService = disposables.add(new LanguageService());
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test', {
            ignoreCase: false,
            encoding: /u|u8|U|L/,
            tokenizer: {
                root: [
                    // C++ 11 Raw String
                    [/@encoding?R\"(?:([^ ()\\\t]*))\(/, { token: 'string.raw.begin', next: '@raw.$1' }],
                ],
                raw: [
                    [/.*\)$S2\"/, 'string.raw', '@pop'],
                    [/.*/, 'string.raw']
                ],
            },
        }, configurationService));
        const lines = [
            `int main(){`,
            ``,
            `	auto s = R""""(`,
            `	Hello World`,
            `	)"""";`,
            ``,
            `	std::cout << "hello";`,
            ``,
            `}`,
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [new Token(0, 'source.test', 'test')],
            [],
            [new Token(0, 'source.test', 'test'), new Token(10, 'string.raw.begin.test', 'test')],
            [new Token(0, 'string.raw.test', 'test')],
            [new Token(0, 'string.raw.test', 'test'), new Token(6, 'source.test', 'test')],
            [],
            [new Token(0, 'source.test', 'test')],
            [],
            [new Token(0, 'source.test', 'test')],
        ]);
        disposables.dispose();
    });
    test('microsoft/monaco-editor#4775: Raw-strings in c++ can break monarch', () => {
        const disposables = new DisposableStore();
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const languageService = disposables.add(new LanguageService());
        const tokenizer = disposables.add(createMonarchTokenizer(languageService, 'test', {
            ignoreCase: false,
            encoding: /u|u8|U|L/,
            tokenizer: {
                root: [
                    // C++ 11 Raw String
                    [/@encoding?R\"(?:([^ ()\\\t]*))\(/, { token: 'string.raw.begin', next: '@raw.$1' }],
                ],
                raw: [
                    [/.*\)$S2\"/, 'string.raw', '@pop'],
                    [/.*/, 'string.raw']
                ],
            },
        }, configurationService));
        const lines = [
            `R"[())"`,
        ];
        const actualTokens = getTokens(tokenizer, lines);
        assert.deepStrictEqual(actualTokens, [
            [new Token(0, 'string.raw.begin.test', 'test'), new Token(4, 'string.raw.test', 'test')],
        ]);
        disposables.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uYXJjaC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3N0YW5kYWxvbmUvdGVzdC9icm93c2VyL21vbmFyY2gudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUUzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR3hFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUV4RSxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtJQUVyQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsc0JBQXNCLENBQUMsZUFBaUMsRUFBRSxVQUFrQixFQUFFLFFBQTBCLEVBQUUsb0JBQTJDO1FBQzdKLE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxlQUFlLEVBQUUsSUFBSyxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDdEgsQ0FBQztJQUVELFNBQVMsU0FBUyxDQUFDLFNBQTJCLEVBQUUsS0FBZTtRQUM5RCxNQUFNLFlBQVksR0FBYyxFQUFFLENBQUM7UUFD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