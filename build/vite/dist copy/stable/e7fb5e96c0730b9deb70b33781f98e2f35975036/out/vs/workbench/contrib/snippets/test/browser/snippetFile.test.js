/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { SnippetFile, Snippet } from '../../browser/snippetsFile.js';
import { URI } from '../../../../../base/common/uri.js';
import { SnippetParser } from '../../../../../editor/contrib/snippet/browser/snippetParser.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('Snippets', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    class TestSnippetFile extends SnippetFile {
        constructor(filepath, snippets) {
            super(3 /* SnippetSource.Extension */, filepath, undefined, undefined, undefined, undefined);
            this.data.push(...snippets);
        }
    }
    test('SnippetFile#select', () => {
        let file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), []);
        let bucket = [];
        file.select('', bucket);
        assert.strictEqual(bucket.length, 0);
        file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
            new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['foo'], 'FooSnippet2', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['bar'], 'BarSnippet1', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['bar.comment'], 'BarSnippet2', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['bar.strings'], 'BarSnippet2', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['bazz', 'bazz'], 'BazzSnippet1', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        bucket = [];
        file.select('foo', bucket);
        assert.strictEqual(bucket.length, 2);
        bucket = [];
        file.select('fo', bucket);
        assert.strictEqual(bucket.length, 0);
        bucket = [];
        file.select('bar', bucket);
        assert.strictEqual(bucket.length, 1);
        bucket = [];
        file.select('bar.comment', bucket);
        assert.strictEqual(bucket.length, 2);
        bucket = [];
        file.select('bazz', bucket);
        assert.strictEqual(bucket.length, 1);
    });
    test('SnippetFile#select - any scope', function () {
        const file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
            new Snippet(false, [], 'AnySnippet1', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const bucket = [];
        file.select('foo', bucket);
        assert.strictEqual(bucket.length, 2);
    });
    test('Snippet#needsClipboard', function () {
        function assertNeedsClipboard(body, expected) {
            const snippet = new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', body, 'test', 1 /* SnippetSource.User */, generateUuid());
            assert.strictEqual(snippet.needsClipboard, expected);
            assert.strictEqual(SnippetParser.guessNeedsClipboard(body), expected);
        }
        assertNeedsClipboard('foo$CLIPBOARD', true);
        assertNeedsClipboard('${CLIPBOARD}', true);
        assertNeedsClipboard('foo${CLIPBOARD}bar', true);
        assertNeedsClipboard('foo$clipboard', false);
        assertNeedsClipboard('foo${clipboard}', false);
        assertNeedsClipboard('baba', false);
    });
    test('Snippet#isTrivial', function () {
        function assertIsTrivial(body, expected) {
            const snippet = new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', body, 'test', 1 /* SnippetSource.User */, generateUuid());
            assert.strictEqual(snippet.isTrivial, expected);
        }
        assertIsTrivial('foo', true);
        assertIsTrivial('foo$0', true);
        assertIsTrivial('foo$0bar', false);
        assertIsTrivial('foo$1', false);
        assertIsTrivial('foo$1$0', false);
        assertIsTrivial('${1:foo}', false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldEZpbGUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NuaXBwZXRzL3Rlc3QvYnJvd3Nlci9zbmlwcGV0RmlsZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBaUIsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQy9GLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxLQUFLLENBQUMsVUFBVSxFQUFFO0lBRWpCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsTUFBTSxlQUFnQixTQUFRLFdBQVc7UUFDeEMsWUFBWSxRQUFhLEVBQUUsUUFBbUI7WUFDN0MsS0FBSyxrQ0FBMEIsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBVSxFQUFFLFNBQVUsQ0FBQyxDQUFDO1lBQ3ZGLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUM7UUFDN0IsQ0FBQztLQUNEO0lBRUQsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtRQUMvQixJQUFJLElBQUksR0FBRyxJQUFJLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0UsSUFBSSxNQUFNLEdBQWMsRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMs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