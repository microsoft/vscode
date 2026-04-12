/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { createScanner, parse, parseTree } from '../../common/json.js';
import { getParseErrorMessage } from '../../common/jsonErrorMessages.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
function assertKinds(text, ...kinds) {
    const scanner = createScanner(text);
    let kind;
    while ((kind = scanner.scan()) !== 17 /* SyntaxKind.EOF */) {
        assert.strictEqual(kind, kinds.shift());
    }
    assert.strictEqual(kinds.length, 0);
}
function assertScanError(text, expectedKind, scanError) {
    const scanner = createScanner(text);
    scanner.scan();
    assert.strictEqual(scanner.getToken(), expectedKind);
    assert.strictEqual(scanner.getTokenError(), scanError);
}
function assertValidParse(input, expected, options) {
    const errors = [];
    const actual = parse(input, errors, options);
    if (errors.length !== 0) {
        assert(false, getParseErrorMessage(errors[0].error));
    }
    assert.deepStrictEqual(actual, expected);
}
function assertInvalidParse(input, expected, options) {
    const errors = [];
    const actual = parse(input, errors, options);
    assert(errors.length > 0);
    assert.deepStrictEqual(actual, expected);
}
function assertTree(input, expected, expectedErrors = [], options) {
    const errors = [];
    const actual = parseTree(input, errors, options);
    assert.deepStrictEqual(errors.map(e => e.error, expected), expectedErrors);
    const checkParent = (node) => {
        if (node.children) {
            for (const child of node.children) {
                assert.strictEqual(node, child.parent);
                // eslint-disable-next-line local/code-no-any-casts
                delete child.parent; // delete to avoid recursion in deep equal
                checkParent(child);
            }
        }
    };
    checkParent(actual);
    assert.deepStrictEqual(actual, expected);
}
suite('JSON', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('tokens', () => {
        assertKinds('{', 1 /* SyntaxKind.OpenBraceToken */);
        assertKinds('}', 2 /* SyntaxKind.CloseBraceToken */);
        assertKinds('[', 3 /* SyntaxKind.OpenBracketToken */);
        assertKinds(']', 4 /* SyntaxKind.CloseBracketToken */);
        assertKinds(':', 6 /* SyntaxKind.ColonToken */);
        assertKinds(',', 5 /* SyntaxKind.CommaToken */);
    });
    test('comments', () => {
        assertKinds('// this is a comment', 12 /* SyntaxKind.LineCommentTrivia */);
        assertKinds('// this is a comment\n', 12 /* SyntaxKind.LineCommentTrivia */, 14 /* SyntaxKind.LineBreakTrivia */);
        assertKinds('/* this is a comment*/', 13 /* SyntaxKind.BlockCommentTrivia */);
        assertKinds('/* this is a \r\ncomment*/', 13 /* SyntaxKind.BlockCommentTrivia */);
        assertKinds('/* this is a \ncomment*/', 13 /* SyntaxKind.BlockCommentTrivia */);
        // unexpected end
        assertKinds('/* this is a', 13 /* SyntaxKind.BlockCommentTrivia */);
        assertKinds('/* this is a \ncomment', 13 /* SyntaxKind.BlockCommentTrivia */);
        // broken comment
        assertKinds('/ ttt', 16 /* SyntaxKind.Unknown */, 15 /* SyntaxKind.Trivia */, 16 /* SyntaxKind.Unknown */);
    });
    test('strings', () => {
        assertKinds('"test"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\""', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\/"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\b"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\f"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\n"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\r"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\t"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\\v"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"\u88ff"', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"​\u2028"', 10 /* SyntaxKind.StringLiteral */);
        // unexpected end
        assertKinds('"test', 10 /* SyntaxKind.StringLiteral */);
        assertKinds('"test\n"', 10 /* SyntaxKind.StringLiteral */, 14 /* SyntaxKind.LineBreakTrivia */, 10 /* SyntaxKind.StringLiteral */);
        // invalid characters
        assertScanError('"\t"', 10 /* SyntaxKind.StringLiteral */, 6 /* ScanError.InvalidCharacter */);
        assertScanError('"\t "', 10 /* SyntaxKind.StringLiteral */, 6 /* ScanError.InvalidCharacter */);
    });
    test('numbers', () => {
        assertKinds('0', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('0.1', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('-0.1', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('-1', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('1', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('123456789', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('10', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('90', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('90E+123', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('90e+123', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('90e-123', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('90E-123', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('90E123', 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('90e123', 11 /* SyntaxKind.NumericLiteral */);
        // zero handling
        assertKinds('01', 11 /* SyntaxKind.NumericLiteral */, 11 /* SyntaxKind.NumericLiteral */);
        assertKinds('-01', 11 /* SyntaxKind.NumericLiteral */, 11 /* SyntaxKind.NumericLiteral */);
        // unexpected end
        assertKinds('-', 16 /* SyntaxKind.Unknown */);
        assertKinds('.0', 16 /* SyntaxKind.Unknown */);
    });
    test('keywords: true, false, null', () => {
        assertKinds('true', 8 /* SyntaxKind.TrueKeyword */);
        assertKinds('false', 9 /* SyntaxKind.FalseKeyword */);
        assertKinds('null', 7 /* SyntaxKind.NullKeyword */);
        assertKinds('true false null', 8 /* SyntaxKind.TrueKeyword */, 15 /* SyntaxKind.Trivia */, 9 /* SyntaxKind.FalseKeyword */, 15 /* SyntaxKind.Trivia */, 7 /* SyntaxKind.NullKeyword */);
        // invalid words
        assertKinds('nulllll', 16 /* SyntaxKind.Unknown */);
        assertKinds('True', 16 /* SyntaxKind.Unknown */);
        assertKinds('foo-bar', 16 /* SyntaxKind.Unknown */);
        assertKinds('foo bar', 16 /* SyntaxKind.Unknown */, 15 /* SyntaxKind.Trivia */, 16 /* SyntaxKind.Unknown */);
    });
    test('trivia', () => {
        assertKinds(' ', 15 /* SyntaxKind.Trivia */);
        assertKinds('  \t  ', 15 /* SyntaxKind.Trivia */);
        assertKinds('  \t  \n  \t  ', 15 /* SyntaxKind.Trivia */, 14 /* SyntaxKind.LineBreakTrivia */, 15 /* SyntaxKind.Trivia */);
        assertKinds('\r\n', 14 /* SyntaxKind.LineBreakTrivia */);
        assertKinds('\r', 14 /* SyntaxKind.LineBreakTrivia */);
        assertKinds('\n', 14 /* SyntaxKind.LineBreakTrivia */);
        assertKinds('\n\r', 14 /* SyntaxKind.LineBreakTrivia */, 14 /* SyntaxKind.LineBreakTrivia */);
        assertKinds('\n   \n', 14 /* SyntaxKind.LineBreakTrivia */, 15 /* SyntaxKind.Trivia */, 14 /* SyntaxKind.LineBreakTrivia */);
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
        assertInvalidParse('{ "foo": true, }', { foo: true }, { allowTrailingComma: false });
        assertInvalidParse('{ "bar": 8 "xoo": "foo" }', { bar: 8, xoo: 'foo' });
        assertInvalidParse('{ ,"bar": 8 }', { bar: 8 });
        assertInvalidParse('{ ,"bar": 8, "foo" }', { bar: 8 });
        assertInvalidParse('{ "bar": 8, "foo": }', { bar: 8 });
        assertInvalidParse('{ 8, "foo": 9 }', { foo: 9 });
    });
    test('parse: array with errors', () => {
        assertInvalidParse('[,]', []);
        assertInvalidParse('[ 1, 2, ]', [1, 2], { allowTrailingComma: false });
        assertInvalidParse('[ 1 2, 3 ]', [1, 2, 3]);
        assertInvalidParse('[ ,1, 2, 3 ]', [1, 2, 3]);
        assertInvalidParse('[ ,1, 2, 3, ]', [1, 2, 3], { allowTrailingComma: false });
    });
    test('parse: disallow commments', () => {
        const options = { disallowComments: true };
        assertValidParse('[ 1, 2, null, "foo" ]', [1, 2, null, 'foo'], options);
        assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);
        assertInvalidParse('{ "foo": /*comment*/ true }', { foo: true }, options);
    });
    test('parse: trailing comma', () => {
        // default is allow
        assertValidParse('{ "hello": [], }', { hello: [] });
        let options = { allowTrailingComma: true };
        assertValidParse('{ "hello": [], }', { hello: [] }, options);
        assertValidParse('{ "hello": [] }', { hello: [] }, options);
        assertValidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} }, options);
        assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);
        assertValidParse('{ "hello": [1,] }', { hello: [1] }, options);
        options = { allowTrailingComma: false };
        assertInvalidParse('{ "hello": [], }', { hello: [] }, options);
        assertInvalidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} }, options);
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
                    type: 'property', offset: 2, length: 8, colonOffset: 7, children: [
                        { type: 'string', offset: 2, length: 5, value: 'val' },
                        { type: 'number', offset: 9, length: 1, value: 1 }
                    ]
                }
            ]
        });
        assertTree('{"id": "$", "v": [ null, null] }', {
            type: 'object', offset: 0, length: 32, children: [
                {
                    type: 'property', offset: 1, length: 9, colonOffset: 5, children: [
                        { type: 'string', offset: 1, length: 4, value: 'id' },
                        { type: 'string', offset: 7, length: 3, value: '$' }
                    ]
                },
                {
                    type: 'property', offset: 12, length: 18, colonOffset: 15, children: [
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
        });
        assertTree('{  "id": { "foo": { } } , }', {
            type: 'object', offset: 0, length: 27, children: [
                {
                    type: 'property', offset: 3, length: 20, colonOffset: 7, children: [
                        { type: 'string', offset: 3, length: 4, value: 'id' },
                        {
                            type: 'object', offset: 9, length: 14, children: [
                                {
                                    type: 'property', offset: 11, length: 10, colonOffset: 16, children: [
                                        { type: 'string', offset: 11, length: 5, value: 'foo' },
                                        { type: 'object', offset: 18, length: 3, children: [] }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }, [3 /* ParseErrorCode.PropertyNameExpected */, 4 /* ParseErrorCode.ValueExpected */], { allowTrailingComma: false });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9qc29uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxhQUFhLEVBQVEsS0FBSyxFQUE0QyxTQUFTLEVBQXlCLE1BQU0sc0JBQXNCLENBQUM7QUFDOUksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXJFLFNBQVMsV0FBVyxDQUFDLElBQVksRUFBRSxHQUFHLEtBQW1CO0lBQ3hELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNwQyxJQUFJLElBQWdCLENBQUM7SUFDckIsT0FBTyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsNEJBQW1CLEVBQUUsQ0FBQztRQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBQ0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLENBQUM7QUFDRCxTQUFTLGVBQWUsQ0FBQyxJQUFZLEVBQUUsWUFBd0IsRUFBRSxTQUFvQjtJQUNwRixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxP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QU0sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMzRSxVQUFVLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDN0UsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLFVBQVUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxVQUFVLENBQUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNwRixVQUFVLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDakYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtRQUN6QixVQUFVLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEUsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxPQUFP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