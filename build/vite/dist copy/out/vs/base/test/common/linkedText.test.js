/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { parseLinkedText } from '../../common/linkedText.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('LinkedText', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('parses correctly', () => {
        assert.deepStrictEqual(parseLinkedText('').nodes, []);
        assert.deepStrictEqual(parseLinkedText('hello').nodes, ['hello']);
        assert.deepStrictEqual(parseLinkedText('hello there').nodes, ['hello there']);
        assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href).').nodes, [
            'Some message with ',
            { label: 'link text', href: 'http://link.href' },
            '.'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href "and a title").').nodes, [
            'Some message with ',
            { label: 'link text', href: 'http://link.href', title: 'and a title' },
            '.'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href \'and a title\').').nodes, [
            'Some message with ',
            { label: 'link text', href: 'http://link.href', title: 'and a title' },
            '.'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href "and a \'title\'").').nodes, [
            'Some message with ',
            { label: 'link text', href: 'http://link.href', title: 'and a \'title\'' },
            '.'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href \'and a "title"\').').nodes, [
            'Some message with ',
            { label: 'link text', href: 'http://link.href', title: 'and a "title"' },
            '.'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [link text](random stuff).').nodes, [
            'Some message with [link text](random stuff).'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [https link](https://link.href).').nodes, [
            'Some message with ',
            { label: 'https link', href: 'https://link.href' },
            '.'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [https link](https:).').nodes, [
            'Some message with [https link](https:).'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [a command](command:foobar).').nodes, [
            'Some message with ',
            { label: 'a command', href: 'command:foobar' },
            '.'
        ]);
        assert.deepStrictEqual(parseLinkedText('Some message with [a command](command:).').nodes, [
            'Some message with [a command](command:).'
        ]);
        assert.deepStrictEqual(parseLinkedText('link [one](command:foo "nice") and link [two](http://foo)...').nodes, [
            'link ',
            { label: 'one', href: 'command:foo', title: 'nice' },
            ' and link ',
            { label: 'two', href: 'http://foo' },
            '...'
        ]);
        assert.deepStrictEqual(parseLinkedText('link\n[one](command:foo "nice")\nand link [two](http://foo)...').nodes, [
            'link\n',
            { label: 'one', href: 'command:foo', title: 'nice' },
            '\nand link ',
            { label: 'two', href: 'http://foo' },
            '...'
        ]);
    });
    test('Should match non-greedily', () => {
        assert.deepStrictEqual(parseLinkedText('a [link text 1](http://link.href "title1") b [link text 2](http://link.href "title2") c').nodes, [
            'a ',
            { label: 'link text 1', href: 'http://link.href', title: 'title1' },
            ' b ',
            { label: 'link text 2', href: 'http://link.href', title: 'title2' },
            ' c',
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua2VkVGV4dC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9saW5rZWRUZXh0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7SUFDeEIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDOUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxlQUFlLENBQUMsa0RBQWtELENBQUMsQ0FBQyxLQUFLLEVBQUU7WUFDakcsb0JBQW9CO1lBQ3BCLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDaEQsR0FBRztTQUNILENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLGdFQUFnRSxDQUFDLENBQUMsS0FBSyxFQUFFO1lBQy9HLG9CQUFvQjtZQUNwQixFQUFFLEtBQUssRUFBRSxX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