/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as Formatter from '../../common/jsonFormatter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('JSON - formatter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function format(content, expected, insertSpaces = true) {
        let range = undefined;
        const rangeStart = content.indexOf('|');
        const rangeEnd = content.lastIndexOf('|');
        if (rangeStart !== -1 && rangeEnd !== -1) {
            content = content.substring(0, rangeStart) + content.substring(rangeStart + 1, rangeEnd) + content.substring(rangeEnd + 1);
            range = { offset: rangeStart, length: rangeEnd - rangeStart };
        }
        const edits = Formatter.format(content, range, { tabSize: 2, insertSpaces: insertSpaces, eol: '\n' });
        let lastEditOffset = content.length;
        for (let i = edits.length - 1; i >= 0; i--) {
            const edit = edits[i];
            assert(edit.offset >= 0 && edit.length >= 0 && edit.offset + edit.length <= content.length);
            assert(typeof edit.content === 'string');
            assert(lastEditOffset >= edit.offset + edit.length); // make sure all edits are ordered
            lastEditOffset = edit.offset;
            content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
        }
        assert.strictEqual(content, expected);
    }
    test('object - single property', () => {
        const content = [
            '{"x" : 1}'
        ].join('\n');
        const expected = [
            '{',
            '  "x": 1',
            '}'
        ].join('\n');
        format(content, expected);
    });
    test('object - multiple properties', () => {
        const content = [
            '{"x" : 1,  "y" : "foo", "z"  : true}'
        ].join('\n');
        const expected = [
            '{',
            '  "x": 1,',
            '  "y": "foo",',
            '  "z": true',
            '}'
        ].join('\n');
        format(content, expected);
    });
    test('object - no properties ', () => {
        const content = [
            '{"x" : {    },  "y" : {}}'
        ].join('\n');
        const expected = [
            '{',
            '  "x": {},',
            '  "y": {}',
            '}'
        ].join('\n');
        format(content, expected);
    });
    test('object - nesting', () => {
        const content = [
            '{"x" : {  "y" : { "z"  : { }}, "a": true}}'
        ].join('\n');
        const expected = [
            '{',
            '  "x": {',
            '    "y": {',
            '      "z": {}',
            '    },',
            '    "a": true',
            '  }',
            '}'
        ].join('\n');
        format(content, expected);
    });
    test('array - single items', () => {
        const content = [
            '["[]"]'
        ].join('\n');
        const expected = [
            '[',
            '  "[]"',
            ']'
        ].join('\n');
        format(content, expected);
    });
    test('array - multiple items', () => {
        const content = [
            '[true,null,1.2]'
        ].join('\n');
        const expected = [
            '[',
            '  true,',
            '  null,',
            '  1.2',
            ']'
        ].join('\n');
        format(content, expected);
    });
    test('array - no items', () => {
        const content = [
            '[      ]'
        ].join('\n');
        const expected = [
            '[]'
        ].join('\n');
        format(content, expected);
    });
    test('array - nesting', () => {
        const content = [
            '[ [], [ [ {} ], "a" ]  ]'
        ].join('\n');
        const expected = [
            '[',
            '  [],',
            '  [',
            '    [',
            '      {}',
            '    ],',
            '    "a"',
            '  ]',
            ']',
        ].join('\n');
        format(content, expected);
    });
    test('syntax errors', () => {
        const content = [
            '[ null 1.2 ]'
        ].join('\n');
        const expected = [
            '[',
            '  null 1.2',
            ']',
        ].join('\n');
        format(content, expected);
    });
    test('empty lines', () => {
        const content = [
            '{',
            '"a": true,',
            '',
            '"b": true',
            '}',
        ].join('\n');
        const expected = [
            '{',
            '\t"a": true,',
            '\t"b": true',
            '}',
        ].join('\n');
        format(content, expected, false);
    });
    test('single line comment', () => {
        const content = [
            '[ ',
            '//comment',
            '"foo", "bar"',
            '] '
        ].join('\n');
        const expected = [
            '[',
            '  //comment',
            '  "foo",',
            '  "bar"',
            ']',
        ].join('\n');
        format(content, expected);
    });
    test('block line comment', () => {
        const content = [
            '[{',
            '        /*comment*/     ',
            '"foo" : true',
            '}] '
        ].join('\n');
        const expected = [
            '[',
            '  {',
            '    /*comment*/',
            '    "foo": true',
            '  }',
            ']',
        ].join('\n');
        format(content, expected);
    });
    test('single line comment on same line', () => {
        const content = [
            ' {  ',
            '        "a": {}// comment    ',
            ' } '
        ].join('\n');
        const expected = [
            '{',
            '  "a": {} // comment    ',
            '}',
        ].join('\n');
        format(content, expected);
    });
    test('single line comment on same line 2', () => {
        const content = [
            '{ //comment',
            '}'
        ].join('\n');
        const expected = [
            '{ //comment',
            '}'
        ].join('\n');
        format(content, expected);
    });
    test('block comment on same line', () => {
        const content = [
            '{      "a": {}, /*comment*/    ',
            '        /*comment*/ "b": {},    ',
            '        "c": {/*comment*/}    } ',
        ].join('\n');
        const expected = [
            '{',
            '  "a": {}, /*comment*/',
            '  /*comment*/ "b": {},',
            '  "c": { /*comment*/}',
            '}',
        ].join('\n');
        format(content, expected);
    });
    test('block comment on same line advanced', () => {
        const content = [
            ' {       "d": [',
            '             null',
            '        ] /*comment*/',
            '        ,"e": /*comment*/ [null] }',
        ].join('\n');
        const expected = [
            '{',
            '  "d": [',
            '    null',
            '  ] /*comment*/,',
            '  "e": /*comment*/ [',
            '    null',
            '  ]',
            '}',
        ].join('\n');
        format(content, expected);
    });
    test('multiple block comments on same line', () => {
        const content = [
            '{      "a": {} /*comment*/, /*comment*/   ',
            '        /*comment*/ "b": {}  /*comment*/  } '
        ].join('\n');
        const expected = [
            '{',
            '  "a": {} /*comment*/, /*comment*/',
            '  /*comment*/ "b": {} /*comment*/',
            '}',
        ].join('\n');
        format(content, expected);
    });
    test('multiple mixed comments on same line', () => {
        const content = [
            '[ /*comment*/  /*comment*/   // comment ',
            ']'
        ].join('\n');
        const expected = [
            '[ /*comment*/ /*comment*/ // comment ',
            ']'
        ].join('\n');
        format(content, expected);
    });
    test('range', () => {
        const content = [
            '{ "a": {},',
            '|"b": [null, null]|',
            '} '
        ].join('\n');
        const expected = [
            '{ "a": {},',
            '"b": [',
            '  null,',
            '  null',
            ']',
            '} ',
        ].join('\n');
        format(content, expected);
    });
    test('range with existing indent', () => {
        const content = [
            '{ "a": {},',
            '   |"b": [null],',
            '"c": {}',
            '}|'
        ].join('\n');
        const expected = [
            '{ "a": {},',
            '   "b": [',
            '    null',
            '  ],',
            '  "c": {}',
            '}',
        ].join('\n');
        format(content, expected);
    });
    test('range with existing indent - tabs', () => {
        const content = [
            '{ "a": {},',
            '|  "b": [null],   ',
            '"c": {}',
            '} |    '
        ].join('\n');
        const expected = [
            '{ "a": {},',
            '\t"b": [',
            '\t\tnull',
            '\t],',
            '\t"c": {}',
            '}',
        ].join('\n');
        format(content, expected, false);
    });
    test('block comment none-line breaking symbols', () => {
        const content = [
            '{ "a": [ 1',
            '/* comment */',
            ', 2',
            '/* comment */',
            ']',
            '/* comment */',
            ',',
            ' "b": true',
            '/* comment */',
            '}'
        ].join('\n');
        const expected = [
            '{',
            '  "a": [',
            '    1',
            '    /* comment */',
            '    ,',
            '    2',
            '    /* comment */',
            '  ]',
            '  /* comment */',
            '  ,',
            '  "b": true',
            '  /* comment */',
            '}',
        ].join('\n');
        format(content, expected);
    });
    test('line comment after none-line breaking symbols', () => {
        const content = [
            '{ "a":',
            '// comment',
            'null,',
            ' "b"',
            '// comment',
            ': null',
            '// comment',
            '}'
        ].join('\n');
        const expected = [
            '{',
            '  "a":',
            '  // comment',
            '  null,',
            '  "b"',
            '  // comment',
            '  : null',
            '  // comment',
            '}',
        ].join('\n');
        format(content, expected);
    });
    test('toFormattedString', () => {
        const obj = {
            a: { b: 1, d: ['hello'] }
        };
        const getExpected = (tab, eol) => {
            return [
                `{`,
                `${tab}"a": {`,
                `${tab}${tab}"b": 1,`,
                `${tab}${tab}"d": [`,
                `${tab}${tab}${tab}"hello"`,
                `${tab}${tab}]`,
                `${tab}}`,
                '}'
            ].join(eol);
        };
        let actual = Formatter.toFormattedString(obj, { insertSpaces: true, tabSize: 2, eol: '\n' });
        assert.strictEqual(actual, getExpected('  ', '\n'));
        actual = Formatter.toFormattedString(obj, { insertSpaces: true, tabSize: 2, eol: '\r\n' });
        assert.strictEqual(actual, getExpected('  ', '\r\n'));
        actual = Formatter.toFormattedString(obj, { insertSpaces: false, eol: '\r\n' });
        assert.strictEqual(actual, getExpected('\t', '\r\n'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbkZvcm1hdHRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9qc29uRm9ybWF0dGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxTQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXJFLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7SUFFOUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLE1BQU0sQ0FBQyxPQUFlLEVBQUUsUUFBZ0IsRUFBRSxZQUFZLEdBQUcsSUFBSTtRQUNyRSxJQUFJLEtBQUssR0FBZ0MsU0FBUyxDQUFDO1FBQ25ELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxQyxJQUFJLFVBQVUsS0FBSyxDQUFDLENBQUMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUMxQyxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzNILEtBQUssR0FBRyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFFBQVEsR0FBRyxVQUFVLEVBQUUsQ0FBQztRQUMvRCxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcs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