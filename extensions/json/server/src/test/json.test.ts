/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { SyntaxKind, createScanner, parse, getLocation,  ParseErrorCode, getParseErrorMessage } from '../json-toolbox/json';

function assertKinds(text:string, ...kinds:SyntaxKind[]):void {
	var _json = createScanner(text);
	var kind: SyntaxKind;
	while((kind = _json.scan()) !== SyntaxKind.EOF) {
		assert.equal(kind, kinds.shift());
	}
	assert.equal(kinds.length, 0);
}


function assertValidParse(input:string, expected:any) : void {
	var errors : {error: ParseErrorCode}[] = [];
	var actual = parse(input, errors);

	if (errors.length !== 0) {
		assert(false, getParseErrorMessage(errors[0].error));
	}
	assert.deepEqual(actual, expected);
}

function assertInvalidParse(input:string, expected:any) : void {
	var errors : {error: ParseErrorCode}[] = [];
	var actual = parse(input, errors);

	assert(errors.length > 0);
	assert.deepEqual(actual, expected);
}

function assertLocation(input:string, expectedSegments: string[], expectedNodeType: string, expectedCompleteProperty: boolean) : void {
	var errors : {error: ParseErrorCode}[] = [];
	var offset = input.indexOf('|');
	input = input.substring(0, offset) + input.substring(offset+1, input.length);
	var actual = getLocation(input, offset);
	assert(actual);
	assert.deepEqual(actual.segments, expectedSegments, input);
	assert.equal(actual.previousNode && actual.previousNode.type, expectedNodeType, input);
	assert.equal(actual.completeProperty, expectedCompleteProperty, input);
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

	});

	test('parse: objects', () => {
		assertValidParse('{}', {});
		assertValidParse('{ "foo": true }', { foo: true });
		assertValidParse('{ "bar": 8, "xoo": "foo" }', { bar: 8, xoo: 'foo' });
		assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
		assertValidParse('{ "a": false, "b": true, "c": [ 7.4 ] }', { a: false, b: true, c: [ 7.4 ]});
		assertValidParse('{ "lineComment": "//", "blockComment": ["/*", "*/"], "brackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }', { lineComment: '//', blockComment: ["/*", "*/"], brackets: [ ["{", "}"], ["[", "]"], ["(", ")"] ] });
		assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
		assertValidParse('{ "hello": { "again": { "inside": 5 }, "world": 1 }}', { hello: { again: { inside: 5 }, world: 1 }});
	});

	test('parse: arrays', () => {
		assertValidParse('[]', []);
		assertValidParse('[ [],  [ [] ]]', [[], [[]]]);
		assertValidParse('[ 1, 2, 3 ]', [ 1, 2, 3 ]);
		assertValidParse('[ { "a": null } ]', [ { a: null } ]);
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
		assertInvalidParse('[ 1, 2, ]', [ 1, 2]);
		assertInvalidParse('[ 1 2, 3 ]', [ 1, 2, 3 ]);
		assertInvalidParse('[ ,1, 2, 3 ]', [ 1, 2, 3 ]);
		assertInvalidParse('[ ,1, 2, 3, ]', [ 1, 2, 3 ]);
	});

	test('location: properties', () => {
		assertLocation('|{ "foo": "bar" }', [], void 0, false);
		assertLocation('{| "foo": "bar" }', [], void 0, true);
		assertLocation('{ |"foo": "bar" }', ["foo" ], "property", true);
		assertLocation('{ "foo|": "bar" }', [ "foo" ], "property", true);
		assertLocation('{ "foo"|: "bar" }', ["foo" ], "property", true);
		assertLocation('{ "foo": "bar"| }', ["foo" ], "string", false);
		assertLocation('{ "foo":| "bar" }', ["foo" ], void 0, false);
		assertLocation('{ "foo": {"bar|": 1, "car": 2 } }', ["foo", "bar" ], "property", true);
		assertLocation('{ "foo": {"bar": 1|, "car": 3 } }', ["foo", "bar" ], "number", false);
		assertLocation('{ "foo": {"bar": 1,| "car": 4 } }', ["foo"], void 0, true);
		assertLocation('{ "foo": {"bar": 1, "ca|r": 5 } }', ["foo", "car" ], "property", true);
		assertLocation('{ "foo": {"bar": 1, "car": 6| } }', ["foo", "car" ], "number", false);
		assertLocation('{ "foo": {"bar": 1, "car": 7 }| }', ["foo"], void 0, false);
		assertLocation('{ "foo": {"bar": 1, "car": 8 },| "goo": {} }', [], void 0, true);
		assertLocation('{ "foo": {"bar": 1, "car": 9 }, "go|o": {} }', ["goo" ], "property", true);
	});
	
	test('location: arrays', () => {
		assertLocation('|["foo", null ]', [], void 0, false);
		assertLocation('[|"foo", null ]', ["[0]"], "string", false);
		assertLocation('["foo"|, null ]', ["[0]"], "string", false);
		assertLocation('["foo",| null ]', ["[1]"], void 0, false);
		assertLocation('["foo", |null ]', ["[1]"], "null", false);
		assertLocation('["foo", null,| ]', ["[2]"], void 0, false);
	});
});
