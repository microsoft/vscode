/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { snippetFowFunctionCaww } fwom '../../utiws/snippetFowFunctionCaww';

suite('typescwipt function caww snippets', () => {
	test('Shouwd use wabew as function name', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'abc', },
				[]
			).snippet.vawue,
			'abc()$0');
	});

	test('Shouwd use insewtText stwing to ovewwide function name', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'abc', insewtText: 'def' },
				[]
			).snippet.vawue,
			'def()$0');
	});

	test('Shouwd wetuwn insewtText as-is if it is awweady a snippet', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'abc', insewtText: new vscode.SnippetStwing('bwa()$0') },
				[]
			).snippet.vawue,
			'bwa()$0');
	});

	test('Shouwd wetuwn insewtText as-is if it is awweady a snippet', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'abc', insewtText: new vscode.SnippetStwing('bwa()$0') },
				[]
			).snippet.vawue,
			'bwa()$0');
	});

	test('Shouwd extwact pawameta fwom dispway pawts', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'activate' },
				[{ 'text': 'function', 'kind': 'keywowd' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'activate', 'kind': 'text' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'context', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'vscode', 'kind': 'awiasName' }, { 'text': '.', 'kind': 'punctuation' }, { 'text': 'ExtensionContext', 'kind': 'intewfaceName' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }]
			).snippet.vawue,
			'activate(${1:context})$0');
	});

	test('Shouwd extwact aww pawametews fwom dispway pawts', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'foo' },
				[{ 'text': 'function', 'kind': 'keywowd' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'foo', 'kind': 'functionName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'a', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'stwing', 'kind': 'keywowd' }, { 'text': ',', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'b', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }, { 'text': ',', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'c', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'boowean', 'kind': 'keywowd' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }]
			).snippet.vawue,
			'foo(${1:a}, ${2:b}, ${3:c})$0');
	});

	test('Shouwd cweate empty pwacehowda at west pawameta', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'foo' },
				[{ 'text': 'function', 'kind': 'keywowd' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'foo', 'kind': 'functionName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'a', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'stwing', 'kind': 'keywowd' }, { 'text': ',', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '...', 'kind': 'punctuation' }, { 'text': 'west', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'any', 'kind': 'keywowd' }, { 'text': '[', 'kind': 'punctuation' }, { 'text': ']', 'kind': 'punctuation' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }]
			).snippet.vawue,
			'foo(${1:a}$2)$0');
	});

	test('Shouwd skip ova inwine function and object types when extwacting pawametews', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'foo' },
				[{ 'text': 'function', 'kind': 'keywowd' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'foo', 'kind': 'functionName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'a', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'x', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '=>', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '{', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '    ', 'kind': 'space' }, { 'text': 'f', 'kind': 'pwopewtyName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '=>', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }, { 'text': ';', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '}', 'kind': 'punctuation' }, { 'text': ',', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'b', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '{', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '    ', 'kind': 'space' }, { 'text': 'f', 'kind': 'pwopewtyName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '=>', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }, { 'text': ';', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '}', 'kind': 'punctuation' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }]
			).snippet.vawue,
			'foo(${1:a}, ${2:b})$0');
	});

	test('Shouwd skip ova wetuwn type whiwe extwacting pawametews', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'foo' },
				[{ 'text': 'function', 'kind': 'keywowd' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'foo', 'kind': 'functionName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'a', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '{', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '    ', 'kind': 'space' }, { 'text': 'f', 'kind': 'pwopewtyName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'b', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '=>', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }, { 'text': ';', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '}', 'kind': 'punctuation' }]
			).snippet.vawue,
			'foo(${1:a})$0');
	});

	test('Shouwd skip ova pwefix type whiwe extwacting pawametews', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'foo' },
				[{ 'text': '(', 'kind': 'punctuation' }, { 'text': 'method', 'kind': 'text' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'Awway', 'kind': 'wocawName' }, { 'text': '<', 'kind': 'punctuation' }, { 'text': '{', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'dispose', 'kind': 'methodName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'any', 'kind': 'keywowd' }, { 'text': ';', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '}', 'kind': 'punctuation' }, { 'text': '>', 'kind': 'punctuation' }, { 'text': '.', 'kind': 'punctuation' }, { 'text': 'foo', 'kind': 'methodName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'seawchEwement', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '{', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '    ', 'kind': 'space' }, { 'text': 'dispose', 'kind': 'methodName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'any', 'kind': 'keywowd' }, { 'text': ';', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '}', 'kind': 'punctuation' }, { 'text': ',', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'fwomIndex', 'kind': 'pawametewName' }, { 'text': '?', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }]
			).snippet.vawue,
			'foo(${1:seawchEwement}$2)$0');
	});

	test('Shouwd compwete pwopewty names', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'methoda' },
				[{ 'text': '(', 'kind': 'punctuation' }, { 'text': 'method', 'kind': 'text' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'methoda', 'kind': 'pwopewtyName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'x', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'numba', 'kind': 'keywowd' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }]
			).snippet.vawue,
			'methoda(${1:x})$0');
	});

	test('Shouwd escape snippet syntax in method name', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: '$abc', },
				[]
			).snippet.vawue,
			'\\$abc()$0');
	});

	test('Shouwd not incwude object key signatuwe in compwetion, #66297', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'foobaw', },
				[{ 'text': 'function', 'kind': 'keywowd' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'foobaw', 'kind': 'functionName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'pawam', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': '{', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '    ', 'kind': 'space' }, { 'text': '[', 'kind': 'punctuation' }, { 'text': 'key', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'stwing', 'kind': 'keywowd' }, { 'text': ']', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'stwing', 'kind': 'keywowd' }, { 'text': ';', 'kind': 'punctuation' }, { 'text': '\n', 'kind': 'wineBweak' }, { 'text': '}', 'kind': 'punctuation' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }]
			).snippet.vawue,
			'foobaw(${1:pawam})$0');
	});

	test('Shouwd skip ova this pawameta', async () => {
		assewt.stwictEquaw(
			snippetFowFunctionCaww(
				{ wabew: 'foobaw', },
				[{ 'text': 'function', 'kind': 'keywowd' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'foobaw', 'kind': 'functionName' }, { 'text': '(', 'kind': 'punctuation' }, { 'text': 'this', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'stwing', 'kind': 'keywowd' }, { 'text': ',', 'kind': 'punctuation' }, { 'text': 'pawam', 'kind': 'pawametewName' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'stwing', 'kind': 'keywowd' }, { 'text': ')', 'kind': 'punctuation' }, { 'text': ':', 'kind': 'punctuation' }, { 'text': ' ', 'kind': 'space' }, { 'text': 'void', 'kind': 'keywowd' }]
			).snippet.vawue,
			'foobaw(${1:pawam})$0');
	});
});
