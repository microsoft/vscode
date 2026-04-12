/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { MarkdownString } from '../../common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { URI } from '../../common/uri.js';
suite('MarkdownString', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Escape leading whitespace', function () {
        const mds = new MarkdownString();
        mds.appendText('Hello\n    Not a code block');
        assert.strictEqual(mds.value, 'Hello\n\n&nbsp;&nbsp;&nbsp;&nbsp;Not&nbsp;a&nbsp;code&nbsp;block');
    });
    test('MarkdownString.appendText doesn\'t escape quote #109040', function () {
        const mds = new MarkdownString();
        mds.appendText('> Text\n>More');
        assert.strictEqual(mds.value, '\\>&nbsp;Text\n\n\\>More');
    });
    test('appendText', () => {
        const mds = new MarkdownString();
        mds.appendText('# foo\n*bar*');
        assert.strictEqual(mds.value, '\\#&nbsp;foo\n\n\\*bar\\*');
    });
    test('appendLink', function () {
        function assertLink(target, label, title, expected) {
            const mds = new MarkdownString();
            mds.appendLink(target, label, title);
            assert.strictEqual(mds.value, expected);
        }
        assertLink('https://example.com\\()![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png)', 'hello', undefined, '[hello](https://example.com\\(\\)![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png\\))');
        assertLink('https://example.com', 'hello', 'title', '[hello](https://example.com "title")');
        assertLink('foo)', 'hello]', undefined, '[hello\\]](foo\\))');
        assertLink('foo\\)', 'hello]', undefined, '[hello\\]](foo\\))');
        assertLink('fo)o', 'hell]o', undefined, '[hell\\]o](fo\\)o)');
        assertLink('foo)', 'hello]', 'title"', '[hello\\]](foo\\) "title\\"")');
    });
    test('lift', () => {
        const dto = {
            value: 'hello',
            baseUri: URI.file('/foo/bar'),
            supportThemeIcons: true,
            isTrusted: true,
            supportHtml: true,
            uris: {
                [URI.file('/foo/bar2').toString()]: URI.file('/foo/bar2'),
                [URI.file('/foo/bar3').toString()]: URI.file('/foo/bar3')
            }
        };
        const mds = MarkdownString.lift(dto);
        assert.strictEqual(mds.value, dto.value);
        assert.strictEqual(mds.baseUri?.toString(), dto.baseUri?.toString());
        assert.strictEqual(mds.supportThemeIcons, dto.supportThemeIcons);
        assert.strictEqual(mds.isTrusted, dto.isTrusted);
        assert.strictEqual(mds.supportHtml, dto.supportHtml);
        assert.deepStrictEqual(mds.uris, dto.uris);
    });
    test('lift returns new instance', () => {
        const instance = new MarkdownString('hello');
        const mds2 = MarkdownString.lift(instance).appendText('world');
        assert.strictEqual(mds2.value, 'helloworld');
        assert.strictEqual(instance.value, 'hello');
    });
    suite('appendCodeBlock', () => {
        function assertCodeBlock(lang, code, result) {
            const mds = new MarkdownString();
            mds.appendCodeblock(lang, code);
            assert.strictEqual(mds.value, result);
        }
        test('common cases', () => {
            // no backticks
            assertCodeBlock('ts', 'const a = 1;', `\n${[
                '```ts',
                'const a = 1;',
                '```'
            ].join('\n')}\n`);
            // backticks
            assertCodeBlock('ts', 'const a = `1`;', `\n${[
                '```ts',
                'const a = `1`;',
                '```'
            ].join('\n')}\n`);
        });
        // @see https://github.com/microsoft/vscode/issues/193746
        test('escape fence', () => {
            // fence in the first line
            assertCodeBlock('md', '```\n```', `\n${[
                '````md',
                '```\n```',
                '````'
            ].join('\n')}\n`);
            // fence in the middle of code
            assertCodeBlock('md', '\n\n```\n```', `\n${[
                '````md',
                '\n\n```\n```',
                '````'
            ].join('\n')}\n`);
            // longer fence at the end of code
            assertCodeBlock('md', '```\n```\n````\n````', `\n${[
                '`````md',
                '```\n```\n````\n````',
                '`````'
            ].join('\n')}\n`);
        });
    });
    suite('ThemeIcons', () => {
        suite('Support On', () => {
            test('appendText', () => {
                const mds = new MarkdownString(undefined, { supportThemeIcons: true });
                mds.appendText('$(zap) $(not a theme icon) $(add)');
                assert.strictEqual(mds.value, '\\\\$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;\\\\$\\(add\\)');
            });
            test('appendMarkdown', () => {
                const mds = new MarkdownString(undefined, { supportThemeIcons: true });
                mds.appendMarkdown('$(zap) $(not a theme icon) $(add)');
                assert.strictEqual(mds.value, '$(zap) $(not a theme icon) $(add)');
            });
            test('appendMarkdown with escaped icon', () => {
                const mds = new MarkdownString(undefined, { supportThemeIcons: true });
                mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');
                assert.strictEqual(mds.value, '\\$(zap) $(not a theme icon) $(add)');
            });
        });
        suite('Support Off', () => {
            test('appendText', () => {
                const mds = new MarkdownString(undefined, { supportThemeIcons: false });
                mds.appendText('$(zap) $(not a theme icon) $(add)');
                assert.strictEqual(mds.value, '$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;$\\(add\\)');
            });
            test('appendMarkdown', () => {
                const mds = new MarkdownString(undefined, { supportThemeIcons: false });
                mds.appendMarkdown('$(zap) $(not a theme icon) $(add)');
                assert.strictEqual(mds.value, '$(zap) $(not a theme icon) $(add)');
            });
            test('appendMarkdown with escaped icon', () => {
                const mds = new MarkdownString(undefined, { supportThemeIcons: true });
                mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');
                assert.strictEqual(mds.value, '\\$(zap) $(not a theme icon) $(add)');
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25TdHJpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vbWFya2Rvd25TdHJpbmcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM5RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDckUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7SUFFNUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsMkJBQTJCLEVBQUU7UUFDakMsTUFBTSxHQUFHLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNqQyxHQUFHLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLGtFQUFrRSxDQUFDLENBQUM7SUFDbkcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseURBQXlELEVBQUU7UUFDL0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNqQyxHQUFHLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0lBQzNELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7UUFFdkIsTUFBTSxHQUFHLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNqQyxHQUFHLENBQUMsVUFB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