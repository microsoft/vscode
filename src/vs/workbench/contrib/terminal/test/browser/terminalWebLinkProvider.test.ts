/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { convertLinkRangeToBuffer, TerminalWebLinkProvider } from 'vs/workbench/contrib/terminal/browser/terminalWebLinkProvider';
import { IBufferLine, IBufferCell, Terminal, ILink, IBufferRange, IBufferCellPosition } from 'xterm';

suite('Workbench - TerminalWebLinkProvider', () => {
	suite('TerminalWebLinkProvider', () => {
		async function assertLink(text: string, expected: { text: string, range: [number, number][] }) {
			const xterm = new Terminal();
			const provider = new TerminalWebLinkProvider(xterm, () => { }, () => { }, () => { });

			// Write the text and wait for the parser to finish
			await new Promise<void>(r => xterm.write(text, r));

			// Calculate positions just outside of link boundaries
			const noLinkPositions: IBufferCellPosition[] = [
				{ x: expected.range[0][0] - 1, y: expected.range[0][1] },
				{ x: expected.range[1][0] + 1, y: expected.range[1][1] }
			];

			// Ensure outside positions do not detect the link
			for (let i = 0; i < noLinkPositions.length; i++) {
				const link = await new Promise<ILink | undefined>(r => provider.provideLink(noLinkPositions[i], r));
				assert.equal(link, undefined, `Just outside range boundary should not result in link, link found at: (${link?.range.start.x}, ${link?.range.start.y}) to (${link?.range.end.x}, ${link?.range.end.y})`);
			}

			// Convert range from [[startx, starty], [endx, endy]] to an IBufferRange
			const linkRange: IBufferRange = {
				start: { x: expected.range[0][0], y: expected.range[0][1] },
				end: { x: expected.range[1][0], y: expected.range[1][1] },
			};

			// Calculate positions inside the link boundaries
			const linkPositions: IBufferCellPosition[] = [
				linkRange.start,
				linkRange.end
			];

			// Ensure inside positions do detect the link
			for (let i = 0; i < linkPositions.length; i++) {
				const link = await new Promise<ILink | undefined>(r => provider.provideLink(linkPositions[i], r));

				assert.ok(link);
				assert.deepEqual(link!.text, expected.text);
				assert.deepEqual(link!.range, linkRange);
			}
		}

		// These tests are based on LinkComputer.test.ts
		test('LinkComputer cases', async () => {
			await assertLink('x = "http://foo.bar";', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('x = (http://foo.bar);', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('x = \'http://foo.bar\';', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('x =  http://foo.bar ;', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('x = <http://foo.bar>;', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('x = {http://foo.bar};', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('(see http://foo.bar)', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('[see http://foo.bar]', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('{see http://foo.bar}', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('<see http://foo.bar>', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('<url>http://foo.bar</url>', { range: [[6, 1], [19, 1]], text: 'http://foo.bar' });
			await assertLink('// Click here to learn more. https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409', { range: [[30, 1], [7, 2]], text: 'https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409' });
			await assertLink('// Click here to learn more. https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx', { range: [[30, 1], [28, 2]], text: 'https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx' });
			await assertLink('// https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js', { range: [[4, 1], [9, 2]], text: 'https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js' });
			await assertLink('<!-- !!! Do not remove !!!   WebContentRef(link:https://go.microsoft.com/fwlink/?LinkId=166007, area:Admin, updated:2015, nextUpdate:2016, tags:SqlServer)   !!! Do not remove !!! -->', { range: [[49, 1], [14, 2]], text: 'https://go.microsoft.com/fwlink/?LinkId=166007' });
			await assertLink('For instructions, see https://go.microsoft.com/fwlink/?LinkId=166007.</value>', { range: [[23, 1], [68, 1]], text: 'https://go.microsoft.com/fwlink/?LinkId=166007' });
			await assertLink('For instructions, see https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx.</value>', { range: [[23, 1], [21, 2]], text: 'https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx' });
			await assertLink('x = "https://en.wikipedia.org/wiki/Zürich";', { range: [[6, 1], [41, 1]], text: 'https://en.wikipedia.org/wiki/Zürich' });
			await assertLink('請參閱 http://go.microsoft.com/fwlink/?LinkId=761051。', { range: [[8, 1], [53, 1]], text: 'http://go.microsoft.com/fwlink/?LinkId=761051' });
			await assertLink('（請參閱 http://go.microsoft.com/fwlink/?LinkId=761051）', { range: [[10, 1], [55, 1]], text: 'http://go.microsoft.com/fwlink/?LinkId=761051' });
			await assertLink('x = "file:///foo.bar";', { range: [[6, 1], [20, 1]], text: 'file:///foo.bar' });
			await assertLink('x = "file://c:/foo.bar";', { range: [[6, 1], [22, 1]], text: 'file://c:/foo.bar' });
			await assertLink('x = "file://shares/foo.bar";', { range: [[6, 1], [26, 1]], text: 'file://shares/foo.bar' });
			await assertLink('x = "file://shäres/foo.bar";', { range: [[6, 1], [26, 1]], text: 'file://shäres/foo.bar' });
			await assertLink('Some text, then http://www.bing.com.', { range: [[17, 1], [35, 1]], text: 'http://www.bing.com' });
			await assertLink('let url = `http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items`;', { range: [[12, 1], [78, 1]], text: 'http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items' });
			await assertLink('7. At this point, ServiceMain has been called.  There is no functionality presently in ServiceMain, but you can consult the [MSDN documentation](https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx) to add functionality as desired!', { range: [[66, 2], [64, 3]], text: 'https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx' });
			await assertLink('let x = "http://[::1]:5000/connect/token"', { range: [[10, 1], [40, 1]], text: 'http://[::1]:5000/connect/token' });
			await assertLink('2. Navigate to **https://portal.azure.com**', { range: [[18, 1], [41, 1]], text: 'https://portal.azure.com' });
			await assertLink('POST|https://portal.azure.com|2019-12-05|', { range: [[6, 1], [29, 1]], text: 'https://portal.azure.com' });
			await assertLink('aa  https://foo.bar/[this is foo site]  aa', { range: [[5, 1], [38, 1]], text: 'https://foo.bar/[this is foo site]' });
		});
	});
	suite('convertLinkRangeToBuffer', () => {
		test('should convert ranges for ascii characters', () => {
			const lines = createBufferLineArray([
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/f/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
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
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 1, y: 1 },
				end: { x: 7 + 1, y: 2 }
			});
		});
		test('should convert ranges for wide characters inside the link', () => {
			const lines = createBufferLineArray([
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/文/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
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
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 1, y: 1 },
				end: { x: 7 + 2, y: 2 }
			});
		});
		test('should convert ranges for ascii characters (link starts on wrapped)', () => {
			const lines = createBufferLineArray([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/f/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
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
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 1, y: 2 },
				end: { x: 7 + 1, y: 3 }
			});
		});
		test('should convert ranges for wide characters inside the link (link starts on wrapped)', () => {
			const lines = createBufferLineArray([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/文/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4, y: 2 },
				end: { x: 7 + 1, y: 3 }
			});
		});
		test('should convert ranges for wide characters before and inside the link', () => {
			const lines = createBufferLineArray([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/文/', width: 9 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
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
			// This test ensures that the start offset is applies to the end before it's counted
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 4, y: 2 },
				end: { x: 7 + 4, y: 3 }
			});
		});
		test('should convert ranges for several wide characters before and inside the link', () => {
			const lines = createBufferLineArray([
				{ text: 'A文文AAAAAA', width: 11 },
				{ text: 'AA文文 http', width: 11 },
				{ text: '://t.com/文', width: 11 },
				{ text: '文/', width: 3 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 31, endLineNumber: 1 }, 0);
			// This test ensures that the start offset is applies to the end before it's counted
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 4, y: 2 },
				end: { x: 2, y: 4 }
			});
		});
	});
});

const TEST_WIDE_CHAR = '文';
const TEST_NULL_CHAR = 'C';

function createBufferLineArray(lines: { text: string, width: number }[]): IBufferLine[] {
	let result: IBufferLine[] = [];
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
		let cells: string = '';
		let offset = 0;
		for (let i = 0; i <= x - offset; i++) {
			const char = this._text.charAt(i);
			cells += char;
			if (this._text.charAt(i) === TEST_WIDE_CHAR) {
				// Skip the next character as it's width is 0
				cells += TEST_NULL_CHAR;
				offset++;
			}
		}
		return {
			getChars: () => {
				return x >= cells.length ? '' : cells.charAt(x);
			},
			getWidth: () => {
				switch (cells.charAt(x)) {
					case TEST_WIDE_CHAR: return 2;
					case TEST_NULL_CHAR: return 0;
					default: return 1;
				}
			}
		} as any;
	}
	translateToString(): string {
		throw new Error('Method not implemented.');
	}
}
