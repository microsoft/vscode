/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { convertLinkRangeToBuffer } from '../../browser/terminalLinkHelpers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
suite('Workbench - Terminal Link Helpers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('convertLinkRangeToBuffer', () => {
        test('should convert ranges for ascii characters', () => {
            const lines = createBufferLineArray([
                { text: 'AA http://t', width: 11 },
                { text: '.com/f/', width: 8 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4, y: 1 },
                end: { x: 7, y: 2 }
            });
        });
        test('should convert ranges for wide characters before the link', () => {
            const lines = createBufferLineArray([
                { text: 'A文 http://', width: 11 },
                { text: 't.com/f/', width: 9 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4 + 1, y: 1 },
                end: { x: 7 + 1, y: 2 }
            });
        });
        test('should give correct range for links containing multi-character emoji', () => {
            const lines = createBufferLineArray([
                { text: 'A🙂 http://', width: 11 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 0 + 1, startLineNumber: 1, endColumn: 2 + 1, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 1, y: 1 },
                end: { x: 2, y: 1 }
            });
        });
        test('should convert ranges for combining characters before the link', () => {
            const lines = createBufferLineArray([
                { text: 'A🙂 http://', width: 11 },
                { text: 't.com/f/', width: 9 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4 + 1, startLineNumber: 1, endColumn: 19 + 1, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 6, y: 1 },
                end: { x: 9, y: 2 }
            });
        });
        test('should convert ranges for wide characters inside the link', () => {
            const lines = createBufferLineArray([
                { text: 'AA http://t', width: 11 },
                { text: '.com/文/', width: 8 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4, y: 1 },
                end: { x: 7 + 1, y: 2 }
            });
        });
        test('should convert ranges for wide characters before and inside the link', () => {
            const lines = createBufferLineArray([
                { text: 'A文 http://', width: 11 },
                { text: 't.com/文/', width: 9 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4 + 1, y: 1 },
                end: { x: 7 + 2, y: 2 }
            });
        });
        test('should convert ranges for emoji before and wide inside the link', () => {
            const lines = createBufferLineArray([
                { text: 'A🙂 http://', width: 11 },
                { text: 't.com/文/', width: 9 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4 + 1, startLineNumber: 1, endColumn: 19 + 1, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 6, y: 1 },
                end: { x: 10 + 1, y: 2 }
            });
        });
        test('should convert ranges for ascii characters (link starts on wrapped)', () => {
            const lines = createBufferLineArray([
                { text: 'AAAAAAAAAAA', width: 11 },
                { text: 'AA http://t', width: 11 },
                { text: '.com/f/', width: 8 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4, y: 2 },
                end: { x: 7, y: 3 }
            });
        });
        test('should convert ranges for wide characters before the link (link starts on wrapped)', () => {
            const lines = createBufferLineArray([
                { text: 'AAAAAAAAAAA', width: 11 },
                { text: 'A文 http://', width: 11 },
                { text: 't.com/f/', width: 9 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4 + 1, y: 2 },
                end: { x: 7 + 1, y: 3 }
            });
        });
        test('regression test #147619: 获取模板 25235168 的预览图失败', () => {
            const lines = createBufferLineArray([
                { text: '获取模板 25235168 的预览图失败', width: 30 }
            ]);
            assert.deepStrictEqual(convertLinkRangeToBuffer(lines, 30, {
                startColumn: 1,
                startLineNumber: 1,
                endColumn: 5,
                endLineNumber: 1
            }, 0), {
                start: { x: 1, y: 1 },
                end: { x: 8, y: 1 }
            });
            assert.deepStrictEqual(convertLinkRangeToBuffer(lines, 30, {
                startColumn: 6,
                startLineNumber: 1,
                endColumn: 14,
                endLineNumber: 1
            }, 0), {
                start: { x: 10, y: 1 },
                end: { x: 17, y: 1 }
            });
            assert.deepStrictEqual(convertLinkRangeToBuffer(lines, 30, {
                startColumn: 15,
                startLineNumber: 1,
                endColumn: 21,
                endLineNumber: 1
            }, 0), {
                start: { x: 19, y: 1 },
                end: { x: 30, y: 1 }
            });
        });
        test('should convert ranges for wide characters inside the link (link starts on wrapped)', () => {
            const lines = createBufferLineArray([
                { text: 'AAAAAAAAAAA', width: 11 },
                { text: 'AA http://t', width: 11 },
                { text: '.com/文/', width: 8 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4, y: 2 },
                end: { x: 7 + 1, y: 3 }
            });
        });
        test('should convert ranges for wide characters before and inside the link #2', () => {
            const lines = createBufferLineArray([
                { text: 'AAAAAAAAAAA', width: 11 },
                { text: 'A文 http://', width: 11 },
                { text: 't.com/文/', width: 9 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
            assert.deepStrictEqual(bufferRange, {
                start: { x: 4 + 1, y: 2 },
                end: { x: 7 + 2, y: 3 }
            });
        });
        test('should convert ranges for several wide characters before the link', () => {
            const lines = createBufferLineArray([
                { text: 'A文文AAAAAA', width: 11 },
                { text: 'AA文文 http', width: 11 },
                { text: '://t.com/f/', width: 11 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
            // This test ensures that the start offset is applied to the end before it's counted
            assert.deepStrictEqual(bufferRange, {
                start: { x: 3 + 4, y: 2 },
                end: { x: 6 + 4, y: 3 }
            });
        });
        test('should convert ranges for several wide characters before and inside the link', () => {
            const lines = createBufferLineArray([
                { text: 'A文文AAAAAA', width: 11 },
                { text: 'AA文文 http', width: 11 },
                { text: '://t.com/文', width: 11 },
                { text: '文/', width: 3 }
            ]);
            const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 14, startLineNumber: 1, endColumn: 31, endLineNumber: 1 }, 0);
            // This test ensures that the start offset is applies to the end before it's counted
            assert.deepStrictEqual(bufferRange, {
                start: { x: 5, y: 2 },
                end: { x: 1, y: 4 }
            });
        });
    });
});
const TEST_WIDE_CHAR = '文';
const TEST_NULL_CHAR = 'C';
function createBufferLineArray(lines) {
    const result = [];
    lines.forEach((l, i) => {
        result.push(new TestBufferLine(l.text, l.width, i + 1 !== lines.length));
    });
    return result;
}
class TestBufferLine {
    constructor(_text, length, isWrapped) {
        this._text = _text;
        this.length = length;
        this.isWrapped = isWrapped;
    }
    getCell(x) {
        // Create a fake line of cells and use that to resolve the width
        const cells = [];
        let wideNullCellOffset = 0; // There is no null 0 width char after a wide char
        const emojiOffset = 0; // Skip chars as emoji are multiple characters
        for (let i = 0; i <= x - wideNullCellOffset + emojiOffset; i++) {
            let char = this._text.charAt(i);
            if (char === '\ud83d') {
                // Make "🙂"
                char += '\ude42';
            }
            cells.push(char);
            if (this._text.charAt(i) === TEST_WIDE_CHAR || char.charCodeAt(0) > 255) {
                // Skip the next character as it's width is 0
                cells.push(TEST_NULL_CHAR);
                wideNullCellOffset++;
            }
        }
        // eslint-disable-next-line local/code-no-any-casts
        return {
            getChars: () => {
                return x >= cells.length ? '' : cells[x];
            },
            getWidth: () => {
                switch (cells[x]) {
                    case TEST_WIDE_CHAR: return 2;
                    case TEST_NULL_CHAR: return 0;
                    default: {
                        // Naive measurement, assume anything our of ascii in tests are wide
                        if (cells[x].charCodeAt(0) > 255) {
                            return 2;
                        }
                        return 1;
                    }
                }
            }
        };
    }
    translateToString() {
        throw new Error('Method not implemented.');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rSGVscGVycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbExpbmtIZWxwZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLEtBQUssQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7SUFDL0MsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7WUFDdkQsTUFBTSxLQUFLLEdBQUcscUJBQXFCLENBQUM7Z0JBQ25DLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFO2dCQUNsQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRTthQUM3QixDQUFDLENBQUM7WUFDSCxNQUFNLFdBQVcsR0FBRyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3BJLE1BQU0sQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFO2dCQUNuQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFD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