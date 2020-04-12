/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TerminalRegexLocalLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalRegexLocalLinkProvider';
import { Terminal, ILink, IBufferRange, IBufferCellPosition } from 'xterm';
import { OperatingSystem } from 'vs/base/common/platform';

suite('Workbench - TerminalRegexLocalLinkProvider', () => {
	async function assertLink(text: string, expected: { text: string, range: [number, number][] }) {
		const xterm = new Terminal();
		// TODO: Test process manager
		const provider = new TerminalRegexLocalLinkProvider(xterm, OperatingSystem.Linux, () => { }, () => { }, () => { }, (_, cb) => { cb(true); });

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
			assert.equal(link, undefined, `Just outside range boundary should not result in link, link found at (${link?.range.start.x}, ${link?.range.start.y}) to (${link?.range.end.x}, ${link?.range.end.y}) while checking (${noLinkPositions[i].x}, ${noLinkPositions[i].y})`);
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
	test('Simple unix paths', async () => {
		await assertLink('"/foo"', { range: [[2, 1], [5, 1]], text: '/foo' });
	});
});
