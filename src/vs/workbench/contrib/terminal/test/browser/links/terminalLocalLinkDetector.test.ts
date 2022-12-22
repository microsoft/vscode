/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from 'vs/base/common/platform';
import { format } from 'vs/base/common/strings';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITerminalLinkResolverService, ITerminalSimpleLink, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { TerminalLocalLinkDetector } from 'vs/workbench/contrib/terminal/browser/links/terminalLocalLinkDetector';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { assertLinkHelper, resolveLinkForTest } from 'vs/workbench/contrib/terminal/test/browser/links/linkTestUtils';
import { Terminal } from 'xterm';
import { timeout } from 'vs/base/common/async';
import { strictEqual } from 'assert';
import { TerminalLinkResolverService } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkResolverService';
import { IFileService } from 'vs/platform/files/common/files';
import { createFileStat } from 'vs/workbench/test/common/workbenchTestServices';
import { URI } from 'vs/base/common/uri';

const unixLinks: (string | { link: string; resource: URI })[] = [
	'/foo',
	{ link: '~/foo', resource: URI.file('/home/foo') },
	{ link: './foo', resource: URI.file('/parent/cwd/foo') },
	{ link: './$foo', resource: URI.file('/parent/cwd/$foo') },
	{ link: '../foo', resource: URI.file('/parent/foo') },
	'/foo/bar',
	'/foo/[bar]',
	'/foo/[bar].baz',
	'/foo/[bar]/baz',
	'/foo/bar+more',
	{ link: 'foo/bar', resource: URI.file('/parent/cwd/foo/bar') },
	{ link: 'foo/bar+more', resource: URI.file('/parent/cwd/foo/bar+more') },
];

const windowsLinks: (string | { link: string; resource: URI })[] = [
	'c:\\foo',
	'\\\\?\\c:\\foo',
	'c:/foo',
	{ link: '.\\foo', resource: URI.file('C:\\Parent\\Cwd\\foo') },
	{ link: './foo', resource: URI.file('C:\\Parent\\Cwd\\foo') },
	{ link: './$foo', resource: URI.file('C:\\Parent\\Cwd\\$foo') },
	{ link: '..\\foo', resource: URI.file('C:\\foo') },
	{ link: '~\\foo', resource: URI.file('C:\\Home\\foo') },
	{ link: '~/foo', resource: URI.file('C:\\Home\\foo') },
	'c:/foo/bar',
	'c:\\foo\\bar',
	'c:\\foo\\bar+more',
	'c:\\foo/bar\\baz',
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

suite('Workbench - TerminalLocalLinkDetector', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let detector: TerminalLocalLinkDetector;
	let xterm: Terminal;
	let validResources: URI[] = [];

	async function assertLink(
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

		xterm = new Terminal({ allowProposedApi: true, cols: 80, rows: 30 });
	});

	suite('platform independent', () => {
		setup(() => {
			instantiationService.stub(ITerminalLinkResolverService, {
				async resolveLink(processManager, link, uri?) {
					return resolveLinkForTest(link, uri);
				}
			});
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
			await assertLink(TerminalBuiltinLinkType.LocalFile, './foo ./bar', [
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
						await assertLink(TerminalBuiltinLinkType.LocalFile, formattedLink, [{ text: formattedLink, range: [[1, 1], [formattedLink.length, 1]] }]);
						await assertLink(TerminalBuiltinLinkType.LocalFile, ` ${formattedLink} `, [{ text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] }]);
						await assertLink(TerminalBuiltinLinkType.LocalFile, `(${formattedLink})`, [{ text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] }]);
						await assertLink(TerminalBuiltinLinkType.LocalFile, `[${formattedLink}]`, [{ text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] }]);
					});
				}
			});
		}

		test('Git diff links', async () => {
			validResources = [URI.file('/parent/cwd/foo/bar')];
			await assertLink(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
				{ text: 'foo/bar', range: [[14, 1], [20, 1]] },
				{ text: 'foo/bar', range: [[24, 1], [30, 1]] }
			]);
			await assertLink(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
			await assertLink(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
		});
	});

	suite('Windows', () => {
		setup(() => {
			detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, new TerminalCapabilityStore(), {
				initialCwd: 'C:\\Parent\\Cwd',
				os: OperatingSystem.Windows,
				remoteAuthority: undefined,
				userHome: 'C:\\Home',
				backend: undefined
			});
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
						await assertLink(TerminalBuiltinLinkType.LocalFile, formattedLink, [{ text: formattedLink, range: [[1, 1], [formattedLink.length, 1]] }]);
						await assertLink(TerminalBuiltinLinkType.LocalFile, ` ${formattedLink} `, [{ text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] }]);
						await assertLink(TerminalBuiltinLinkType.LocalFile, `(${formattedLink})`, [{ text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] }]);
						await assertLink(TerminalBuiltinLinkType.LocalFile, `[${formattedLink}]`, [{ text: formattedLink, range: [[2, 1], [formattedLink.length + 1, 1]] }]);
					});
				}
			});
		}

		test('Git diff links', async () => {
			validResources = [URI.file('C:\\Parent\\Cwd\\foo\\bar')];
			await assertLink(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
				{ text: 'foo/bar', range: [[14, 1], [20, 1]] },
				{ text: 'foo/bar', range: [[24, 1], [30, 1]] }
			]);
			await assertLink(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
			await assertLink(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ text: 'foo/bar', range: [[7, 1], [13, 1]] }]);
		});
	});
});
