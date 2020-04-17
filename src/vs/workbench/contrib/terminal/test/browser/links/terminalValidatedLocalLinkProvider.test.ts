/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TerminalValidatedLocalLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalValidatedLocalLinkProvider';
import { Terminal, ILink, IBufferRange, IBufferCellPosition } from 'xterm';
import { OperatingSystem } from 'vs/base/common/platform';
import { format } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

const unixLinks = [
	'/foo',
	'~/foo',
	'./foo',
	'../foo',
	'/foo/bar',
	'foo/bar'
];

const windowsLinks = [
	'c:\\foo',
	'\\\\?\\c:\\foo',
	'c:/foo',
	'.\\foo',
	'./foo',
	'..\\foo',
	'~\\foo',
	'~/foo',
	'c:/foo/bar',
	'c:\\foo\\bar',
	'c:\\foo/bar\\baz',
	'foo/bar',
	'foo/bar',
	'foo\\bar'
];

interface LinkFormatInfo {
	urlFormat: string;
	line?: string;
	column?: string;
}

const supportedLinkFormats: LinkFormatInfo[] = [
	{ urlFormat: '{0}' },
	{ urlFormat: '{0} on line {1}', line: '5' },
	{ urlFormat: '{0} on line {1}, column {2}', line: '5', column: '3' },
	{ urlFormat: '{0}:line {1}', line: '5' },
	{ urlFormat: '{0}:line {1}, column {2}', line: '5', column: '3' },
	{ urlFormat: '{0}({1})', line: '5' },
	{ urlFormat: '{0} ({1})', line: '5' },
	{ urlFormat: '{0}({1},{2})', line: '5', column: '3' },
	{ urlFormat: '{0} ({1},{2})', line: '5', column: '3' },
	{ urlFormat: '{0}({1}, {2})', line: '5', column: '3' },
	{ urlFormat: '{0} ({1}, {2})', line: '5', column: '3' },
	{ urlFormat: '{0}:{1}', line: '5' },
	{ urlFormat: '{0}:{1}:{2}', line: '5', column: '3' },
	{ urlFormat: '{0}[{1}]', line: '5' },
	{ urlFormat: '{0} [{1}]', line: '5' },
	{ urlFormat: '{0}[{1},{2}]', line: '5', column: '3' },
	{ urlFormat: '{0} [{1},{2}]', line: '5', column: '3' },
	{ urlFormat: '{0}[{1}, {2}]', line: '5', column: '3' },
	{ urlFormat: '{0} [{1}, {2}]', line: '5', column: '3' },
	{ urlFormat: '{0}",{1}', line: '5' }
];

suite('Workbench - TerminalValidatedLocalLinkProvider', () => {
	async function assertLink(text: string, os: OperatingSystem, expected: { text: string, range: [number, number][] }) {
		const xterm = new Terminal();
		const provider = new TerminalValidatedLocalLinkProvider(xterm, os, () => { }, () => { }, () => { }, (_, cb) => { cb({ uri: URI.file('/'), isDirectory: false }); });

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

	suite('Linux/macOS', () => {
		unixLinks.forEach(baseLink => {
			suite(`Link: ${baseLink}`, () => {
				for (let i = 0; i < supportedLinkFormats.length; i++) {
					const linkFormat = supportedLinkFormats[i];
					test(`Format: ${linkFormat.urlFormat}`, async () => {
						const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
						await assertLink(formattedLink, OperatingSystem.Linux, { text: formattedLink, range: [[1, 1], [formattedLink.length, 1]] });
						await assertLink(` ${formattedLink} `, OperatingSystem.Linux, { text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] });
						await assertLink(`(${formattedLink})`, OperatingSystem.Linux, { text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] });
						await assertLink(`[${formattedLink}]`, OperatingSystem.Linux, { text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] });
					});
				}
			});
		});
	});

	suite('Windows', () => {
		windowsLinks.forEach(baseLink => {
			suite(`Link "${baseLink}"`, () => {
				for (let i = 0; i < supportedLinkFormats.length; i++) {
					const linkFormat = supportedLinkFormats[i];
					test(`Format: ${linkFormat.urlFormat}`, async () => {
						const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
						await assertLink(formattedLink, OperatingSystem.Windows, { text: formattedLink, range: [[1, 1], [formattedLink.length, 1]] });
						await assertLink(` ${formattedLink} `, OperatingSystem.Windows, { text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] });
						await assertLink(`(${formattedLink})`, OperatingSystem.Windows, { text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] });
						await assertLink(`[${formattedLink}]`, OperatingSystem.Windows, { text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] });
					});
				}
			});
		});
	});
});
