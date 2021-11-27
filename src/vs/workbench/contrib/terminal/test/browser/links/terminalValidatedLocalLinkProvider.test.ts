/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TerminalValidatedLocalLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalValidatedLocalLinkProvider';
import { ILink, Terminal } from 'xterm';
import { OperatingSystem } from 'vs/base/common/platform';
import { format } from 'vs/base/common/strings';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IFileService } from 'vs/platform/files/common/files';
import { TestFileService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { URI } from 'vs/base/common/uri';
import { FileTerminalLink } from 'vs/workbench/contrib/terminal/browser/links/fileTerminalLink';

// Standard link providers use only `_xterm`, `userName`, `cwd`, `remoteAuthority`, `os` from `ITerminalInstance`.
const createStubTerminalInstance = (xterm?: Terminal, partial?: Partial<ITerminalInstance>) => {
	const os = partial?.os || OperatingSystem.Linux;
	return {
		_xterm: xterm,
		userHome: os === OperatingSystem.Windows ? 'C:\\Users\\Stub' : '/home/stub',
		cwd: os === OperatingSystem.Windows ? 'C:\\cwd' : '/cwd',
		os: os,
		...partial
	} as any as ITerminalInstance;
};

const unixLinks = [
	'/foo',
	'~/foo',
	'./foo',
	'./$foo',
	'../foo',
	'././foo/bar/../xyz',
	'/foo/bar',
	'/foo/bar+more',
	'foo/bar',
	'foo/bar+more',
	'foo/with spaces/bar',
	'foo/with more spaces/bar',
];

const windowsLinks = [
	'c:\\foo',
	'\\\\?\\c:\\foo',
	'c:/foo',
	'.\\foo',
	'./foo',
	'./$foo',
	'..\\foo',
	'../foo',
	'~\\foo',
	'~/foo',
	'c:/foo/bar',
	'c:\\foo\\bar',
	'c:\\foo\\bar+more',
	'c:\\foo/bar\\baz',
	'foo/bar',
	'foo/bar',
	'foo\\bar',
	'foo\\bar+more',
	'foo\\with spaces\\bar',
	'foo\\with more spaces\\bar',
];

interface LinkFormatInfo {
	urlFormat: string;
	line?: number;
	column?: number;
}
const supportedLinkFormats: LinkFormatInfo[] = [
	{ urlFormat: '{0}' },
	{ urlFormat: '{0} on line {1}', line: 5 },
	{ urlFormat: '{0} on line {1}, column {2}', line: 5, column: 3 },
	{ urlFormat: '{0}:line {1}', line: 5 },
	{ urlFormat: '{0}:line {1}, column {2}', line: 5, column: 3 },
	{ urlFormat: '{0}({1})', line: 5 },
	{ urlFormat: '{0} ({1})', line: 5 },
	{ urlFormat: '{0}({1},{2})', line: 5, column: 3 },
	{ urlFormat: '{0} ({1},{2})', line: 5, column: 3 },
	{ urlFormat: '{0}({1}, {2})', line: 5, column: 3 },
	{ urlFormat: '{0} ({1}, {2})', line: 5, column: 3 },
	{ urlFormat: '{0}:{1}', line: 5 },
	{ urlFormat: '{0}:{1}:{2}', line: 5, column: 3 },
	{ urlFormat: '{0}[{1}]', line: 5 },
	{ urlFormat: '{0} [{1}]', line: 5 },
	{ urlFormat: '{0}[{1},{2}]', line: 5, column: 3 },
	{ urlFormat: '{0} [{1},{2}]', line: 5, column: 3 },
	{ urlFormat: '{0}[{1}, {2}]', line: 5, column: 3 },
	{ urlFormat: '{0} [{1}, {2}]', line: 5, column: 3 },
	{ urlFormat: '{0}, line {1} column {2}', line: 5, column: 3 }, // [see #40468]
	{ urlFormat: '{0},{1}', line: 5 }, // [see #78205]
];

interface LinkExpectationInfo {
	prefix: string;
	suffix: string;
	name: string;
	spaces: boolean;
}
const pathEncapsulations: LinkExpectationInfo[] = [
	{ prefix: '', suffix: '', name: 'none', spaces: false },
	{ prefix: '\'', suffix: '\'', name: 'single quote', spaces: true },
	{ prefix: '"', suffix: '"', name: 'double quote', spaces: true },
	{ prefix: '`', suffix: '`', name: 'back quote', spaces: true },
	{ prefix: '(', suffix: ')', name: 'round brackets', spaces: true },
	{ prefix: '[', suffix: ']', name: 'square brackets', spaces: true },
];

// Note: clickable label =/= path
interface LinkExpectation {
	uri?: URI;
	path?: string;
	line?: number;
	column?: number;
	/**
	 * Clickable label range start/end, i.e `foo [path/file.txt] bar` have
	 * start at 5, end at 19, while path is still `path/file.txt`.
	 */
	range?: {
		start: number;
		end: number;
	}
}

suite('Workbench - TerminalValidatedLocalLinkProvider', () => {
	let instantiationService: TestInstantiationService;

	setup(() => {
		// TestFileService (for default) resolves all paths as existing file.
		const services = new ServiceCollection();
		services.set(IFileService, new TestFileService());
		instantiationService = new TestInstantiationService(services);
		instantiationService.stub(IConfigurationService, TestConfigurationService);
	});

	async function assertLink(text: string, os: OperatingSystem, expectations: LinkExpectation[]) {
		// Prepare the provider with stub terminal
		const xterm = new Terminal();
		const terminal = createStubTerminalInstance(xterm, { os });
		const provider = instantiationService.createInstance(TerminalValidatedLocalLinkProvider, terminal);

		// Write the text and wait for the parser to finish
		await new Promise<void>(r => xterm.write(text, r));

		// Ensure all links are provided
		const links = (await new Promise<ILink[] | undefined>(r => provider.provideLinks(1, r)))!;

		assert.strictEqual(links.length, expectations.length);

		// Every link in test is being resolved as existing file (default TestFileService).
		assert(links.every(link => link instanceof FileTerminalLink));

		for (let i = 0; i < links.length; i++) {
			const actual = links[i] as FileTerminalLink;
			const expected = expectations[i];
			const expectedUri = expected.uri || URI.file(provider._preprocessPath(expected.path) || '');

			// Check link URIs paths
			assert.strictEqual(actual.uri.fsPath, expectedUri.fsPath);

			if (expected.line) {
				assert.strictEqual(actual.line, expected.line);
			}
			if (expected.column) {
				assert.strictEqual(actual.column, expected.column);
			}

			if (expected.range) {
				assert.deepStrictEqual(actual.range, {
					start: { x: expected.range.start, y: 1 },
					end: { x: expected.range.end, y: 1 },
				});
			}
		}
	}

	for (const [os, osName, linksArray] of [
		[OperatingSystem.Linux, 'Linux/macOS', unixLinks],
		[OperatingSystem.Windows, 'Windows', windowsLinks],
	] as const) {
		suite(osName, () => {
			for (const baseLink of linksArray) {
				const hasSpaces = baseLink.includes(' ');
				suite(`Link: '${baseLink}'${hasSpaces ? ' (with spaces)' : ''}`, () => {
					for (const { prefix, suffix, name, spaces } of pathEncapsulations) {
						// Omit path encapsulations without spaces support
						if (hasSpaces && !spaces) {
							continue;
						}

						suite(`Path encapsulation: ${name}`, () => {
							for (const linkFormat of supportedLinkFormats) {
								test(`Format: '${linkFormat.urlFormat}'`, async () => {
									const formattedLink = format(linkFormat.urlFormat, `${prefix}${baseLink}${suffix}`, linkFormat.line, linkFormat.column);
									await assertLink(formattedLink, os, [{
										path: baseLink,
										line: linkFormat.line,
										column: linkFormat.column,
										range: { start: 1, end: formattedLink.length },
									}]);
								});
							}
						});
					}
				});
			}

			test('Git diff links', async () => {
				await assertLink(`diff --git a/foo/bar b/foo/bar`, os, [
					{ path: 'foo/bar', range: { start: 12, end: 20 } },
					{ path: 'foo/bar', range: { start: 22, end: 30 } },
				]);
				await assertLink(`--- a/foo/bar`, os, [
					{ path: 'foo/bar', range: { start: 5, end: 13 } },
				]);
				await assertLink(`+++ b/foo/bar`, os, [
					{ path: 'foo/bar', range: { start: 5, end: 13 } },
				]);
			});
		});
	}
});
