/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows, OperatingSystem } from 'vs/base/common/platform';
import { format } from 'vs/base/common/strings';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITerminalLinkResolverService, ITerminalSimpleLink, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { TerminalLocalLinkDetector } from 'vs/workbench/contrib/terminal/browser/links/terminalLocalLinkDetector';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { assertLinkHelper } from 'vs/workbench/contrib/terminal/test/browser/links/linkTestUtils';
import { Terminal } from 'xterm';
import { timeout } from 'vs/base/common/async';
import { strictEqual } from 'assert';
import { TerminalLinkResolverService } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkResolverService';
import { IFileService } from 'vs/platform/files/common/files';
import { createFileStat } from 'vs/workbench/test/common/workbenchTestServices';
import { URI } from 'vs/base/common/uri';

const unixLinks: (string | { link: string; resource: URI })[] = [
	// Absolute
	'/foo',
	'/foo/bar',
	'/foo/[bar]',
	'/foo/[bar].baz',
	'/foo/[bar]/baz',
	'/foo/bar+more',
	// User home
	{ link: '~/foo', resource: URI.file('/home/foo') },
	// Relative
	{ link: './foo', resource: URI.file('/parent/cwd/foo') },
	{ link: './$foo', resource: URI.file('/parent/cwd/$foo') },
	{ link: '../foo', resource: URI.file('/parent/foo') },
	{ link: 'foo/bar', resource: URI.file('/parent/cwd/foo/bar') },
	{ link: 'foo/bar+more', resource: URI.file('/parent/cwd/foo/bar+more') },
];

const windowsLinks: (string | { link: string; resource: URI })[] = [
	// Absolute
	'c:\\foo',
	'\\\\?\\c:\\foo',
	'c:/foo',
	'c:/foo/bar',
	'c:\\foo\\bar',
	'c:\\foo\\bar+more',
	'c:\\foo/bar\\baz',
	// User home
	{ link: '~\\foo', resource: URI.file('C:\\Home\\foo') },
	{ link: '~/foo', resource: URI.file('C:\\Home\\foo') },
	// Relative
	{ link: '.\\foo', resource: URI.file('C:\\Parent\\Cwd\\foo') },
	{ link: './foo', resource: URI.file('C:\\Parent\\Cwd\\foo') },
	{ link: './$foo', resource: URI.file('C:\\Parent\\Cwd\\$foo') },
	{ link: '..\\foo', resource: URI.file('C:\\Parent\\foo') },
	{ link: 'foo/bar', resource: URI.file('C:\\Parent\\Cwd\\foo\\bar') },
	{ link: 'foo/bar', resource: URI.file('C:\\Parent\\Cwd\\foo\\bar') },
	{ link: 'foo/[bar]', resource: URI.file('C:\\Parent\\Cwd\\foo\\[bar]') },
	{ link: 'foo/[bar].baz', resource: URI.file('C:\\Parent\\Cwd\\foo\\[bar].baz') },
	{ link: 'foo/[bar]/baz', resource: URI.file('C:\\Parent\\Cwd\\foo\\[bar]/baz') },
	{ link: 'foo\\bar', resource: URI.file('C:\\Parent\\Cwd\\foo\\bar') },
	{ link: 'foo\\[bar].baz', resource: URI.file('C:\\Parent\\Cwd\\foo\\[bar].baz') },
	{ link: 'foo\\[bar]\\baz', resource: URI.file('C:\\Parent\\Cwd\\foo\\[bar]\\baz') },
	{ link: 'foo\\bar+more', resource: URI.file('C:\\Parent\\Cwd\\foo\\bar+more') },
];

interface LinkFormatInfo {
	urlFormat: string;
	resolvedFormat?: string;
	/**
	 * The start offset to the buffer range that is not in the actual link (but is in the matched
	 * area.
	 */
	linkCellStartOffset?: number;
	/**
	 * The end offset to the buffer range that is not in the actual link (but is in the matched
	 * area.
	 */
	linkCellEndOffset?: number;
	line?: string;
	column?: string;
}

const supportedLinkFormats: LinkFormatInfo[] = [
	{ urlFormat: '{0}' },
	{ urlFormat: '{0}" on line {1}', line: '5' },
	{ urlFormat: '{0}" on line {1}, column {2}', line: '5', column: '3' },
	{ urlFormat: '{0}":line {1}', line: '5' },
	{ urlFormat: '{0}":line {1}, column {2}', line: '5', column: '3' },
	{ urlFormat: '{0}": line {1}', line: '5' },
	{ urlFormat: '{0}": line {1}, col {2}', line: '5', column: '3' },
	{ urlFormat: '{0}({1})', line: '5' },
	{ urlFormat: '{0} ({1})', line: '5' },
	{ urlFormat: '{0}({1},{2})', line: '5', column: '3' },
	{ urlFormat: '{0} ({1},{2})', line: '5', column: '3' },
	{ urlFormat: '{0}({1}, {2})', line: '5', column: '3' },
	{ urlFormat: '{0} ({1}, {2})', line: '5', column: '3' },
	{ urlFormat: '{0}:{1}', line: '5' },
	{ urlFormat: '{0}:{1}:{2}', line: '5', column: '3' },
	{ urlFormat: '{0} {1}:{2}', line: '5', column: '3' },
	{ urlFormat: '{0}[{1}]', line: '5' },
	{ urlFormat: '{0} [{1}]', line: '5' },
	{ urlFormat: '{0}[{1},{2}]', line: '5', column: '3' },
	{ urlFormat: '{0} [{1},{2}]', line: '5', column: '3' },
	{ urlFormat: '{0}[{1}, {2}]', line: '5', column: '3' },
	{ urlFormat: '{0} [{1}, {2}]', line: '5', column: '3' },
	{ urlFormat: '{0}",{1}', line: '5' },
	{ urlFormat: '{0}\',{1}', line: '5' }
];

const windowsFallbackLinks: (string | { link: string; resource: URI })[] = [
	'C:\\foo bar',
	'C:\\foo bar\\baz',
	'C:\\foo\\bar baz'
];

const supportedFallbackLinkFormats: LinkFormatInfo[] = [
	// Python style error: File "<path>", line <line>
	{ urlFormat: 'File "{0}"', resolvedFormat: '{0}', linkCellStartOffset: 5 },
	{ urlFormat: 'File "{0}", line {1}', line: '5', resolvedFormat: '{0}:{1}', linkCellStartOffset: 5 },
	// A C++ compile error
	{ urlFormat: '{0}({1},{2}) :', line: '5', column: '3', resolvedFormat: '{0}:{1}:{2}', linkCellEndOffset: -2 },
	// The whole line is the path
	{ urlFormat: '{0}' },
];

suite('Workbench - TerminalLocalLinkDetector', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let detector: TerminalLocalLinkDetector;
	let xterm: Terminal;
	let validResources: URI[];

	async function assertLinks(
		type: TerminalBuiltinLinkType,
		text: string,
		expected: (Pick<ITerminalSimpleLink, 'text'> & { range: [number, number][] })[]
	) {
		const race = await Promise.race([
			assertLinkHelper(text, expected, detector, type).then(() => 'success'),
			timeout(2).then(() => 'timeout')
		]);
		strictEqual(race, 'success', `Awaiting link assertion for "${text}" timed out`);
	}

	async function assertLinksWithWrapped(link: string) {
		await assertLinks(TerminalBuiltinLinkType.LocalFile, link, [{ text: link, range: [[1, 1], [link.length, 1]] }]);
		await assertLinks(TerminalBuiltinLinkType.LocalFile, ` ${link} `, [{ text: link, range: [[2, 1], [link.length + 1, 1]] }]);
		await assertLinks(TerminalBuiltinLinkType.LocalFile, `(${link})`, [{ text: link, range: [[2, 1], [link.length + 1, 1]] }]);
		await assertLinks(TerminalBuiltinLinkType.LocalFile, `[${link}]`, [{ text: link, range: [[2, 1], [link.length + 1, 1]] }]);
	}

	setup(() => {
		instantiationService = new TestInstantiationService();
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, {
			async stat(resource) {
				if (!validResources.map(e => e.path).includes(resource.path)) {
					throw new Error('Doesn\'t exist');
				}
				return createFileStat(resource);
			}
		});
		instantiationService.set(ITerminalLinkResolverService, instantiationService.createInstance(TerminalLinkResolverService));
		validResources = [];

		xterm = new Terminal({ allowProposedApi: true, cols: 80, rows: 30 });
	});

	suite('platform independent', () => {
		setup(() => {
			detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, new TerminalCapabilityStore(), {
				initialCwd: '/parent/cwd',
				os: OperatingSystem.Linux,
				remoteAuthority: undefined,
				userHome: '/home',
				backend: undefined
			});
		});

		test('should support multiple link results', async () => {
			validResources = [
				URI.file('/parent/cwd/foo'),
				URI.file('/parent/cwd/bar')
			];
			await assertLinks(TerminalBuiltinLinkType.LocalFile, './foo ./bar', [
				{ range: [[1, 1], [5, 1]], text: './foo' },
				{ range: [[7, 1], [11, 1]], text: './bar' }
			]);
		});
	});

	suite('macOS/Linux', () => {
		setup(() => {
			detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, new TerminalCapabilityStore(), {
				initialCwd: '/parent/cwd',
				os: OperatingSystem.Linux,
				remoteAuthority: undefined,
				userHome: '/home',
				backend: undefined
			});
		});

		for (const l of unixLinks) {
			const baseLink = typeof l === 'string' ? l : l.link;
			const resource = typeof l === 'string' ? URI.file(l) : l.resource;
			suite(`Link: ${baseLink}`, () => {
				for (let i = 0; i < supportedLinkFormats.length; i++) {
					const linkFormat = supportedLinkFormats[i];
					const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
					test(`should detect in "${formattedLink}"`, async () => {
						validResources = [resource];
						await assertLinksWithWrapped(formattedLink);
					});
				}
			});
		}

		test('Git diff links', async () => {
			validResources = [URI.file('/parent/cwd/foo/bar')];
			await assertLinks(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
				{ text: 'foo/bar', range: [[14, 1], [20, 1]] },
				{ text: 'foo/bar', range: [[24, 1], [30, 1]] }
			]);
			await assertLinks(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
			await assertLinks(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
		});
	});

	// Only test these when on Windows because there is special behavior around replacing separators
	// in URI that cannot be changed
	if (isWindows) {
		suite('Windows', () => {
			const wslUnixToWindowsPathMap: Map<string, string> = new Map();

			setup(() => {
				detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, new TerminalCapabilityStore(), {
					initialCwd: 'C:\\Parent\\Cwd',
					os: OperatingSystem.Windows,
					remoteAuthority: undefined,
					userHome: 'C:\\Home',
					backend: {
						async getWslPath(original, direction) {
							if (direction === 'unix-to-win') {
								return wslUnixToWindowsPathMap.get(original) ?? original;
							}
							return original;
						},
					}
				});
				wslUnixToWindowsPathMap.clear();
			});

			for (const l of windowsLinks) {
				const baseLink = typeof l === 'string' ? l : l.link;
				const resource = typeof l === 'string' ? URI.file(l) : l.resource;
				suite(`Link "${baseLink}"`, () => {
					for (let i = 0; i < supportedLinkFormats.length; i++) {
						const linkFormat = supportedLinkFormats[i];
						const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
						test(`should detect in "${formattedLink}"`, async () => {
							validResources = [resource];
							await assertLinksWithWrapped(formattedLink);
						});
					}
				});
			}

			for (const l of windowsFallbackLinks) {
				const baseLink = typeof l === 'string' ? l : l.link;
				const resource = typeof l === 'string' ? URI.file(l) : l.resource;
				suite(`Fallback link "${baseLink}"`, () => {
					for (let i = 0; i < supportedFallbackLinkFormats.length; i++) {
						const linkFormat = supportedFallbackLinkFormats[i];
						const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
						const resolvedFormat = linkFormat.resolvedFormat ? format(linkFormat.resolvedFormat, baseLink, linkFormat.line, linkFormat.column) : formattedLink;
						const linkCellStartOffset = linkFormat.linkCellStartOffset ?? 0;
						const linkCellEndOffset = linkFormat.linkCellEndOffset ?? 0;
						test(`should detect in "${formattedLink}"`, async () => {
							validResources = [resource];
							await assertLinks(TerminalBuiltinLinkType.LocalFile, formattedLink, [{ text: resolvedFormat, range: [[1 + linkCellStartOffset, 1], [formattedLink.length + linkCellEndOffset, 1]] }]);
						});
					}
				});
			}

			test('Git diff links', async () => {
				validResources = [URI.file('C:\\Parent\\Cwd\\foo\\bar')];
				await assertLinks(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
					{ text: 'foo/bar', range: [[14, 1], [20, 1]] },
					{ text: 'foo/bar', range: [[24, 1], [30, 1]] }
				]);
				await assertLinks(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
				await assertLinks(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
			});

			suite('WSL', () => {
				test('Unix -> Windows /mnt/ style links', async () => {
					wslUnixToWindowsPathMap.set('/mnt/c/foo/bar', 'C:\\foo\\bar');
					validResources = [URI.file('C:\\foo\\bar')];
					await assertLinksWithWrapped('/mnt/c/foo/bar');
				});

				test('Windows -> Unix \\\\wsl$\\ style links', async () => {
					validResources = [URI.file('\\\\wsl$\\Debian\\home\\foo\\bar')];
					await assertLinksWithWrapped('\\\\wsl$\\Debian\\home\\foo\\bar');
				});

				test('Windows -> Unix \\\\wsl.localhost\\ style links', async () => {
					validResources = [URI.file('\\\\wsl.localhost\\Debian\\home\\foo\\bar')];
					await assertLinksWithWrapped('\\\\wsl.localhost\\Debian\\home\\foo\\bar');
				});
			});
		});
	}
});
