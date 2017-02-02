/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {
	SyntaxKind, createScanner, parse, getLocation, Node, ParseError, parseTree, ParseErrorCode,
	getParseErrorMessage, ParseOptions, Segment, findNodeAtLocation, getNodeValue
} from 'vs/base/common/json';

function assertKinds(text: string, ...kinds: SyntaxKind[]): void {
	var _json = createScanner(text);
	var kind: SyntaxKind;
	while ((kind = _json.scan()) !== SyntaxKind.EOF) {
		assert.equal(kind, kinds.shift());
	}
	assert.equal(kinds.length, 0);
}


function assertValidParse(input: string, expected: any, options?: ParseOptions): void {
	var errors: { error: ParseErrorCode }[] = [];
	var actual = parse(input, errors, options);

	if (errors.length !== 0) {
		assert(false, getParseErrorMessage(errors[0].error));
	}
	assert.deepEqual(actual, expected);
}

function assertInvalidParse(input: string, expected: any, options?: ParseOptions): void {
	var errors: { error: ParseErrorCode }[] = [];
	var actual = parse(input, errors, options);

	assert(errors.length > 0);
	assert.deepEqual(actual, expected);
}

function assertTree(input: string, expected: any, expectedErrors: number[] = []): void {
	var errors: ParseError[] = [];
	var actual = parseTree(input, errors);

	assert.deepEqual(errors.map(e => e.error, expected), expectedErrors);
	let checkParent = (node: Node) => {
		if (node.children) {
			for (let child of node.children) {
				assert.equal(node, child.parent);
				delete child.parent; // delete to avoid recursion in deep equal
				checkParent(child);
			}
		}
	};
	checkParent(actual);

	assert.deepEqual(actual, expected);
}

function assertNodeAtLocation(input: Node, segments: Segment[], expected: any) {
	let actual = findNodeAtLocation(input, segments);
	assert.deepEqual(actual ? getNodeValue(actual) : void 0, expected);
}


function assertLocation(input: string, expectedSegments: Segment[], expectedNodeType: string, expectedCompleteProperty: boolean): void {
	var offset = input.indexOf('|');
	input = input.substring(0, offset) + input.substring(offset + 1, input.length);
	var actual = getLocation(input, offset);
	assert(actual);
	assert.deepEqual(actual.path, expectedSegments, input);
	assert.equal(actual.previousNode && actual.previousNode.type, expectedNodeType, input);
	assert.equal(actual.isAtPropertyKey, expectedCompleteProperty, input);
}

suite('JSON', () => {
	test('tokens', () => {
		assertKinds('{', SyntaxKind.OpenBraceToken);
		assertKinds('}', SyntaxKind.CloseBraceToken);
		assertKinds('[', SyntaxKind.OpenBracketToken);
		assertKinds(']', SyntaxKind.CloseBracketToken);
		assertKinds(':', SyntaxKind.ColonToken);
		assertKinds(',', SyntaxKind.CommaToken);
	});

	test('comments', () => {
		assertKinds('// this is a comment', SyntaxKind.LineCommentTrivia);
		assertKinds('// this is a comment\n', SyntaxKind.LineCommentTrivia, SyntaxKind.LineBreakTrivia);
		assertKinds('/* this is a comment*/', SyntaxKind.BlockCommentTrivia);
		assertKinds('/* this is a \r\ncomment*/', SyntaxKind.BlockCommentTrivia);
		assertKinds('/* this is a \ncomment*/', SyntaxKind.BlockCommentTrivia);

		// unexpected end
		assertKinds('/* this is a', SyntaxKind.BlockCommentTrivia);
		assertKinds('/* this is a \ncomment', SyntaxKind.BlockCommentTrivia);

		// broken comment
		assertKinds('/ ttt', SyntaxKind.Unknown, SyntaxKind.Trivia, SyntaxKind.Unknown);
	});

	test('strings', () => {
		assertKinds('"test"', SyntaxKind.StringLiteral);
		assertKinds('"\\""', SyntaxKind.StringLiteral);
		assertKinds('"\\/"', SyntaxKind.StringLiteral);
		assertKinds('"\\b"', SyntaxKind.StringLiteral);
		assertKinds('"\\f"', SyntaxKind.StringLiteral);
		assertKinds('"\\n"', SyntaxKind.StringLiteral);
		assertKinds('"\\r"', SyntaxKind.StringLiteral);
		assertKinds('"\\t"', SyntaxKind.StringLiteral);
		assertKinds('"\\v"', SyntaxKind.StringLiteral);
		assertKinds('"\u88ff"', SyntaxKind.StringLiteral);

		// unexpected end
		assertKinds('"test', SyntaxKind.StringLiteral);
		assertKinds('"test\n"', SyntaxKind.StringLiteral, SyntaxKind.LineBreakTrivia, SyntaxKind.StringLiteral);
	});

	test('numbers', () => {
		assertKinds('0', SyntaxKind.NumericLiteral);
		assertKinds('0.1', SyntaxKind.NumericLiteral);
		assertKinds('-0.1', SyntaxKind.NumericLiteral);
		assertKinds('-1', SyntaxKind.NumericLiteral);
		assertKinds('1', SyntaxKind.NumericLiteral);
		assertKinds('123456789', SyntaxKind.NumericLiteral);
		assertKinds('10', SyntaxKind.NumericLiteral);
		assertKinds('90', SyntaxKind.NumericLiteral);
		assertKinds('90E+123', SyntaxKind.NumericLiteral);
		assertKinds('90e+123', SyntaxKind.NumericLiteral);
		assertKinds('90e-123', SyntaxKind.NumericLiteral);
		assertKinds('90E-123', SyntaxKind.NumericLiteral);
		assertKinds('90E123', SyntaxKind.NumericLiteral);
		assertKinds('90e123', SyntaxKind.NumericLiteral);

		// zero handling
		assertKinds('01', SyntaxKind.NumericLiteral, SyntaxKind.NumericLiteral);
		assertKinds('-01', SyntaxKind.NumericLiteral, SyntaxKind.NumericLiteral);

		// unexpected end
		assertKinds('-', SyntaxKind.Unknown);
		assertKinds('.0', SyntaxKind.Unknown);
	});

	test('keywords: true, false, null', () => {
		assertKinds('true', SyntaxKind.TrueKeyword);
		assertKinds('false', SyntaxKind.FalseKeyword);
		assertKinds('null', SyntaxKind.NullKeyword);


		assertKinds('true false null',
			SyntaxKind.TrueKeyword,
			SyntaxKind.Trivia,
			SyntaxKind.FalseKeyword,
			SyntaxKind.Trivia,
			SyntaxKind.NullKeyword);

		// invalid words
		assertKinds('nulllll', SyntaxKind.Unknown);
		assertKinds('True', SyntaxKind.Unknown);
		assertKinds('foo-bar', SyntaxKind.Unknown);
		assertKinds('foo bar', SyntaxKind.Unknown, SyntaxKind.Trivia, SyntaxKind.Unknown);
	});

	test('trivia', () => {
		assertKinds(' ', SyntaxKind.Trivia);
		assertKinds('  \t  ', SyntaxKind.Trivia);
		assertKinds('  \t  \n  \t  ', SyntaxKind.Trivia, SyntaxKind.LineBreakTrivia, SyntaxKind.Trivia);
		assertKinds('\r\n', SyntaxKind.LineBreakTrivia);
		assertKinds('\r', SyntaxKind.LineBreakTrivia);
		assertKinds('\n', SyntaxKind.LineBreakTrivia);
		assertKinds('\n\r', SyntaxKind.LineBreakTrivia, SyntaxKind.LineBreakTrivia);
		assertKinds('\n   \n', SyntaxKind.LineBreakTrivia, SyntaxKind.Trivia, SyntaxKind.LineBreakTrivia);
	});

	test('parse: literals', () => {

		assertValidParse('true', true);
		assertValidParse('false', false);
		assertValidParse('null', null);
		assertValidParse('"foo"', 'foo');
		assertValidParse('"\\"-\\\\-\\/-\\b-\\f-\\n-\\r-\\t"', '"-\\-/-\b-\f-\n-\r-\t');
		assertValidParse('"\\u00DC"', 'Ü');
		assertValidParse('9', 9);
		assertValidParse('-9', -9);
		assertValidParse('0.129', 0.129);
		assertValidParse('23e3', 23e3);
		assertValidParse('1.2E+3', 1.2E+3);
		assertValidParse('1.2E-3', 1.2E-3);
		assertValidParse('1.2E-3 // comment', 1.2E-3);
	});

	test('parse: objects', () => {
		assertValidParse('{}', {});
		assertValidParse('{ "foo": true }', { foo: true });
		assertValidParse('{ "bar": 8, "xoo": "foo" }', { bar: 8, xoo: 'foo' });
		assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
		assertValidParse('{ "a": false, "b": true, "c": [ 7.4 ] }', { a: false, b: true, c: [7.4] });
		assertValidParse('{ "lineComment": "//", "blockComment": ["/*", "*/"], "brackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }', { lineComment: '//', blockComment: ['/*', '*/'], brackets: [['{', '}'], ['[', ']'], ['(', ')']] });
		assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
		assertValidParse('{ "hello": { "again": { "inside": 5 }, "world": 1 }}', { hello: { again: { inside: 5 }, world: 1 } });
		assertValidParse('{ "foo": /*hello*/true }', { foo: true });
	});

	test('parse: arrays', () => {
		assertValidParse('[]', []);
		assertValidParse('[ [],  [ [] ]]', [[], [[]]]);
		assertValidParse('[ 1, 2, 3 ]', [1, 2, 3]);
		assertValidParse('[ { "a": null } ]', [{ a: null }]);
	});

	test('parse: objects with errors', () => {
		assertInvalidParse('{,}', {});
		assertInvalidParse('{ "foo": true, }', { foo: true });
		assertInvalidParse('{ "bar": 8 "xoo": "foo" }', { bar: 8, xoo: 'foo' });
		assertInvalidParse('{ ,"bar": 8 }', { bar: 8 });
		assertInvalidParse('{ ,"bar": 8, "foo" }', { bar: 8 });
		assertInvalidParse('{ "bar": 8, "foo": }', { bar: 8 });
		assertInvalidParse('{ 8, "foo": 9 }', { foo: 9 });
	});

	test('parse: array with errors', () => {
		assertInvalidParse('[,]', []);
		assertInvalidParse('[ 1, 2, ]', [1, 2]);
		assertInvalidParse('[ 1 2, 3 ]', [1, 2, 3]);
		assertInvalidParse('[ ,1, 2, 3 ]', [1, 2, 3]);
		assertInvalidParse('[ ,1, 2, 3, ]', [1, 2, 3]);
	});

	test('parse: disallow commments', () => {
		let options = { disallowComments: true };

		assertValidParse('[ 1, 2, null, "foo" ]', [1, 2, null, `foo`], options);
		assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);

		assertInvalidParse('{ "foo": /*comment*/ true }', { foo: true }, options);
	});

	test('parse: trailing comma', () => {
		let options = { allowTrailingComma: true };
		assertValidParse('{ "hello": [], }', { hello: [] }, options);
		assertValidParse('{ "hello": [] }', { hello: [] }, options);
		assertValidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} }, options);
		assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);

		assertInvalidParse('{ "hello": [], }', { hello: [] });
		assertInvalidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} });
	});

	test('location: properties', () => {
		assertLocation('|{ "foo": "bar" }', [], void 0, false);
		assertLocation('{| "foo": "bar" }', [], void 0, true);
		assertLocation('{ |"foo": "bar" }', [`foo`], `property`, true);
		assertLocation('{ "foo|": "bar" }', [`foo`], `property`, true);
		assertLocation('{ "foo"|: "bar" }', [`foo`], `property`, true);
		assertLocation('{ "foo": "bar"| }', [`foo`], `string`, false);
		assertLocation('{ "foo":| "bar" }', [`foo`], void 0, false);
		assertLocation('{ "foo": {"bar|": 1, "car": 2 } }', [`foo`, `bar`], `property`, true);
		assertLocation('{ "foo": {"bar": 1|, "car": 3 } }', [`foo`, `bar`], `number`, false);
		assertLocation('{ "foo": {"bar": 1,| "car": 4 } }', [`foo`], void 0, true);
		assertLocation('{ "foo": {"bar": 1, "ca|r": 5 } }', [`foo`, `car`], `property`, true);
		assertLocation('{ "foo": {"bar": 1, "car": 6| } }', [`foo`, `car`], `number`, false);
		assertLocation('{ "foo": {"bar": 1, "car": 7 }| }', [`foo`], void 0, false);
		assertLocation('{ "foo": {"bar": 1, "car": 8 },| "goo": {} }', [], void 0, true);
		assertLocation('{ "foo": {"bar": 1, "car": 9 }, "go|o": {} }', [`goo`], `property`, true);
		assertLocation('{ "dep": {"bar": 1, "car": |', [`dep`, `car`], void 0, false);
		assertLocation('{ "dep": {"bar": 1,, "car": |', [`dep`, `car`], void 0, false);
		assertLocation('{ "dep": {"bar": "na", "dar": "ma", "car": | } }', [`dep`, `car`], void 0, false);
	});

	test('location: arrays', () => {
		assertLocation('|["foo", null ]', [], void 0, false);
		assertLocation('[|"foo", null ]', [0], `string`, false);
		assertLocation('["foo"|, null ]', [0], `string`, false);
		assertLocation('["foo",| null ]', [1], void 0, false);
		assertLocation('["foo", |null ]', [1], `null`, false);
		assertLocation('["foo", null,| ]', [2], void 0, false);
		assertLocation('["foo", null,,| ]', [3], void 0, false);
		assertLocation('[["foo", null,, ],|', [1], void 0, false);
	});

	test('tree: literals', () => {
		assertTree('true', { type: 'boolean', offset: 0, length: 4, value: true });
		assertTree('false', { type: 'boolean', offset: 0, length: 5, value: false });
		assertTree('null', { type: 'null', offset: 0, length: 4, value: null });
		assertTree('23', { type: 'number', offset: 0, length: 2, value: 23 });
		assertTree('-1.93e-19', { type: 'number', offset: 0, length: 9, value: -1.93e-19 });
		assertTree('"hello"', { type: 'string', offset: 0, length: 7, value: 'hello' });
	});

	test('tree: arrays', () => {
		assertTree('[]', { type: 'array', offset: 0, length: 2, children: [] });
		assertTree('[ 1 ]', { type: 'array', offset: 0, length: 5, children: [{ type: 'number', offset: 2, length: 1, value: 1 }] });
		assertTree('[ 1,"x"]', {
			type: 'array', offset: 0, length: 8, children: [
				{ type: 'number', offset: 2, length: 1, value: 1 },
				{ type: 'string', offset: 4, length: 3, value: 'x' }
			]
		});
		assertTree('[[]]', {
			type: 'array', offset: 0, length: 4, children: [
				{ type: 'array', offset: 1, length: 2, children: [] }
			]
		});
	});

	test('tree: objects', () => {
		assertTree('{ }', { type: 'object', offset: 0, length: 3, children: [] });
		assertTree('{ "val": 1 }', {
			type: 'object', offset: 0, length: 12, children: [
				{
					type: 'property', offset: 2, length: 8, columnOffset: 7, children: [
						{ type: 'string', offset: 2, length: 5, value: 'val' },
						{ type: 'number', offset: 9, length: 1, value: 1 }
					]
				}
			]
		});
		assertTree('{"id": "$", "v": [ null, null] }',
			{
				type: 'object', offset: 0, length: 32, children: [
					{
						type: 'property', offset: 1, length: 9, columnOffset: 5, children: [
							{ type: 'string', offset: 1, length: 4, value: 'id' },
							{ type: 'string', offset: 7, length: 3, value: '$' }
						]
					},
					{
						type: 'property', offset: 12, length: 18, columnOffset: 15, children: [
							{ type: 'string', offset: 12, length: 3, value: 'v' },
							{
								type: 'array', offset: 17, length: 13, children: [
									{ type: 'null', offset: 19, length: 4, value: null },
									{ type: 'null', offset: 25, length: 4, value: null }
								]
							}
						]
					}
				]
			}
		);
		assertTree('{  "id": { "foo": { } } , }',
			{
				type: 'object', offset: 0, length: 27, children: [
					{
						type: 'property', offset: 3, length: 20, columnOffset: 7, children: [
							{ type: 'string', offset: 3, length: 4, value: 'id' },
							{
								type: 'object', offset: 9, length: 14, children: [
									{
										type: 'property', offset: 11, length: 10, columnOffset: 16, children: [
											{ type: 'string', offset: 11, length: 5, value: 'foo' },
											{ type: 'object', offset: 18, length: 3, children: [] }
										]
									}
								]
							}
						]
					}
				]
			}
			, [ParseErrorCode.PropertyNameExpected, ParseErrorCode.ValueExpected]);
	});

	test('tree: find location', () => {
		let root = parseTree('{ "key1": { "key11": [ "val111", "val112" ] }, "key2": [ { "key21": false, "key22": 221 }, null, [{}] ] }');
		assertNodeAtLocation(root, [`key1`], { key11: ['val111', 'val112'] });
		assertNodeAtLocation(root, [`key1`, `key11`], ['val111', 'val112']);
		assertNodeAtLocation(root, [`key1`, `key11`, 0], 'val111');
		assertNodeAtLocation(root, [`key1`, `key11`, 1], 'val112');
		assertNodeAtLocation(root, [`key1`, `key11`, 2], void 0);
		assertNodeAtLocation(root, [`key2`, 0, `key21`], false);
		assertNodeAtLocation(root, [`key2`, 0, `key22`], 221);
		assertNodeAtLocation(root, [`key2`, 1], null);
		assertNodeAtLocation(root, [`key2`, 2], [{}]);
		assertNodeAtLocation(root, [`key2`, 2, 0], {});
	});
});
