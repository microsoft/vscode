/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Token, TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { StandaloneConfigurationService } from 'vs/editor/standalone/browser/standaloneServices';
import { compile } from 'vs/editor/standalone/common/monarch/monarchCompile';
import { MonarchTokenizer } from 'vs/editor/standalone/common/monarch/monarchLexer';
import { IMonarchLanguage } from 'vs/editor/standalone/common/monarch/monarchTypes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { NullLogService } from 'vs/platform/log/common/log';

suite('Monarch', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMonarchTokenizer(languageService: ILanguageService, languageId: string, language: IMonarchLanguage, configurationService: IConfigurationService): MonarchTokenizer {
		return new MonarchTokenizer(languageService, null!, languageId, compile(languageId, language), configurationService);
	}

	function getTokens(tokenizer: MonarchTokenizer, lines: string[]): Token[][] {
		const actualTokens: Token[][] = [];
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
			uselessReplaceKey5: '@ham' || '',
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

});
