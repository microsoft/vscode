/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as strings from '../../../../base/common/strings.js';
import { assertSnapshot } from '../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { LineDecoration } from '../../../common/viewLayout/lineDecorations.js';
import { DomPosition, RenderLineInput, renderViewLine2 as renderViewLine } from '../../../common/viewLayout/viewLineRenderer.js';
import { TestLineToken, TestLineTokens } from '../core/testLineToken.js';
const HTML_EXTENSION = { extension: 'html' };
function createViewLineTokens(viewLineTokens) {
    return new TestLineTokens(viewLineTokens);
}
function createPart(endIndex, foreground) {
    return new TestLineToken(endIndex, (foreground << 15 /* MetadataConsts.FOREGROUND_OFFSET */) >>> 0);
}
function inflateRenderLineOutput(renderLineOutput) {
    // remove encompassing <span> to simplify test writing.
    let html = renderLineOutput.html;
    if (html.startsWith('<span>')) {
        html = html.replace(/^<span>/, '');
    }
    html = html.replace(/<\/span>$/, '');
    const spans = [];
    let lastIndex = 0;
    do {
        const newIndex = html.indexOf('<span', lastIndex + 1);
        if (newIndex === -1) {
            break;
        }
        spans.push(html.substring(lastIndex, newIndex));
        lastIndex = newIndex;
    } while (true);
    spans.push(html.substring(lastIndex));
    return {
        html: spans,
        mapping: renderLineOutput.characterMapping.inflate(),
    };
}
const defaultRenderLineInputOptions = {
    useMonospaceOptimizations: false,
    canUseHalfwidthRightwardsArrow: true,
    lineContent: '',
    continuesWithWrappedLine: false,
    isBasicASCII: true,
    containsRTL: false,
    fauxIndentLength: 0,
    lineTokens: createViewLineTokens([]),
    lineDecorations: [],
    tabSize: 4,
    startVisibleColumn: 0,
    spaceWidth: 10,
    middotWidth: 10,
    wsmiddotWidth: 10,
    stopRenderingLineAfter: -1,
    renderWhitespace: 'none',
    renderControlCharacters: false,
    fontLigatures: false,
    selectionsOnLine: null,
    textDirection: null,
    verticalScrollbarSize: 14,
    renderNewLineWhenEmpty: false
};
function createRenderLineInputOptions(opts) {
    return {
        ...defaultRenderLineInputOptions,
        ...opts
    };
}
function createRenderLineInput(opts) {
    const options = createRenderLineInputOptions(opts);
    return new RenderLineInput(options.useMonospaceOptimizations, options.canUseHalfwidthRightwardsArrow, options.lineContent, options.continuesWithWrappedLine, options.isBasicASCII, options.containsRTL, options.fauxIndentLength, options.lineTokens, options.lineDecorations, options.tabSize, options.startVisibleColumn, options.spaceWidth, options.middotWidth, options.wsmiddotWidth, options.stopRenderingLineAfter, options.renderWhitespace, options.renderControlCharacters, options.fontLigatures, options.selectionsOnLine, options.textDirection, options.verticalScrollbarSize, options.renderNewLineWhenEmpty);
}
suite('renderViewLine', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function assertCharacterReplacement(lineContent, tabSize, expected, expectedCharOffsetInPart) {
        const _actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: strings.isBasicASCII(lineContent),
            lineTokens: createViewLineTokens([new TestLineToken(lineContent.length, 0)]),
            tabSize,
            spaceWidth: 0,
            middotWidth: 0,
            wsmiddotWidth: 0
        }));
        assert.strictEqual(_actual.html, '<span><span class="mtk0">' + expected + '</span></span>');
        const info = expectedCharOffsetInPart.map((absoluteOffset) => [absoluteOffset, [0, absoluteOffset]]);
        assertCharacterMapping3(_actual.characterMapping, info);
    }
    test('replaces spaces', () => {
        assertCharacterReplacement(' ', 4, '\u00a0', [0, 1]);
        assertCharacterReplacement('  ', 4, '\u00a0\u00a0', [0, 1, 2]);
        assertCharacterReplacement('a  b', 4, 'a\u00a0\u00a0b', [0, 1, 2, 3, 4]);
    });
    test('escapes HTML markup', () => {
        assertCharacterReplacement('a<b', 4, 'a&lt;b', [0, 1, 2, 3]);
        assertCharacterReplacement('a>b', 4, 'a&gt;b', [0, 1, 2, 3]);
        assertCharacterReplacement('a&b', 4, 'a&amp;b', [0, 1, 2, 3]);
    });
    test('replaces some bad characters', () => {
        assertCharacterReplacement('a\0b', 4, 'a&#00;b', [0, 1, 2, 3]);
        assertCharacterReplacement('a' + String.fromCharCode(65279 /* CharCode.UTF8_BOM */) + 'b', 4, 'a\ufffdb', [0, 1, 2, 3]);
        assertCharacterReplacement('a\u2028b', 4, 'a\ufffdb', [0, 1, 2, 3]);
    });
    test('handles tabs', () => {
        assertCharacterReplacement('\t', 4, '\u00a0\u00a0\u00a0\u00a0', [0, 4]);
        assertCharacterReplacement('x\t', 4, 'x\u00a0\u00a0\u00a0', [0, 1, 4]);
        assertCharacterReplacement('xx\t', 4, 'xx\u00a0\u00a0', [0, 1, 2, 4]);
        assertCharacterReplacement('xxx\t', 4, 'xxx\u00a0', [0, 1, 2, 3, 4]);
        assertCharacterReplacement('xxxx\t', 4, 'xxxx\u00a0\u00a0\u00a0\u00a0', [0, 1, 2, 3, 4, 8]);
    });
    function assertParts(lineContent, tabSize, parts, expected, info) {
        const _actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens: createViewLineTokens(parts),
            tabSize,
            spaceWidth: 0,
            middotWidth: 0,
            wsmiddotWidth: 0
        }));
        assert.strictEqual(_actual.html, '<span>' + expected + '</span>');
        assertCharacterMapping3(_actual.characterMapping, info);
    }
    test('empty line', () => {
        assertParts('', 4, [], '<span></span>', []);
    });
    test('uses part type', () => {
        assertParts('x', 4, [createPart(1, 10)], '<span class="mtk10">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
        assertParts('x', 4, [createPart(1, 20)], '<span class="mtk20">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
        assertParts('x', 4, [createPart(1, 30)], '<span class="mtk30">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
    });
    test('two parts', () => {
        assertParts('xy', 4, [createPart(1, 1), createPart(2, 2)], '<span class="mtk1">x</span><span class="mtk2">y</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]]]);
        assertParts('xyz', 4, [createPart(1, 1), createPart(3, 2)], '<span class="mtk1">x</span><span class="mtk2">yz</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [3, [1, 2]]]);
        assertParts('xyz', 4, [createPart(2, 1), createPart(3, 2)], '<span class="mtk1">xy</span><span class="mtk2">z</span>', [[0, [0, 0]], [1, [0, 1]], [2, [1, 0]], [3, [1, 1]]]);
    });
    // overflow
    test('overflow', async () => {
        const _actual = renderViewLine(createRenderLineInput({
            lineContent: 'Hello world!',
            lineTokens: createViewLineTokens([
                createPart(1, 0),
                createPart(2, 1),
                createPart(3, 2),
                createPart(4, 3),
                createPart(5, 4),
                createPart(6, 5),
                createPart(7, 6),
                createPart(8, 7),
                createPart(9, 8),
                createPart(10, 9),
                createPart(11, 10),
                createPart(12, 11),
            ]),
            stopRenderingLineAfter: 6,
            renderWhitespace: 'boundary'
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // typical line
    test('typical', async () => {
        const lineContent = '\t    export class Game { // http://test.com     ';
        const lineTokens = createViewLineTokens([
            createPart(5, 1),
            createPart(11, 2),
            createPart(12, 3),
            createPart(17, 4),
            createPart(18, 5),
            createPart(22, 6),
            createPart(23, 7),
            createPart(24, 8),
            createPart(25, 9),
            createPart(28, 10),
            createPart(43, 11),
            createPart(48, 12),
        ]);
        const _actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens,
            renderWhitespace: 'boundary'
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #2255: Weird line rendering part 1
    test('issue-2255-1', async () => {
        const lineContent = '\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';
        const lineTokens = createViewLineTokens([
            createPart(3, 1), // 3 chars
            createPart(15, 2), // 12 chars
            createPart(21, 3), // 6 chars
            createPart(22, 4), // 1 char
            createPart(43, 5), // 21 chars
            createPart(45, 6), // 2 chars
            createPart(46, 7), // 1 char
            createPart(66, 8), // 20 chars
            createPart(67, 9), // 1 char
            createPart(68, 10), // 2 chars
        ]);
        const _actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #2255: Weird line rendering part 2
    test('issue-2255-2', async () => {
        const lineContent = ' \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';
        const lineTokens = createViewLineTokens([
            createPart(4, 1), // 4 chars
            createPart(16, 2), // 12 chars
            createPart(22, 3), // 6 chars
            createPart(23, 4), // 1 char
            createPart(44, 5), // 21 chars
            createPart(46, 6), // 2 chars
            createPart(47, 7), // 1 char
            createPart(67, 8), // 20 chars
            createPart(68, 9), // 1 char
            createPart(69, 10), // 2 chars
        ]);
        const _actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #91178: after decoration type shown before cursor
    test('issue-91178', async () => {
        const lineContent = '//just a comment';
        const lineTokens = createViewLineTokens([
            createPart(16, 1)
        ]);
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            canUseHalfwidthRightwardsArrow: false,
            lineContent,
            lineTokens,
            lineDecorations: [
                new LineDecoration(13, 13, 'dec1', 2 /* InlineDecorationType.After */),
                new LineDecoration(13, 13, 'dec2', 1 /* InlineDecorationType.Before */),
            ]
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue microsoft/monaco-editor#280: Improved source code rendering for RTL languages
    test('monaco-280', async () => {
        const lineContent = 'var קודמות = \"מיותר קודמות צ\'ט של, אם לשון העברית שינויים ויש, אם\";';
        const lineTokens = createViewLineTokens([
            createPart(3, 6),
            createPart(13, 1),
            createPart(66, 20),
            createPart(67, 1),
        ]);
        const _actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: false,
            containsRTL: true,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #137036: Issue in RTL languages in recent versions
    test('issue-137036', async () => {
        const lineContent = '<option value=\"العربية\">العربية</option>';
        const lineTokens = createViewLineTokens([
            createPart(1, 2),
            createPart(7, 3),
            createPart(8, 4),
            createPart(13, 5),
            createPart(14, 4),
            createPart(23, 6),
            createPart(24, 2),
            createPart(31, 4),
            createPart(33, 2),
            createPart(39, 3),
            createPart(40, 2),
        ]);
        const _actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: false,
            containsRTL: true,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #99589: Rendering whitespace influences bidi layout
    test('issue-99589', async () => {
        const lineContent = '    [\"🖨️ چاپ فاکتور\",\"🎨 تنظیمات\"]';
        const lineTokens = createViewLineTokens([
            createPart(5, 2),
            createPart(21, 3),
            createPart(22, 2),
            createPart(34, 3),
            createPart(35, 2),
        ]);
        const _actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent,
            isBasicASCII: false,
            containsRTL: true,
            lineTokens,
            renderWhitespace: 'all'
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #260239: HTML containing bidirectional text is rendered incorrectly
    test('issue-260239', async () => {
        // Simulating HTML like: <p class="myclass" title="العربي">نشاط التدويل!</p>
        // The line contains both LTR (class="myclass") and RTL (title="العربي") attribute values
        const lineContent = '<p class="myclass" title="العربي">نشاط التدويل!</p>';
        const lineTokens = createViewLineTokens([
            createPart(1, 1), // <
            createPart(2, 2), // p
            createPart(3, 3), // (space)
            createPart(8, 4), // class
            createPart(9, 5), // =
            createPart(10, 6), // "
            createPart(17, 7), // myclass
            createPart(18, 6), // "
            createPart(19, 3), // (space)
            createPart(24, 4), // title
            createPart(25, 5), // =
            createPart(26, 6), // "
            createPart(32, 8), // العربي (RTL text) - 6 Arabic characters from position 26-31
            createPart(33, 6), // " - closing quote at position 32
            createPart(34, 1), // >
            createPart(47, 9), // نشاط التدويل! (RTL text) - 13 characters from position 34-46
            createPart(48, 1), // <
            createPart(49, 2), // /
            createPart(50, 2), // p
            createPart(51, 1), // >
        ]);
        const _actual = renderViewLine(new RenderLineInput(false, true, lineContent, false, false, true, 0, lineTokens, [], 4, 0, 10, 10, 10, -1, 'none', false, false, null, null, 14));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #274604: Mixed LTR and RTL in a single token
    test('issue-274604', async () => {
        const lineContent = 'test.com##a:-abp-contains(إ)';
        const lineTokens = createViewLineTokens([
            createPart(lineContent.length, 1)
        ]);
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: false,
            containsRTL: true,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #277693: Mixed LTR and RTL in a single token with template literal
    test('issue-277693', async () => {
        const lineContent = 'نام کاربر: ${user.firstName}';
        const lineTokens = createViewLineTokens([
            createPart(9, 1), // نام کاربر (RTL string content)
            createPart(11, 1), // : (space)
            createPart(13, 2), // ${ (template expression punctuation)
            createPart(17, 3), // user (variable)
            createPart(18, 4), // . (punctuation)
            createPart(27, 3), // firstName (property)
            createPart(28, 2), // } (template expression punctuation)
        ]);
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: false,
            containsRTL: true,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #6885: Splits large tokens
    test('issue-6885', async () => {
        //                                                                                                                  1         1         1
        //                        1         2         3         4         5         6         7         8         9         0         1         2
        //               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
        const _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';
        function assertSplitsTokens(message, lineContent, expectedOutput) {
            const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
            const actual = renderViewLine(createRenderLineInput({
                lineContent,
                lineTokens
            }));
            assert.strictEqual(actual.html, '<span>' + expectedOutput.join('') + '</span>', message);
        }
        // A token with 49 chars
        {
            assertSplitsTokens('49 chars', _lineText.substr(0, 49), [
                '<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0inter</span>',
            ]);
        }
        // A token with 50 chars
        {
            assertSplitsTokens('50 chars', _lineText.substr(0, 50), [
                '<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
            ]);
        }
        // A token with 51 chars
        {
            assertSplitsTokens('51 chars', _lineText.substr(0, 51), [
                '<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
                '<span class="mtk1">s</span>',
            ]);
        }
        // A token with 99 chars
        {
            assertSplitsTokens('99 chars', _lineText.substr(0, 99), [
                '<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
                '<span class="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contain</span>',
            ]);
        }
        // A token with 100 chars
        {
            assertSplitsTokens('100 chars', _lineText.substr(0, 100), [
                '<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
                '<span class="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains</span>',
            ]);
        }
        // A token with 101 chars
        {
            assertSplitsTokens('101 chars', _lineText.substr(0, 101), [
                '<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
                '<span class="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains</span>',
                '<span class="mtk1">\u00a0</span>',
            ]);
        }
    });
    // issue #21476: Does not split large tokens when ligatures are on
    test('issue-21476', async () => {
        //                                                                                                                  1         1         1
        //                        1         2         3         4         5         6         7         8         9         0         1         2
        //               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
        const _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';
        function assertSplitsTokens(message, lineContent, expectedOutput) {
            const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
            const actual = renderViewLine(createRenderLineInput({
                lineContent,
                lineTokens,
                fontLigatures: true
            }));
            assert.strictEqual(actual.html, '<span>' + expectedOutput.join('') + '</span>', message);
        }
        // A token with 101 chars
        {
            assertSplitsTokens('101 chars', _lineText.substr(0, 101), [
                '<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0</span>',
                '<span class="mtk1">interesting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0</span>',
                '<span class="mtk1">contains\u00a0</span>',
            ]);
        }
    });
    // issue #20624: Unaligned surrogate pairs are corrupted at multiples of 50 columns
    test('issue-20624', async () => {
        const lineContent = 'a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷';
        const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: false,
            lineTokens
        }));
        await assertSnapshot(inflateRenderLineOutput(actual).html.join(''), HTML_EXTENSION);
    });
    // issue #6885: Does not split large tokens in RTL text
    test('issue-6885-rtl', async () => {
        const lineContent = 'את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.';
        const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: false,
            containsRTL: true,
            lineTokens
        }));
        await assertSnapshot(actual.html, HTML_EXTENSION);
    });
    // issue #95685: Uses unicode replacement character for Paragraph Separator
    test('issue-95685', async () => {
        const lineContent = 'var ftext = [\u2029"Und", "dann", "eines"];';
        const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            isBasicASCII: false,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #19673: Monokai Theme bad-highlighting in line wrap
    test('issue-19673', async () => {
        const lineContent = '    MongoCallback<string>): void {';
        const lineTokens = createViewLineTokens([
            createPart(17, 1),
            createPart(18, 2),
            createPart(24, 3),
            createPart(26, 4),
            createPart(27, 5),
            createPart(28, 6),
            createPart(32, 7),
            createPart(34, 8),
        ]);
        const _actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent,
            fauxIndentLength: 4,
            lineTokens
        }));
        const inflated = inflateRenderLineOutput(_actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
});
function assertCharacterMapping3(actual, expectedInfo) {
    for (let i = 0; i < expectedInfo.length; i++) {
        const [horizontalOffset, [partIndex, charIndex]] = expectedInfo[i];
        const actualDomPosition = actual.getDomPosition(i + 1);
        assert.deepStrictEqual(actualDomPosition, new DomPosition(partIndex, charIndex), `getDomPosition(${i + 1})`);
        let partLength = charIndex + 1;
        for (let j = i + 1; j < expectedInfo.length; j++) {
            const [, [nextPartIndex, nextCharIndex]] = expectedInfo[j];
            if (nextPartIndex === partIndex) {
                partLength = nextCharIndex + 1;
            }
            else {
                break;
            }
        }
        const actualColumn = actual.getColumn(new DomPosition(partIndex, charIndex), partLength);
        assert.strictEqual(actualColumn, i + 1, `actual.getColumn(${partIndex}, ${charIndex})`);
        const actualHorizontalOffset = actual.getHorizontalOffset(i + 1);
        assert.strictEqual(actualHorizontalOffset, horizontalOffset, `actual.getHorizontalOffset(${i + 1})`);
    }
    assert.strictEqual(actual.length, expectedInfo.length, `length mismatch`);
}
suite('renderViewLine2', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testCreateLineParts(fontIsMonospace, lineContent, tokens, fauxIndentLength, renderWhitespace, selections) {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: fontIsMonospace,
            lineContent,
            fauxIndentLength,
            lineTokens: createViewLineTokens(tokens),
            renderWhitespace,
            selectionsOnLine: selections
        }));
        return inflateRenderLineOutput(actual);
    }
    // issue #18616: Inline decorations ending at the text length are no longer rendered
    test('issue-18616', async () => {
        const lineContent = 'https://microsoft.com';
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens: createViewLineTokens([createPart(21, 3)]),
            lineDecorations: [new LineDecoration(1, 22, 'link', 0 /* InlineDecorationType.Regular */)]
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #19207: Link in Monokai is not rendered correctly
    test('issue-19207', async () => {
        const lineContent = '\'let url = `http://***/_api/web/lists/GetByTitle(\\\'Teambuildingaanvragen\\\')/items`;\'';
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent,
            lineTokens: createViewLineTokens([
                createPart(49, 6),
                createPart(51, 4),
                createPart(72, 6),
                createPart(74, 4),
                createPart(84, 6),
            ]),
            lineDecorations: [
                new LineDecoration(13, 51, 'detected-link', 0 /* InlineDecorationType.Regular */)
            ]
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // createLineParts simple
    test('simple', async () => {
        const actual = testCreateLineParts(false, 'Hello world!', [
            createPart(12, 1)
        ], 0, 'none', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts simple two tokens
    test('two-tokens', async () => {
        const actual = testCreateLineParts(false, 'Hello world!', [
            createPart(6, 1),
            createPart(12, 2)
        ], 0, 'none', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace - 4 leading spaces
    test('ws-4-leading', async () => {
        const actual = testCreateLineParts(false, '    Hello world!    ', [
            createPart(4, 1),
            createPart(6, 2),
            createPart(20, 3)
        ], 0, 'boundary', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace - 8 leading spaces
    test('ws-8-leading', async () => {
        const actual = testCreateLineParts(false, '        Hello world!        ', [
            createPart(8, 1),
            createPart(10, 2),
            createPart(28, 3)
        ], 0, 'boundary', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace - 2 leading tabs
    test('ws-2-tabs', async () => {
        const actual = testCreateLineParts(false, '\t\tHello world!\t', [
            createPart(2, 1),
            createPart(4, 2),
            createPart(15, 3)
        ], 0, 'boundary', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace - mixed leading spaces and tabs
    test('ws-mixed', async () => {
        const actual = testCreateLineParts(false, '  \t\t  Hello world! \t  \t   \t    ', [
            createPart(6, 1),
            createPart(8, 2),
            createPart(31, 3)
        ], 0, 'boundary', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace skips faux indent
    test('ws-faux-indent', async () => {
        const actual = testCreateLineParts(false, '\t\t  Hello world! \t  \t   \t    ', [
            createPart(4, 1),
            createPart(6, 2),
            createPart(29, 3)
        ], 2, 'boundary', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts does not emit width for monospace fonts
    test('ws-monospace', async () => {
        const actual = testCreateLineParts(true, '\t\t  Hello world! \t  \t   \t    ', [
            createPart(4, 1),
            createPart(6, 2),
            createPart(29, 3)
        ], 2, 'boundary', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace in middle but not for one space
    test('ws-middle', async () => {
        const actual = testCreateLineParts(false, 'it  it it  it', [
            createPart(6, 1),
            createPart(7, 2),
            createPart(13, 3)
        ], 0, 'boundary', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for all in middle
    test('ws-all-middle', async () => {
        const actual = testCreateLineParts(false, ' Hello world!\t', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(14, 2)
        ], 0, 'all', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for selection with no selections
    test('ws-sel-none', async () => {
        const actual = testCreateLineParts(false, ' Hello world!\t', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(14, 2)
        ], 0, 'selection', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for selection with whole line selection
    test('ws-sel-whole', async () => {
        const actual = testCreateLineParts(false, ' Hello world!\t', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(14, 2)
        ], 0, 'selection', [new OffsetRange(0, 14)]);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for selection with selection spanning part of whitespace
    test('ws-sel-partial', async () => {
        const actual = testCreateLineParts(false, ' Hello world!\t', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(14, 2)
        ], 0, 'selection', [new OffsetRange(0, 5)]);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for selection with multiple selections
    test('ws-sel-multiple', async () => {
        const actual = testCreateLineParts(false, ' Hello world!\t', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(14, 2)
        ], 0, 'selection', [new OffsetRange(0, 5), new OffsetRange(9, 14)]);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for selection with multiple, initially unsorted selections
    test('ws-sel-unsorted', async () => {
        const actual = testCreateLineParts(false, ' Hello world!\t', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(14, 2)
        ], 0, 'selection', [new OffsetRange(9, 14), new OffsetRange(0, 5)]);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for selection with selections next to each other
    test('ws-sel-adjacent', async () => {
        const actual = testCreateLineParts(false, ' * S', [
            createPart(4, 0)
        ], 0, 'selection', [new OffsetRange(0, 1), new OffsetRange(1, 2), new OffsetRange(2, 3)]);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for trailing with leading, inner, and without trailing whitespace
    test('ws-trail-no-trail', async () => {
        const actual = testCreateLineParts(false, ' Hello world!', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(14, 2)
        ], 0, 'trailing', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for trailing with leading, inner, and trailing whitespace
    test('ws-trail-with-trail', async () => {
        const actual = testCreateLineParts(false, ' Hello world! \t', [
            createPart(4, 0),
            createPart(6, 1),
            createPart(15, 2)
        ], 0, 'trailing', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for trailing with 8 leading and 8 trailing whitespaces
    test('ws-trail-8-8', async () => {
        const actual = testCreateLineParts(false, '        Hello world!        ', [
            createPart(8, 1),
            createPart(10, 2),
            createPart(28, 3)
        ], 0, 'trailing', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts render whitespace for trailing with line containing only whitespaces
    test('ws-trail-only', async () => {
        const actual = testCreateLineParts(false, ' \t ', [
            createPart(2, 0),
            createPart(3, 1),
        ], 0, 'trailing', null);
        await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
        await assertSnapshot(actual.mapping);
    });
    // createLineParts can handle unsorted inline decorations
    test('unsorted-deco', async () => {
        const actual = renderViewLine(createRenderLineInput({
            lineContent: 'Hello world',
            lineTokens: createViewLineTokens([createPart(11, 0)]),
            lineDecorations: [
                new LineDecoration(5, 7, 'a', 0 /* InlineDecorationType.Regular */),
                new LineDecoration(1, 3, 'b', 0 /* InlineDecorationType.Regular */),
                new LineDecoration(2, 8, 'c', 0 /* InlineDecorationType.Regular */),
            ]
        }));
        // 01234567890
        // Hello world
        // ----aa-----
        // bb---------
        // -cccccc----
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #11485: Visible whitespace conflicts with before decorator attachment
    test('issue-11485', async () => {
        const lineContent = '\tbla';
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens: createViewLineTokens([createPart(4, 3)]),
            lineDecorations: [new LineDecoration(1, 2, 'before', 1 /* InlineDecorationType.Before */)],
            renderWhitespace: 'all',
            fontLigatures: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #32436: Non-monospace font + visible whitespace + After decorator causes line to "jump"
    test('issue-32436', async () => {
        const lineContent = '\tbla';
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens: createViewLineTokens([createPart(4, 3)]),
            lineDecorations: [new LineDecoration(2, 3, 'before', 1 /* InlineDecorationType.Before */)],
            renderWhitespace: 'all',
            fontLigatures: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #30133: Empty lines don't render inline decorations
    test('issue-30133', async () => {
        const lineContent = '';
        const actual = renderViewLine(createRenderLineInput({
            lineContent,
            lineTokens: createViewLineTokens([createPart(0, 3)]),
            lineDecorations: [new LineDecoration(1, 2, 'before', 1 /* InlineDecorationType.Before */)],
            renderWhitespace: 'all',
            fontLigatures: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #37208: Collapsing bullet point containing emoji in Markdown document results in [??] character
    test('issue-37208', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: '  1. 🙏',
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(7, 3)]),
            lineDecorations: [new LineDecoration(7, 8, 'inline-folded', 2 /* InlineDecorationType.After */)],
            tabSize: 2,
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #37401 #40127: Allow both before and after decorations on empty line
    test('issue-37401', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: '',
            lineTokens: createViewLineTokens([createPart(0, 3)]),
            lineDecorations: [
                new LineDecoration(1, 1, 'before', 1 /* InlineDecorationType.Before */),
                new LineDecoration(1, 1, 'after', 2 /* InlineDecorationType.After */),
            ],
            tabSize: 2,
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #118759: enable multiple text editor decorations in empty lines
    test('issue-118759', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: '',
            lineTokens: createViewLineTokens([createPart(0, 3)]),
            lineDecorations: [
                new LineDecoration(1, 1, 'after1', 2 /* InlineDecorationType.After */),
                new LineDecoration(1, 1, 'after2', 2 /* InlineDecorationType.After */),
                new LineDecoration(1, 1, 'before1', 1 /* InlineDecorationType.Before */),
                new LineDecoration(1, 1, 'before2', 1 /* InlineDecorationType.Before */),
            ],
            tabSize: 2,
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #38935: GitLens end-of-line blame no longer rendering
    test('issue-38935', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: '\t}',
            lineTokens: createViewLineTokens([createPart(2, 3)]),
            lineDecorations: [
                new LineDecoration(3, 3, 'ced-TextEditorDecorationType2-5e9b9b3f-3 ced-TextEditorDecorationType2-3', 1 /* InlineDecorationType.Before */),
                new LineDecoration(3, 3, 'ced-TextEditorDecorationType2-5e9b9b3f-4 ced-TextEditorDecorationType2-4', 2 /* InlineDecorationType.After */),
            ],
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #136622: Inline decorations are not rendering on non-ASCII lines when renderControlCharacters is on
    test('issue-136622', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: 'some text £',
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(11, 3)]),
            lineDecorations: [
                new LineDecoration(5, 5, 'inlineDec1', 2 /* InlineDecorationType.After */),
                new LineDecoration(6, 6, 'inlineDec2', 1 /* InlineDecorationType.Before */),
            ],
            stopRenderingLineAfter: 10000,
            renderControlCharacters: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #22832: Consider fullwidth characters when rendering tabs
    test('issue-22832-1', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: 'asd = "擦"\t\t#asd',
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(15, 3)]),
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #22832: Consider fullwidth characters when rendering tabs (render whitespace)
    test('issue-22832-2', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: 'asd = "擦"\t\t#asd',
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(15, 3)]),
            stopRenderingLineAfter: 10000,
            renderWhitespace: 'all'
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #22352: COMBINING ACUTE ACCENT (U+0301)
    test('issue-22352-1', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: '12345689012345678901234568901234567890123456890abába',
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(53, 3)]),
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #22352: Partially Broken Complex Script Rendering of Tamil
    test('issue-22352-2', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: ' JoyShareல் பின்தொடர்ந்து, விடீயோ, ஜோக்குகள், அனிமேசன், நகைச்சுவை படங்கள் மற்றும் செய்திகளை பெறுவீர்',
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(100, 3)]),
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #42700: Hindi characters are not being rendered properly
    test('issue-42700', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: ' वो ऐसा क्या है जो हमारे अंदर भी है और बाहर भी है। जिसकी वजह से हम सब हैं। जिसने इस सृष्टि की रचना की है।',
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(105, 3)]),
            stopRenderingLineAfter: 10000
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #38123: editor.renderWhitespace: "boundary" renders whitespace at line wrap point when line is wrapped
    test('issue-38123', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            lineContent: 'This is a long line which never uses more than two spaces. ',
            continuesWithWrappedLine: true,
            lineTokens: createViewLineTokens([createPart(59, 3)]),
            stopRenderingLineAfter: 10000,
            renderWhitespace: 'boundary'
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #33525: Long line with ligatures takes a long time to paint decorations
    test('issue-33525-1', async () => {
        const actual = renderViewLine(createRenderLineInput({
            canUseHalfwidthRightwardsArrow: false,
            lineContent: 'append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to',
            lineTokens: createViewLineTokens([createPart(194, 3)]),
            stopRenderingLineAfter: 10000,
            fontLigatures: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #33525: Long line with ligatures takes a long time to paint decorations - not possible
    test('issue-33525-2', async () => {
        const actual = renderViewLine(createRenderLineInput({
            canUseHalfwidthRightwardsArrow: false,
            lineContent: 'appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato',
            lineTokens: createViewLineTokens([createPart(194, 3)]),
            stopRenderingLineAfter: 10000,
            fontLigatures: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #91936: Semantic token color highlighting fails on line with selected text
    test('issue-91936', async () => {
        const actual = renderViewLine(createRenderLineInput({
            lineContent: '                    else if ($s = 08) then \'\\b\'',
            lineTokens: createViewLineTokens([
                createPart(20, 1),
                createPart(24, 15),
                createPart(25, 1),
                createPart(27, 15),
                createPart(28, 1),
                createPart(29, 1),
                createPart(29, 1),
                createPart(31, 16),
                createPart(32, 1),
                createPart(33, 1),
                createPart(34, 1),
                createPart(36, 6),
                createPart(36, 1),
                createPart(37, 1),
                createPart(38, 1),
                createPart(42, 15),
                createPart(43, 1),
                createPart(47, 11)
            ]),
            stopRenderingLineAfter: 10000,
            renderWhitespace: 'selection',
            selectionsOnLine: [new OffsetRange(0, 47)],
            middotWidth: 11,
            wsmiddotWidth: 11
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #119416: Delete Control Character (U+007F / &#127;) displayed as space
    test('issue-119416', async () => {
        const actual = renderViewLine(createRenderLineInput({
            canUseHalfwidthRightwardsArrow: false,
            lineContent: '[' + String.fromCharCode(127) + '] [' + String.fromCharCode(0) + ']',
            lineTokens: createViewLineTokens([createPart(7, 3)]),
            stopRenderingLineAfter: 10000,
            renderControlCharacters: true,
            fontLigatures: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #116939: Important control characters aren't rendered
    test('issue-116939', async () => {
        const actual = renderViewLine(createRenderLineInput({
            canUseHalfwidthRightwardsArrow: false,
            lineContent: `transferBalance(5678,${String.fromCharCode(0x202E)}6776,4321${String.fromCharCode(0x202C)},"USD");`,
            isBasicASCII: false,
            lineTokens: createViewLineTokens([createPart(42, 3)]),
            stopRenderingLineAfter: 10000,
            renderControlCharacters: true
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    // issue #124038: Multiple end-of-line text decorations get merged
    test('issue-124038', async () => {
        const actual = renderViewLine(createRenderLineInput({
            useMonospaceOptimizations: true,
            canUseHalfwidthRightwardsArrow: false,
            lineContent: '    if',
            lineTokens: createViewLineTokens([createPart(4, 1), createPart(6, 2)]),
            lineDecorations: [
                new LineDecoration(7, 7, 'ced-1-TextEditorDecorationType2-17c14d98-3 ced-1-TextEditorDecorationType2-3', 1 /* InlineDecorationType.Before */),
                new LineDecoration(7, 7, 'ced-1-TextEditorDecorationType2-17c14d98-4 ced-1-TextEditorDecorationType2-4', 2 /* InlineDecorationType.After */),
                new LineDecoration(7, 7, 'ced-ghost-text-1-4', 2 /* InlineDecorationType.After */),
            ],
            stopRenderingLineAfter: 10000,
            renderWhitespace: 'all'
        }));
        const inflated = inflateRenderLineOutput(actual);
        await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
        await assertSnapshot(inflated.mapping);
    });
    function createTestGetColumnOfLinePartOffset(lineContent, tabSize, parts, expectedPartLengths) {
        const renderLineOutput = renderViewLine(createRenderLineInput({
            lineContent,
            tabSize,
            lineTokens: createViewLineTokens(parts)
        }));
        return (partIndex, partLength, offset, expected) => {
            const actualColumn = renderLineOutput.characterMapping.getColumn(new DomPosition(partIndex, offset), partLength);
            assert.strictEqual(actualColumn, expected, 'getColumn for ' + partIndex + ', ' + offset);
        };
    }
    test('getColumnOfLinePartOffset 1 - simple text', () => {
        const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset('hello world', 4, [
            createPart(11, 1)
        ], [11]);
        testGetColumnOfLinePartOffset(0, 11, 0, 1);
        testGetColumnOfLinePartOffset(0, 11, 1, 2);
        testGetColumnOfLinePartOffset(0, 11, 2, 3);
        testGetColumnOfLinePartOffset(0, 11, 3, 4);
        testGetColumnOfLinePartOffset(0, 11, 4, 5);
        testGetColumnOfLinePartOffset(0, 11, 5, 6);
        testGetColumnOfLinePartOffset(0, 11, 6, 7);
        testGetColumnOfLinePartOffset(0, 11, 7, 8);
        testGetColumnOfLinePartOffset(0, 11, 8, 9);
        testGetColumnOfLinePartOffset(0, 11, 9, 10);
        testGetColumnOfLinePartOffset(0, 11, 10, 11);
        testGetColumnOfLinePartOffset(0, 11, 11, 12);
    });
    test('getColumnOfLinePartOffset 2 - regular JS', () => {
        const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset('var x = 3;', 4, [
            createPart(3, 1),
            createPart(4, 2),
            createPart(5, 3),
            createPart(8, 4),
            createPart(9, 5),
            createPart(10, 6),
        ], [3, 1, 1, 3, 1, 1]);
        testGetColumnOfLinePartOffset(0, 3, 0, 1);
        testGetColumnOfLinePartOffset(0, 3, 1, 2);
        testGetColumnOfLinePartOffset(0, 3, 2, 3);
        testGetColumnOfLinePartOffset(0, 3, 3, 4);
        testGetColumnOfLinePartOffset(1, 1, 0, 4);
        testGetColumnOfLinePartOffset(1, 1, 1, 5);
        testGetColumnOfLinePartOffset(2, 1, 0, 5);
        testGetColumnOfLinePartOffset(2, 1, 1, 6);
        testGetColumnOfLinePartOffset(3, 3, 0, 6);
        testGetColumnOfLinePartOffset(3, 3, 1, 7);
        testGetColumnOfLinePartOffset(3, 3, 2, 8);
        testGetColumnOfLinePartOffset(3, 3, 3, 9);
        testGetColumnOfLinePartOffset(4, 1, 0, 9);
        testGetColumnOfLinePartOffset(4, 1, 1, 10);
        testGetColumnOfLinePartOffset(5, 1, 0, 10);
        testGetColumnOfLinePartOffset(5, 1, 1, 11);
    });
    test('getColumnOfLinePartOffset 3 - tab with tab size 6', () => {
        const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset('\t', 6, [
            createPart(1, 1)
        ], [6]);
        testGetColumnOfLinePartOffset(0, 6, 0, 1);
        testGetColumnOfLinePartOffset(0, 6, 1, 1);
        testGetColumnOfLinePartOffset(0, 6, 2, 1);
        testGetColumnOfLinePartOffset(0, 6, 3, 1);
        testGetColumnOfLinePartOffset(0, 6, 4, 2);
        testGetColumnOfLinePartOffset(0, 6, 5, 2);
        testGetColumnOfLinePartOffset(0, 6, 6, 2);
    });
    test('getColumnOfLinePartOffset 4 - once indented line, tab size 4', () => {
        const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset('\tfunction', 4, [
            createPart(1, 1),
            createPart(9, 2),
        ], [4, 8]);
        testGetColumnOfLinePartOffset(0, 4, 0, 1);
        testGetColumnOfLinePartOffset(0, 4, 1, 1);
        testGetColumnOfLinePartOffset(0, 4, 2, 1);
        testGetColumnOfLinePartOffset(0, 4, 3, 2);
        testGetColumnOfLinePartOffset(0, 4, 4, 2);
        testGetColumnOfLinePartOffset(1, 8, 0, 2);
        testGetColumnOfLinePartOffset(1, 8, 1, 3);
        testGetColumnOfLinePartOffset(1, 8, 2, 4);
        testGetColumnOfLinePartOffset(1, 8, 3, 5);
        testGetColumnOfLinePartOffset(1, 8, 4, 6);
        testGetColumnOfLinePartOffset(1, 8, 5, 7);
        testGetColumnOfLinePartOffset(1, 8, 6, 8);
        testGetColumnOfLinePartOffset(1, 8, 7, 9);
        testGetColumnOfLinePartOffset(1, 8, 8, 10);
    });
    test('getColumnOfLinePartOffset 5 - twice indented line, tab size 4', () => {
        const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset('\t\tfunction', 4, [
            createPart(2, 1),
            createPart(10, 2),
        ], [8, 8]);
        testGetColumnOfLinePartOffset(0, 8, 0, 1);
        testGetColumnOfLinePartOffset(0, 8, 1, 1);
        testGetColumnOfLinePartOffset(0, 8, 2, 1);
        testGetColumnOfLinePartOffset(0, 8, 3, 2);
        testGetColumnOfLinePartOffset(0, 8, 4, 2);
        testGetColumnOfLinePartOffset(0, 8, 5, 2);
        testGetColumnOfLinePartOffset(0, 8, 6, 2);
        testGetColumnOfLinePartOffset(0, 8, 7, 3);
        testGetColumnOfLinePartOffset(0, 8, 8, 3);
        testGetColumnOfLinePartOffset(1, 8, 0, 3);
        testGetColumnOfLinePartOffset(1, 8, 1, 4);
        testGetColumnOfLinePartOffset(1, 8, 2, 5);
        testGetColumnOfLinePartOffset(1, 8, 3, 6);
        testGetColumnOfLinePartOffset(1, 8, 4, 7);
        testGetColumnOfLinePartOffset(1, 8, 5, 8);
        testGetColumnOfLinePartOffset(1, 8, 6, 9);
        testGetColumnOfLinePartOffset(1, 8, 7, 10);
        testGetColumnOfLinePartOffset(1, 8, 8, 11);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0xpbmVSZW5kZXJlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVSZW5kZXJlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHekUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQy9FLE9BQU8sRUFBb0IsV0FBVyxFQUEyQixlQUFlLEVBQXFCLGVBQWUsSUFBSSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUvTCxPQUFPLEVBQUUsYUFBYSxFQUFFLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXpFLE1BQU0sY0FBYyxHQUFHLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBRTdDLFNBQVMsb0JBQW9CLENBQUMsY0FBK0I7SUFDNUQsT0FBTyxJQUFJLGNBQWMsQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUMzQyxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsUUFBZ0IsRUFBRSxVQUFrQjtJQUN2RCxPQUFPLElBQUksYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUNsQyxVQUFVLDZDQUFvQyxDQUM5QyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ1YsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQUMsZ0JBQW1DO0lBQ25FLHVEQUF1RDtJQUN2RCxJQUFJLElBQUks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QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3RCLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsd0RBQXdELEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUosV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSx5REFBeUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdLLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMs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QUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0MsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0MsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1FBQzlELE1BQU0sNkJBQTZCLEdBQUcsbUNBQW1DLENBQ3hFLElBQUksRUFDSixDQUFDLEVBQ0Q7WUFDQyxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUNoQixFQUNELENBQUMsQ0FBQyxDQUFDLENBQ0gsQ0FBQztRQUNGLDZCQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDZCQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDZCQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDZCQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDZCQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDZCQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDZCQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzNDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhEQUE4RCxFQUFFLEdBQUcsRUFBRTtRQUN6RSxNQUFNLDZCQUE2QixHQUFHLG1DQUFtQyxDQUN4RSxZQUFZLEVBQ1osQ0FBQyxFQUNEO1lBQ0MsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDaEIsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDaEIsRUFDRCxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FDTixDQUFDO1FBQ0YsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0RBQStELEVBQUUsR0FBRyxFQUFFO1FBQzFFLE1BQU0sNkJBQTZCLEdBQUcsbUNBQW1DLENBQ3hFLGNBQWMsRUFDZCxDQUFDLEVBQ0Q7WUFDQyxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNoQixVQUFVLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNqQixFQUNELENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUNOLENBQUM7UUFDRiw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM1QyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=