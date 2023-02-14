/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Scanner, TokenType } from 'vs/platform/contextkey/common/scanner';

suite('Context Key Scanner', () => {
	function scan(input: string) {
		return [...((new Scanner()).reset(input))];
	}

	suite('scanning a single token', () => {
		function assertTokenTypes(str: string, ...expected: TokenType[]) {
			const tokens = scan(str);
			expected.push(TokenType.EOF);
			assert.deepStrictEqual(tokens.length, expected.length, 'len: ' + str);
			tokens.forEach((token, i) => {
				assert.deepStrictEqual(token.type, expected[i], token.lexeme ? token.lexeme : token.type);
			});
		}

		test('single', () => {
			assertTokenTypes('(', TokenType.LParen);
			assertTokenTypes(')', TokenType.RParen);

			assertTokenTypes('!', TokenType.Neg);

			assertTokenTypes('==', TokenType.Eq);
			assertTokenTypes('!=', TokenType.NotEq);

			assertTokenTypes('<', TokenType.Lt);
			assertTokenTypes('<=', TokenType.LtEq);
			assertTokenTypes('>', TokenType.Gt);
			assertTokenTypes('>=', TokenType.GtEq);

			assertTokenTypes('=~', TokenType.RegexOp);

			assertTokenTypes('=~', TokenType.RegexOp);

			assertTokenTypes('/foo/', TokenType.RegexStr);
			assertTokenTypes('/foo/i', TokenType.RegexStr);
			assertTokenTypes('/foo/gm', TokenType.RegexStr);

			assertTokenTypes('true', TokenType.True);
			assertTokenTypes('false', TokenType.False);

			assertTokenTypes('in', TokenType.In);
			assertTokenTypes('not', TokenType.Not);
			assertTokenTypes('not in', TokenType.Not, TokenType.In);

			assertTokenTypes('&&', TokenType.And);
			assertTokenTypes('||', TokenType.Or);

			assertTokenTypes('a', TokenType.Str);
			assertTokenTypes('a.b', TokenType.Str);
			assertTokenTypes('.b.c', TokenType.Str);
			assertTokenTypes('Foo<C-r>', TokenType.Str);
			assertTokenTypes('foo.bar<C-shift+2>', TokenType.Str);
			assertTokenTypes('foo.bar:zee', TokenType.Str);

			assertTokenTypes('\'hello world\'', TokenType.QuotedStr);

			assertTokenTypes(' ');
			assertTokenTypes('\n');
			assertTokenTypes('  ');
			assertTokenTypes(' \n ');
		});
	});

	suite('scanning various cases of context keys', () => {

		test('foo.bar<C-shift+2>', () => {
			const input = 'foo.bar<C-shift+2>';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo.bar<C-shift+2>", offset: 0 }, { type: "EOF", offset: 18 }]));
		});

		test('!foo', () => {
			const input = '!foo';
			assert.deepStrictEqual(scan(input), ([{ type: "!", offset: 0 }, { type: "Str", lexeme: "foo", offset: 1 }, { type: "EOF", offset: 4 }]));
		});

		test('!(foo && bar)', () => {
			const input = '!(foo && bar)';
			assert.deepStrictEqual(scan(input), ([{ type: "!", offset: 0 }, { type: "(", offset: 1 }, { type: "Str", lexeme: "foo", offset: 2 }, { type: "&&", offset: 6 }, { type: "Str", lexeme: "bar", offset: 9 }, { type: ")", offset: 12 }, { type: "EOF", offset: 13 }]));
		});

		test('=~ ', () => {
			const input = '=~ ';
			assert.deepStrictEqual(scan(input), ([{ type: "=~", offset: 0 }, { type: "EOF", offset: 3 }]));
		});

		test('foo =~ /bar/', () => {
			const input = 'foo =~ /bar/';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo", offset: 0 }, { type: "=~", offset: 4 }, { type: "RegexStr", lexeme: "/bar/", offset: 7 }, { type: "EOF", offset: 12 }]));
		});

		test('foo =~ /zee/i', () => {
			const input = 'foo =~ /zee/i';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo", offset: 0 }, { type: "=~", offset: 4 }, { type: "RegexStr", lexeme: "/zee/i", offset: 7 }, { type: "EOF", offset: 13 }]));
		});


		test('foo =~ /zee/gm', () => {
			const input = 'foo =~ /zee/gm';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo", offset: 0 }, { type: "=~", offset: 4 }, { type: "RegexStr", lexeme: "/zee/gm", offset: 7 }, { type: "EOF", offset: 14 }]));
		});

		test('editorLangId in testely.supportedLangIds && resourceFilename =~ /^.+(.test.(\w+))$/gm', () => {
			const input = 'editorLangId in testely.supportedLangIds && resourceFilename =~ /^.+(.test.(\w+))$/gm';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "editorLangId", offset: 0 }, { type: "in", offset: 13 }, { type: "Str", lexeme: "testely.supportedLangIds", offset: 16 }, { type: "&&", offset: 41 }, { type: "Str", lexeme: "resourceFilename", offset: 44 }, { type: "=~", offset: 61 }, { type: "RegexStr", lexeme: "/^.+(.test.(w+))$/gm", offset: 64 }, { type: "EOF", offset: 84 }]));
		});

		test('!(foo && bar) && baz', () => {
			const input = '!(foo && bar) && baz';
			assert.deepStrictEqual(scan(input), ([{ type: "!", offset: 0 }, { type: "(", offset: 1 }, { type: "Str", lexeme: "foo", offset: 2 }, { type: "&&", offset: 6 }, { type: "Str", lexeme: "bar", offset: 9 }, { type: ")", offset: 12 }, { type: "&&", offset: 14 }, { type: "Str", lexeme: "baz", offset: 17 }, { type: "EOF", offset: 20 }]));
		});

		test('foo.bar:zed==completed - equality with no space', () => {
			const input = 'foo.bar:zed==completed';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo.bar:zed", offset: 0 }, { type: "==", offset: 11 }, { type: "Str", lexeme: "completed", offset: 13 }, { type: "EOF", offset: 22 }]));
		});

		test('a && b || c', () => {
			const input = 'a && b || c';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "a", offset: 0 }, { type: "&&", offset: 2 }, { type: "Str", lexeme: "b", offset: 5 }, { type: "||", offset: 7 }, { type: "Str", lexeme: "c", offset: 10 }, { type: "EOF", offset: 11 }]));
		});

		test('fooBar && baz.jar && fee.bee<K-loo+1>', () => {
			const input = 'fooBar && baz.jar && fee.bee<K-loo+1>';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "fooBar", offset: 0 }, { type: "&&", offset: 7 }, { type: "Str", lexeme: "baz.jar", offset: 10 }, { type: "&&", offset: 18 }, { type: "Str", lexeme: "fee.bee<K-loo+1>", offset: 21 }, { type: "EOF", offset: 37 }]));
		});

		test('foo.barBaz<C-r> < 2', () => {
			const input = 'foo.barBaz<C-r> < 2';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo.barBaz<C-r>", offset: 0 }, { type: "<", offset: 16 }, { type: "Str", lexeme: "2", offset: 18 }, { type: "EOF", offset: 19 }]));
		});

		test('foo.bar >= -1', () => {
			const input = 'foo.bar >= -1';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo.bar", offset: 0 }, { type: ">=", offset: 8 }, { type: "Str", lexeme: "-1", offset: 11 }, { type: "EOF", offset: 13 }]));
		});

		test('foo.bar <= -1', () => {
			const input = 'foo.bar <= -1';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo.bar", offset: 0 }, { type: "<=", offset: 8 }, { type: "Str", lexeme: "-1", offset: 11 }, { type: "EOF", offset: 13 }]));
		});

		test(`resource =~ /\\/Objects\\/.+\\.xml$/`, () => {
			const input = `resource =~ /\\/Objects\\/.+\\.xml$/`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "resource", offset: 0 }, { type: "=~", offset: 9 }, { type: "RegexStr", lexeme: "/\\/Objects\\/.+\\.xml$/", offset: 12 }, { type: "EOF", offset: 33 }]));
		});

		test('view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded', () => {
			const input = `view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "view", offset: 0 }, { type: "==", offset: 5 }, { type: "Str", lexeme: "vsc-packages-activitybar-folders", offset: 8 }, { type: "&&", offset: 41 }, { type: "Str", lexeme: "vsc-packages-folders-loaded", offset: 44 }, { type: "EOF", offset: 71 }]));
		});

		test(`sfdx:project_opened && resource =~ /.*\\/functions\\/.*\\/[^\\/]+(\\/[^\\/]+\.(ts|js|java|json|toml))?$/ && resourceFilename != package.json && resourceFilename != package-lock.json && resourceFilename != tsconfig.json`, () => {
			const input = `sfdx:project_opened && resource =~ /.*\\/functions\\/.*\\/[^\\/]+(\\/[^\\/]+\.(ts|js|java|json|toml))?$/ && resourceFilename != package.json && resourceFilename != package-lock.json && resourceFilename != tsconfig.json`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "sfdx:project_opened", offset: 0 }, { type: "&&", offset: 20 }, { type: "Str", lexeme: "resource", offset: 23 }, { type: "=~", offset: 32 }, { type: "RegexStr", lexeme: "/.*\\/functions\\/.*\\/[^\\/]+(\\/[^\\/]+.(ts|js|java|json|toml))?$/", offset: 35 }, { type: "&&", offset: 98 }, { type: "Str", lexeme: "resourceFilename", offset: 101 }, { type: "!=", offset: 118 }, { type: "Str", lexeme: "package.json", offset: 121 }, { type: "&&", offset: 134 }, { type: "Str", lexeme: "resourceFilename", offset: 137 }, { type: "!=", offset: 154 }, { type: "Str", lexeme: "package-lock.json", offset: 157 }, { type: "&&", offset: 175 }, { type: "Str", lexeme: "resourceFilename", offset: 178 }, { type: "!=", offset: 195 }, { type: "Str", lexeme: "tsconfig.json", offset: 198 }, { type: "EOF", offset: 211 }]));
		});

		test(`view =~ '/(servers)/' && viewItem =~ '/^(Starting|Started|Debugging|Stopping|Stopped)/'`, () => {
			const input = `view =~ '/(servers)/' && viewItem =~ '/^(Starting|Started|Debugging|Stopping|Stopped)/'`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "view", offset: 0 }, { type: "=~", offset: 5 }, { type: "QuotedStr", lexeme: "/(servers)/", offset: 9 }, { type: "&&", offset: 22 }, { type: "Str", lexeme: "viewItem", offset: 25 }, { type: "=~", offset: 34 }, { type: "QuotedStr", lexeme: "/^(Starting|Started|Debugging|Stopping|Stopped)/", offset: 38 }, { type: "EOF", offset: 87 }]));
		});
	});

	suite('handling lexical errors', () => {

		test(`foo === '`, () => {
			const input = `foo === '`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo", offset: 0 }, { type: "==", offset: 4 }, { type: "ErrorToken", offset: 6, lexeme: "=" }, { type: "ErrorToken", offset: 8, lexeme: "'" }, { type: "EOF", offset: 9 }]));
		});

		test(`foo && 'bar - unterminated single quote`, () => {
			const input = `foo && 'bar`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo", offset: 0 }, { type: "&&", offset: 4 }, { type: "ErrorToken", offset: 7, lexeme: "'bar" }, { type: "EOF", offset: 11 }]));
		});

		test(`foo === bar'`, () => {
			const input = `foo === bar'`;
			const scanner = new Scanner().reset(input);
			const r = [...scanner].filter(t => t.type === TokenType.Error).map(Scanner.reportError);
			assert.deepStrictEqual(r, (["Unexpected token '=' at offset 6. Did you mean '==' or '=~'?", "Unexpected token ''' at offset 11"]));
		});

		test('vim<c-r> == 1 && vim<2 <= 3', () => {
			const input = 'vim<c-r> == 1 && vim<2 <= 3';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "vim<c-r>", offset: 0 }, { type: "==", offset: 9 }, { type: "Str", lexeme: "1", offset: 12 }, { type: "&&", offset: 14 }, { type: "Str", lexeme: "vim<2", offset: 17 }, { type: "<=", offset: 23 }, { type: "Str", lexeme: "3", offset: 26 }, { type: "EOF", offset: 27 }]));
		});

		test('vim<c-r>==1 && vim<2<=3', () => {
			const input = 'vim<c-r>==1 && vim<2<=3';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "vim<c-r", offset: 0 }, { type: ">=", offset: 7 }, { type: "ErrorToken", offset: 9, lexeme: "=" }, { type: "&&", offset: 12 }, { type: "Str", lexeme: "vim<2", offset: 15 }, { type: "<=", offset: 20 }, { type: "Str", lexeme: "3", offset: 22 }, { type: "EOF", offset: 23 }]));
		});
	});
});
