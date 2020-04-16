/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TerminalWebLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalWebLinkProvider';
import { Terminal, ILink, IBufferRange, IBufferCellPosition } from 'xterm';

suite('Workbench - TerminalWebLinkProvider', () => {
	async function assertLink(text: string, expected: { text: string, range: [number, number][] }) {
		const xterm = new Terminal();
		const provider = new TerminalWebLinkProvider(xterm, () => { }, () => { });

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
			assert.equal(link, undefined, `Just outside range boundary should not result in link, link found at (${link?.range.start.x}, ${link?.range.start.y}) to (${link?.range.end.x}, ${link?.range.end.y}) while checking (${noLinkPositions[i].x}, ${noLinkPositions[i].y})\nExpected link text=${expected.text}\nActual link text=${link?.text}`);
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
			assert.deepEqual(link?.text, expected.text);
			assert.deepEqual(link?.range, linkRange);
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
