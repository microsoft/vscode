/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { removeProperty, setProperty } from '../../common/jsonEdit.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('JSON - edits', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function assertEdit(content, edits, expected) {
        assert(edits);
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
    const formatterOptions = {
        insertSpaces: true,
        tabSize: 2,
        eol: '\n'
    };
    test('set property', () => {
        let content = '{\n  "x": "y"\n}';
        let edits = setProperty(content, ['x'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "x": "bar"\n}');
        content = 'true';
        edits = setProperty(content, [], 'bar', formatterOptions);
        assertEdit(content, edits, '"bar"');
        content = '{\n  "x": "y"\n}';
        edits = setProperty(content, ['x'], { key: true }, formatterOptions);
        assertEdit(content, edits, '{\n  "x": {\n    "key": true\n  }\n}');
        content = '{\n  "a": "b",  "x": "y"\n}';
        edits = setProperty(content, ['a'], null, formatterOptions);
        assertEdit(content, edits, '{\n  "a": null,  "x": "y"\n}');
    });
    test('insert property', () => {
        let content = '{}';
        let edits = setProperty(content, ['foo'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "foo": "bar"\n}');
        edits = setProperty(content, ['foo', 'foo2'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "foo": {\n    "foo2": "bar"\n  }\n}');
        content = '{\n}';
        edits = setProperty(content, ['foo'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "foo": "bar"\n}');
        content = '  {\n  }';
        edits = setProperty(content, ['foo'], 'bar', formatterOptions);
        assertEdit(content, edits, '  {\n    "foo": "bar"\n  }');
        content = '{\n  "x": "y"\n}';
        edits = setProperty(content, ['foo'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "x": "y",\n  "foo": "bar"\n}');
        content = '{\n  "x": "y"\n}';
        edits = setProperty(content, ['e'], 'null', formatterOptions);
        assertEdit(content, edits, '{\n  "x": "y",\n  "e": "null"\n}');
        edits = setProperty(content, ['x'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "x": "bar"\n}');
        content = '{\n  "x": {\n    "a": 1,\n    "b": true\n  }\n}\n';
        edits = setProperty(content, ['x'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "x": "bar"\n}\n');
        edits = setProperty(content, ['x', 'b'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": "bar"\n  }\n}\n');
        edits = setProperty(content, ['x', 'c'], 'bar', formatterOptions, () => 0);
        assertEdit(content, edits, '{\n  "x": {\n    "c": "bar",\n    "a": 1,\n    "b": true\n  }\n}\n');
        edits = setProperty(content, ['x', 'c'], 'bar', formatterOptions, () => 1);
        assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "c": "bar",\n    "b": true\n  }\n}\n');
        edits = setProperty(content, ['x', 'c'], 'bar', formatterOptions, () => 2);
        assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true,\n    "c": "bar"\n  }\n}\n');
        edits = setProperty(content, ['c'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true\n  },\n  "c": "bar"\n}\n');
        content = '{\n  "a": [\n    {\n    } \n  ]  \n}';
        edits = setProperty(content, ['foo'], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "a": [\n    {\n    } \n  ],\n  "foo": "bar"\n}');
        content = '';
        edits = setProperty(content, ['foo', 0], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n}');
        content = '//comment';
        edits = setProperty(content, ['foo', 0], 'bar', formatterOptions);
        assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n} //comment');
    });
    test('remove property', () => {
        let content = '{\n  "x": "y"\n}';
        let edits = removeProperty(content, ['x'], formatterOptions);
        assertEdit(content, edits, '{\n}');
        content = '{\n  "x": "y", "a": []\n}';
        edits = removeProperty(content, ['x'], formatterOptions);
        assertEdit(content, edits, '{\n  "a": []\n}');
        content = '{\n  "x": "y", "a": []\n}';
        edits = removeProperty(content, ['a'], formatterOptions);
        assertEdit(content, edits, '{\n  "x": "y"\n}');
    });
    test('insert item at 0', () => {
        const content = '[\n  2,\n  3\n]';
        const edits = setProperty(content, [0], 1, formatterOptions);
        assertEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
    });
    test('insert item at 0 in empty array', () => {
        const content = '[\n]';
        const edits = setProperty(content, [0], 1, formatterOptions);
        assertEdit(content, edits, '[\n  1\n]');
    });
    test('insert item at an index', () => {
        const content = '[\n  1,\n  3\n]';
        const edits = setProperty(content, [1], 2, formatterOptions);
        assertEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
    });
    test('insert item at an index im empty array', () => {
        const content = '[\n]';
        const edits = setProperty(content, [1], 1, formatterOptions);
        assertEdit(content, edits, '[\n  1\n]');
    });
    test('insert item at end index', () => {
        const content = '[\n  1,\n  2\n]';
        const edits = setProperty(content, [2], 3, formatterOptions);
        assertEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
    });
    test('insert item at end to empty array', () => {
        const content = '[\n]';
        const edits = setProperty(content, [-1], 'bar', formatterOptions);
        assertEdit(content, edits, '[\n  "bar"\n]');
    });
    test('insert item at end', () => {
        const content = '[\n  1,\n  2\n]';
        const edits = setProperty(content, [-1], 'bar', formatterOptions);
        assertEdit(content, edits, '[\n  1,\n  2,\n  "bar"\n]');
    });
    test('remove item in array with one item', () => {
        const content = '[\n  1\n]';
        const edits = setProperty(content, [0], undefined, formatterOptions);
        assertEdit(content, edits, '[]');
    });
    test('remove item in the middle of the array', () => {
        const content = '[\n  1,\n  2,\n  3\n]';
        const edits = setProperty(content, [1], undefined, formatterOptions);
        assertEdit(content, edits, '[\n  1,\n  3\n]');
    });
    test('remove last item in the array', () => {
        const content = '[\n  1,\n  2,\n  "bar"\n]';
        const edits = setProperty(content, [2], undefined, formatterOptions);
        assertEdit(content, edits, '[\n  1,\n  2\n]');
    });
    test('remove last item in the array if ends with comma', () => {
        const content = '[\n  1,\n  "foo",\n  "bar",\n]';
        const edits = setProperty(content, [2], undefined, formatterOptions);
        assertEdit(content, edits, '[\n  1,\n  "foo"\n]');
    });
    test('remove last item in the array if there is a comment in the beginning', () => {
        const content = '// This is a comment\n[\n  1,\n  "foo",\n  "bar"\n]';
        const edits = setProperty(content, [2], undefined, formatterOptions);
        assertEdit(content, edits, '// This is a comment\n[\n  1,\n  "foo"\n]');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbkVkaXQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vanNvbkVkaXQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUV2RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsS0FBSyxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7SUFFMUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLFVBQVUsQ0FBQyxPQUFlLEVBQUUsS0FBYSxFQUFFLFFBQWdCO1FBQ25FLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNkLElBQUksY0FBYyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7UUFDcEMsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDNUMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzVGLE1BQU0sQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUM7WUFDekMsTUFBTSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFD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