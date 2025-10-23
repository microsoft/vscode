/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IBufferLine, IBufferCell } from '@xterm/xterm';
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

function createBufferLineArray(lines: { text: string; width: number }[]): IBufferLine[] {
	const result: IBufferLine[] = [];
	lines.forEach((l, i) => {
		result.push(new TestBufferLine(
			l.text,
			l.width,
			i + 1 !== lines.length
		));
	});
	return result;
}

class TestBufferLine implements IBufferLine {
	constructor(
		private _text: string,
		public length: number,
		public isWrapped: boolean
	) {

	}
	getCell(x: number): IBufferCell | undefined {
		// Create a fake line of cells and use that to resolve the width
		const cells: string[] = [];
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
		} as any;
	}
	translateToString(): string {
		throw new Error('Method not implemented.');
	}
}
