/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalBuiltinLinkType } from '../../browser/links.js';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';
import { TerminalUriLinkDetector } from '../../browser/terminalUriLinkDetector.js';
import { assertLinkHelper } from './linkTestUtils.js';
import { createFileStat } from '../../../../../test/common/workbenchTestServices.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { Terminal } from '@xterm/xterm';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';

suite('Workbench - TerminalUriLinkDetector', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let detector: TerminalUriLinkDetector;
	let xterm: Terminal;
	let validResources: URI[] = [];
	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = store.add(new TestInstantiationService());
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
		instantiationService.stub(ITerminalLogService, new NullLogService());
		validResources = [];

		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30 });
		detector = instantiationService.createInstance(TerminalUriLinkDetector, xterm, {
			initialCwd: '/parent/cwd',
			os: OperatingSystem.Linux,
			remoteAuthority: undefined,
			userHome: '/home',
			backend: undefined
		}, instantiationService.createInstance(TerminalLinkResolver));
	});

	teardown(() => {
		instantiationService.dispose();
	});

	async function assertLink(
		type: TerminalBuiltinLinkType,
		text: string,
		expected: ({ uri: URI; range: [number, number][] })[]
	) {
		await assertLinkHelper(text, expected, detector, type);
	}

	const linkComputerCases: [
		/* Link type      */ TerminalBuiltinLinkType,
		/* Line text      */ string,
		/* Link and range */ { uri: URI; range: [number, number][] }[],
		/* Stat resource  */ URI?
	][] = [
			[TerminalBuiltinLinkType.Url, 'x = "http://foo.bar";', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, 'x = (http://foo.bar);', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, 'x = \'http://foo.bar\';', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, 'x =  http://foo.bar ;', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, 'x = <http://foo.bar>;', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, 'x = {http://foo.bar};', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, '(see http://foo.bar)', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, '[see http://foo.bar]', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, '{see http://foo.bar}', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, '<see http://foo.bar>', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, '<url>http://foo.bar</url>', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
			[TerminalBuiltinLinkType.Url, '// Click here to learn more. https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409', [{ range: [[30, 1], [7, 2]], uri: URI.parse('https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409') }]],
			[TerminalBuiltinLinkType.Url, '// Click here to learn more. https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx', [{ range: [[30, 1], [28, 2]], uri: URI.parse('https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx') }]],
			[TerminalBuiltinLinkType.Url, '// https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js', [{ range: [[4, 1], [9, 2]], uri: URI.parse('https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js') }]],
			[TerminalBuiltinLinkType.Url, '<!-- !!! Do not remove !!!   WebContentRef(link:https://go.microsoft.com/fwlink/?LinkId=166007, area:Admin, updated:2015, nextUpdate:2016, tags:SqlServer)   !!! Do not remove !!! -->', [{ range: [[49, 1], [14, 2]], uri: URI.parse('https://go.microsoft.com/fwlink/?LinkId=166007') }]],
			[TerminalBuiltinLinkType.Url, 'For instructions, see https://go.microsoft.com/fwlink/?LinkId=166007.</value>', [{ range: [[23, 1], [68, 1]], uri: URI.parse('https://go.microsoft.com/fwlink/?LinkId=166007') }]],
			[TerminalBuiltinLinkType.Url, 'For instructions, see https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx.</value>', [{ range: [[23, 1], [21, 2]], uri: URI.parse('https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx') }]],
			[TerminalBuiltinLinkType.Url, 'x = "https://en.wikipedia.org/wiki/Zürich";', [{ range: [[6, 1], [41, 1]], uri: URI.parse('https://en.wikipedia.org/wiki/Zürich') }]],
			[TerminalBuiltinLinkType.Url, '請參閱 http://go.microsoft.com/fwlink/?LinkId=761051。', [{ range: [[8, 1], [53, 1]], uri: URI.parse('http://go.microsoft.com/fwlink/?LinkId=761051') }]],
			[TerminalBuiltinLinkType.Url, '（請參閱 http://go.microsoft.com/fwlink/?LinkId=761051）', [{ range: [[10, 1], [55, 1]], uri: URI.parse('http://go.microsoft.com/fwlink/?LinkId=761051') }]],
			[TerminalBuiltinLinkType.LocalFile, 'x = "file:///foo.bar";', [{ range: [[6, 1], [20, 1]], uri: URI.parse('file:///foo.bar') }], URI.parse('file:///foo.bar')],
			[TerminalBuiltinLinkType.LocalFile, 'x = "file://c:/foo.bar";', [{ range: [[6, 1], [22, 1]], uri: URI.parse('file://c:/foo.bar') }], URI.parse('file://c:/foo.bar')],
			[TerminalBuiltinLinkType.LocalFile, 'x = "file://shares/foo.bar";', [{ range: [[6, 1], [26, 1]], uri: URI.parse('file://shares/foo.bar') }], URI.parse('file://shares/foo.bar')],
			[TerminalBuiltinLinkType.LocalFile, 'x = "file://shäres/foo.bar";', [{ range: [[6, 1], [26, 1]], uri: URI.parse('file://shäres/foo.bar') }], URI.parse('file://shäres/foo.bar')],
			[TerminalBuiltinLinkType.Url, 'Some text, then http://www.bing.com.', [{ range: [[17, 1], [35, 1]], uri: URI.parse('http://www.bing.com') }]],
			[TerminalBuiltinLinkType.Url, 'let url = `http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items`;', [{ range: [[12, 1], [78, 1]], uri: URI.parse('http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items') }]],
			[TerminalBuiltinLinkType.Url, '7. At this point, ServiceMain has been called.  There is no functionality presently in ServiceMain, but you can consult the [MSDN documentation](https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx) to add functionality as desired!', [{ range: [[66, 2], [64, 3]], uri: URI.parse('https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx') }]],
			[TerminalBuiltinLinkType.Url, 'let x = "http://[::1]:5000/connect/token"', [{ range: [[10, 1], [40, 1]], uri: URI.parse('http://[::1]:5000/connect/token') }]],
			[TerminalBuiltinLinkType.Url, '2. Navigate to **https://portal.azure.com**', [{ range: [[18, 1], [41, 1]], uri: URI.parse('https://portal.azure.com') }]],
			[TerminalBuiltinLinkType.Url, 'POST|https://portal.azure.com|2019-12-05|', [{ range: [[6, 1], [29, 1]], uri: URI.parse('https://portal.azure.com') }]],
			[TerminalBuiltinLinkType.Url, 'aa  https://foo.bar/[this is foo site]  aa', [{ range: [[5, 1], [38, 1]], uri: URI.parse('https://foo.bar/[this is foo site]') }]]
		];
	for (const c of linkComputerCases) {
		test('link computer case: `' + c[1] + '`', async () => {
			validResources = c[3] ? [c[3]] : [];
			await assertLink(c[0], c[1], c[2]);
		});
	}

	test('should support multiple link results', async () => {
		await assertLink(TerminalBuiltinLinkType.Url, 'http://foo.bar http://bar.foo', [
			{ range: [[1, 1], [14, 1]], uri: URI.parse('http://foo.bar') },
			{ range: [[16, 1], [29, 1]], uri: URI.parse('http://bar.foo') }
		]);
	});
	test('should detect file:// links with :line suffix', async () => {
		validResources = [URI.file('c:/folder/file')];
		await assertLink(TerminalBuiltinLinkType.LocalFile, 'file:///c:/folder/file:23', [
			{ range: [[1, 1], [25, 1]], uri: URI.parse('file:///c:/folder/file') }
		]);
	});
	test('should detect file:// links with :line:col suffix', async () => {
		validResources = [URI.file('c:/folder/file')];
		await assertLink(TerminalBuiltinLinkType.LocalFile, 'file:///c:/folder/file:23:10', [
			{ range: [[1, 1], [28, 1]], uri: URI.parse('file:///c:/folder/file') }
		]);
	});
	test('should filter out https:// link that exceed 4096 characters', async () => {
		// 8 + 200 * 10 = 2008 characters
		await assertLink(TerminalBuiltinLinkType.Url, `https://${'foobarbaz/'.repeat(200)}`, [{
			range: [[1, 1], [8, 26]],
			uri: URI.parse(`https://${'foobarbaz/'.repeat(200)}`)
		}]);
		// 8 + 450 * 10 = 4508 characters
		await assertLink(TerminalBuiltinLinkType.Url, `https://${'foobarbaz/'.repeat(450)}`, []);
	});
	test('should filter out file:// links that exceed 4096 characters', async () => {
		// 8 + 200 * 10 = 2008 characters
		validResources = [URI.file(`/${'foobarbaz/'.repeat(200)}`)];
		await assertLink(TerminalBuiltinLinkType.LocalFile, `file:///${'foobarbaz/'.repeat(200)}`, [{
			uri: URI.parse(`file:///${'foobarbaz/'.repeat(200)}`),
			range: [[1, 1], [8, 26]]
		}]);
		// 8 + 450 * 10 = 4508 characters
		validResources = [URI.file(`/${'foobarbaz/'.repeat(450)}`)];
		await assertLink(TerminalBuiltinLinkType.LocalFile, `file:///${'foobarbaz/'.repeat(450)}`, []);
	});
});
