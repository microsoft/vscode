/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Scanner, Token, TokenType } from 'vs/platform/contextkey/common/scanner';

suite('Context Key Scanner', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function tokenTypeToStr(token: Token) {
		switch (token.type) {
			case TokenType.LParen:
				return '(';
			case TokenType.RParen:
				return ')';
			case TokenType.Neg:
				return '!';
			case TokenType.Eq:
				return token.isTripleEq ? '===' : '==';
			case TokenType.NotEq:
				return token.isTripleEq ? '!==' : '!=';
			case TokenType.Lt:
				return '<';
			case TokenType.LtEq:
				return '<=';
			case TokenType.Gt:
				return '>';
			case TokenType.GtEq:
				return '>=';
			case TokenType.RegexOp:
				return '=~';
			case TokenType.RegexStr:
				return 'RegexStr';
			case TokenType.True:
				return 'true';
			case TokenType.False:
				return 'false';
			case TokenType.In:
				return 'in';
			case TokenType.Not:
				return 'not';
			case TokenType.And:
				return '&&';
			case TokenType.Or:
				return '||';
			case TokenType.Str:
				return 'Str';
			case TokenType.QuotedStr:
				return 'QuotedStr';
			case TokenType.Error:
				return 'ErrorToken';
			case TokenType.EOF:
				return 'EOF';
		}

	}

	function scan(input: string) {
		return (new Scanner()).reset(input).scan().map((token: Token) => {
			return 'lexeme' in token
				? {
					type: tokenTypeToStr(token),
					offset: token.offset,
					lexeme: token.lexeme
				} : {
					type: tokenTypeToStr(token),
					offset: token.offset
				};
		});
	}

	suite('scanning various cases of context keys', () => {

		test('foo.bar<C-shift+2>', () => {
			const input = 'foo.bar<C-shift+2>';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo.bar<C-shift+2>", offset: 0 }, { type: "EOF", offset: 18 }]));
		});

		test('!foo', () => {
			const input = '!foo';
			assert.deepStrictEqual(scan(input), ([{ type: "!", offset: 0 }, { type: "Str", lexeme: "foo", offset: 1 }, { type: "EOF", offset: 4 }]));
		});

		test('foo === bar', () => {
			const input = 'foo === bar';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "foo" }, { type: "===", offset: 4 }, { type: "Str", offset: 8, lexeme: "bar" }, { type: "EOF", offset: 11 }]));
		});

		test('foo  !== bar', () => {
			const input = 'foo  !== bar';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "foo" }, { type: "!==", offset: 5 }, { type: "Str", offset: 9, lexeme: "bar" }, { type: "EOF", offset: 12 }]));
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

		test('foo in barrr  ', () => {
			const input = 'foo in barrr  ';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo", offset: 0 }, { type: "in", offset: 4 }, { type: "Str", lexeme: "barrr", offset: 7 }, { type: "EOF", offset: 14 }]));
		});

		test(`resource =~ //FileCabinet/(SuiteScripts|Templates/(E-mail%20Templates|Marketing%20Templates)|Web%20Site%20Hosting%20Files)(/.*)*$/`, () => {
			const input = `resource =~ //FileCabinet/(SuiteScripts|Templates/(E-mail%20Templates|Marketing%20Templates)|Web%20Site%20Hosting%20Files)(/.*)*$/`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "resource" }, { type: "=~", offset: 9 }, { type: "RegexStr", offset: 12, lexeme: "//" }, { type: "Str", offset: 14, lexeme: "FileCabinet/" }, { type: "(", offset: 26 }, { type: "Str", offset: 27, lexeme: "SuiteScripts" }, { type: "ErrorToken", offset: 39, lexeme: "|" }, { type: "Str", offset: 40, lexeme: "Templates/" }, { type: "(", offset: 50 }, { type: "Str", offset: 51, lexeme: "E-mail%20Templates" }, { type: "ErrorToken", offset: 69, lexeme: "|" }, { type: "Str", offset: 70, lexeme: "Marketing%20Templates" }, { type: ")", offset: 91 }, { type: "ErrorToken", offset: 92, lexeme: "|" }, { type: "Str", offset: 93, lexeme: "Web%20Site%20Hosting%20Files" }, { type: ")", offset: 121 }, { type: "(", offset: 122 }, { type: "RegexStr", offset: 123, lexeme: "/.*)*$/" }, { type: "EOF", offset: 130 }]));
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

		test(`resourcePath =~ /\.md(\.yml|\.txt)*$/gim`, () => {
			const input = `resourcePath =~ /\.md(\.yml|\.txt)*$/gim`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "resourcePath" }, { type: "=~", offset: 13 }, { type: "RegexStr", offset: 16, lexeme: "/.md(.yml|.txt)*$/gim" }, { type: "EOF", offset: 37 }]));
		});
	});

	test(`foo === bar'`, () => {
		const input = `foo === bar'`;
		assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "foo" }, { type: "===", offset: 4 }, { type: "Str", offset: 8, lexeme: "bar" }, { type: "ErrorToken", offset: 11, lexeme: "'" }, { type: "EOF", offset: 12 }]));
	});

	suite('handling lexical errors', () => {

		test(`foo === '`, () => {
			const input = `foo === '`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "foo" }, { type: "===", offset: 4 }, { type: "ErrorToken", offset: 8, lexeme: "'" }, { type: "EOF", offset: 9 }]));
		});

		test(`foo && 'bar - unterminated single quote`, () => {
			const input = `foo && 'bar`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "foo", offset: 0 }, { type: "&&", offset: 4 }, { type: "ErrorToken", offset: 7, lexeme: "'bar" }, { type: "EOF", offset: 11 }]));
		});

		test('vim<c-r> == 1 && vim<2 <= 3', () => {
			const input = 'vim<c-r> == 1 && vim<2 <= 3';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", lexeme: "vim<c-r>", offset: 0 }, { type: "==", offset: 9 }, { type: "Str", lexeme: "1", offset: 12 }, { type: "&&", offset: 14 }, { type: "Str", lexeme: "vim<2", offset: 17 }, { type: "<=", offset: 23 }, { type: "Str", lexeme: "3", offset: 26 }, { type: "EOF", offset: 27 }]));
		});

		test('vim<c-r>==1 && vim<2<=3', () => {
			const input = 'vim<c-r>==1 && vim<2<=3';
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "vim<c-r>" }, { type: "==", offset: 8 }, { type: "Str", offset: 10, lexeme: "1" }, { type: "&&", offset: 12 }, { type: "Str", offset: 15, lexeme: "vim<2<" }, { type: "ErrorToken", offset: 21, lexeme: "=" }, { type: "Str", offset: 22, lexeme: "3" }, { type: "EOF", offset: 23 }]));
		});

		test(`foo|bar`, () => {
			const input = `foo|bar`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "foo" }, { type: "ErrorToken", offset: 3, lexeme: "|" }, { type: "Str", offset: 4, lexeme: "bar" }, { type: "EOF", offset: 7 }]));
		});

		test(`resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`, () => {
			const input = `resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "resource" }, { type: "=~", offset: 9 }, { type: "RegexStr", offset: 12, lexeme: "//" }, { type: "Str", offset: 14, lexeme: "foo/" }, { type: "(", offset: 18 }, { type: "Str", offset: 19, lexeme: "barr" }, { type: "ErrorToken", offset: 23, lexeme: "|" }, { type: "Str", offset: 24, lexeme: "door/" }, { type: "(", offset: 29 }, { type: "Str", offset: 30, lexeme: "Foo-Bar%20Templates" }, { type: "ErrorToken", offset: 49, lexeme: "|" }, { type: "Str", offset: 50, lexeme: "Soo%20Looo" }, { type: ")", offset: 60 }, { type: "ErrorToken", offset: 61, lexeme: "|" }, { type: "Str", offset: 62, lexeme: "Web%20Site%Jjj%20Llll" }, { type: ")", offset: 83 }, { type: "(", offset: 84 }, { type: "RegexStr", offset: 85, lexeme: "/.*)*$/" }, { type: "EOF", offset: 92 }]));
		});

		test(`/((/foo/(?!bar)(.*)/)|((/src/).*/)).*$/`, () => {
			const input = `/((/foo/(?!bar)(.*)/)|((/src/).*/)).*$/`;
			assert.deepStrictEqual(scan(input), ([{ type: "RegexStr", offset: 0, lexeme: "/((/" }, { type: "Str", offset: 4, lexeme: "foo/" }, { type: "(", offset: 8 }, { type: "Str", offset: 9, lexeme: "?" }, { type: "!", offset: 10 }, { type: "Str", offset: 11, lexeme: "bar" }, { type: ")", offset: 14 }, { type: "(", offset: 15 }, { type: "Str", offset: 16, lexeme: ".*" }, { type: ")", offset: 18 }, { type: "RegexStr", offset: 19, lexeme: "/)|((/s" }, { type: "Str", offset: 26, lexeme: "rc/" }, { type: ")", offset: 29 }, { type: "Str", offset: 30, lexeme: ".*/" }, { type: ")", offset: 33 }, { type: ")", offset: 34 }, { type: "Str", offset: 35, lexeme: ".*$/" }, { type: "EOF", offset: 39 }]));
		});

		test(`resourcePath =~ //foo/barr// || resourcePath =~ //view/(jarrr|doooor|bees)/(web|templates)// && resourceExtname in foo.Bar`, () => {
			const input = `resourcePath =~ //foo/barr// || resourcePath =~ //view/(jarrr|doooor|bees)/(web|templates)// && resourceExtname in foo.Bar`;
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "resourcePath" }, { type: "=~", offset: 13 }, { type: "RegexStr", offset: 16, lexeme: "//" }, { type: "Str", offset: 18, lexeme: "foo/barr//" }, { type: "||", offset: 29 }, { type: "Str", offset: 32, lexeme: "resourcePath" }, { type: "=~", offset: 45 }, { type: "RegexStr", offset: 48, lexeme: "//" }, { type: "Str", offset: 50, lexeme: "view/" }, { type: "(", offset: 55 }, { type: "Str", offset: 56, lexeme: "jarrr" }, { type: "ErrorToken", offset: 61, lexeme: "|" }, { type: "Str", offset: 62, lexeme: "doooor" }, { type: "ErrorToken", offset: 68, lexeme: "|" }, { type: "Str", offset: 69, lexeme: "bees" }, { type: ")", offset: 73 }, { type: "RegexStr", offset: 74, lexeme: "/(web|templates)/" }, { type: "ErrorToken", offset: 91, lexeme: "/ && resourceExtname in foo.Bar" }, { type: "EOF", offset: 122 }]));
		});

		test(`foo =~ /file:\// || bar`, () => {
			const input = JSON.parse('"foo =~ /file:\// || bar"');
			assert.deepStrictEqual(scan(input), ([{ type: "Str", offset: 0, lexeme: "foo" }, { type: "=~", offset: 4 }, { type: "RegexStr", offset: 7, lexeme: "/file:/" }, { type: "ErrorToken", offset: 14, lexeme: "/ || bar" }, { type: "EOF", offset: 22 }]));
		});
	});
});
