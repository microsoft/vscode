/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';
import { TerminalUriLinkDetector } from '../../browser/terminalUriLinkDetector.js';
import { assertLinkHelper } from './linkTestUtils.js';
import { createFileStat } from '../../../../../test/common/workbenchTestServices.js';
import { URI } from '../../../../../../base/common/uri.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
suite('Workbench - TerminalUriLinkDetector', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let configurationService;
    let detector;
    let xterm;
    let validResources = [];
    let instantiationService;
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
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger });
        detector = instantiationService.createInstance(TerminalUriLinkDetector, xterm, {
            initialCwd: '/parent/cwd',
            os: 3 /* OperatingSystem.Linux */,
            remoteAuthority: undefined,
            userHome: '/home',
            backend: undefined
        }, instantiationService.createInstance(TerminalLinkResolver));
    });
    teardown(() => {
        instantiationService.dispose();
    });
    async function assertLink(type, text, expected) {
        await assertLinkHelper(text, expected, detector, type);
    }
    const linkComputerCases = [
        ["Url" /* TerminalBuiltinLinkType.Url */, 'x = "http://foo.bar";', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'x = (http://foo.bar);', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'x = \'http://foo.bar\';', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'x =  http://foo.bar ;', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'x = <http://foo.bar>;', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'x = {http://foo.bar};', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '(see http://foo.bar)', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '[see http://foo.bar]', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '{see http://foo.bar}', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '<see http://foo.bar>', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '<url>http://foo.bar</url>', [{ range: [[6, 1], [19, 1]], uri: URI.parse('http://foo.bar') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '// Click here to learn more. https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409', [{ range: [[30, 1], [7, 2]], uri: URI.parse('https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '// Click here to learn more. https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx', [{ range: [[30, 1], [28, 2]], uri: URI.parse('https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '// https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js', [{ range: [[4, 1], [9, 2]], uri: URI.parse('https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '<!-- !!! Do not remove !!!   WebContentRef(link:https://go.microsoft.com/fwlink/?LinkId=166007, area:Admin, updated:2015, nextUpdate:2016, tags:SqlServer)   !!! Do not remove !!! -->', [{ range: [[49, 1], [14, 2]], uri: URI.parse('https://go.microsoft.com/fwlink/?LinkId=166007') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'For instructions, see https://go.microsoft.com/fwlink/?LinkId=166007.</value>', [{ range: [[23, 1], [68, 1]], uri: URI.parse('https://go.microsoft.com/fwlink/?LinkId=166007') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'For instructions, see https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx.</value>', [{ range: [[23, 1], [21, 2]], uri: URI.parse('https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'x = "https://en.wikipedia.org/wiki/Zürich";', [{ range: [[6, 1], [41, 1]], uri: URI.parse('https://en.wikipedia.org/wiki/Zürich') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '請參閱 http://go.microsoft.com/fwlink/?LinkId=761051。', [{ range: [[8, 1], [53, 1]], uri: URI.parse('http://go.microsoft.com/fwlink/?LinkId=761051') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '（請參閱 http://go.microsoft.com/fwlink/?LinkId=761051）', [{ range: [[10, 1], [55, 1]], uri: URI.parse('http://go.microsoft.com/fwlink/?LinkId=761051') }]],
        ["LocalFile" /* TerminalBuiltinLinkType.LocalFile */, 'x = "file:///foo.bar";', [{ range: [[6, 1], [20, 1]], uri: URI.parse('file:///foo.bar') }], URI.parse('file:///foo.bar')],
        ["LocalFile" /* TerminalBuiltinLinkType.LocalFile */, 'x = "file://c:/foo.bar";', [{ range: [[6, 1], [22, 1]], uri: URI.parse('file://c:/foo.bar') }], URI.parse('file://c:/foo.bar')],
        ["LocalFile" /* TerminalBuiltinLinkType.LocalFile */, 'x = "file://shares/foo.bar";', [{ range: [[6, 1], [26, 1]], uri: URI.parse('file://shares/foo.bar') }], URI.parse('file://shares/foo.bar')],
        ["LocalFile" /* TerminalBuiltinLinkType.LocalFile */, 'x = "file://shäres/foo.bar";', [{ range: [[6, 1], [26, 1]], uri: URI.parse('file://shäres/foo.bar') }], URI.parse('file://shäres/foo.bar')],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'Some text, then http://www.bing.com.', [{ range: [[17, 1], [35, 1]], uri: URI.parse('http://www.bing.com') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'let url = `http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items`;', [{ range: [[12, 1], [78, 1]], uri: URI.parse('http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '7. At this point, ServiceMain has been called.  There is no functionality presently in ServiceMain, but you can consult the [MSDN documentation](https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx) to add functionality as desired!', [{ range: [[66, 2], [64, 3]], uri: URI.parse('https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'let x = "http://[::1]:5000/connect/token"', [{ range: [[10, 1], [40, 1]], uri: URI.parse('http://[::1]:5000/connect/token') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, '2. Navigate to **https://portal.azure.com**', [{ range: [[18, 1], [41, 1]], uri: URI.parse('https://portal.azure.com') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'POST|https://portal.azure.com|2019-12-05|', [{ range: [[6, 1], [29, 1]], uri: URI.parse('https://portal.azure.com') }]],
        ["Url" /* TerminalBuiltinLinkType.Url */, 'aa  https://foo.bar/[this is foo site]  aa', [{ range: [[5, 1], [38, 1]], uri: URI.parse('https://foo.bar/[this is foo site]') }]]
    ];
    for (const c of linkComputerCases) {
        test('link computer case: `' + c[1] + '`', async () => {
            validResources = c[3] ? [c[3]] : [];
            await assertLink(c[0], c[1], c[2]);
        });
    }
    test('should support multiple link results', async () => {
        await assertLink("Url" /* TerminalBuiltinLinkType.Url */, 'http://foo.bar http://bar.foo', [
            { range: [[1, 1], [14, 1]], uri: URI.parse('http://foo.bar') },
            { range: [[16, 1], [29, 1]], uri: URI.parse('http://bar.foo') }
        ]);
    });
    test('should detect file:// links with :line suffix', async () => {
        validResources = [URI.file('c:/folder/file')];
        await assertLink("LocalFile" /* TerminalBuiltinLinkType.LocalFile */, 'file:///c:/folder/file:23', [
            { range: [[1, 1], [25, 1]], uri: URI.parse('file:///c:/folder/file') }
        ]);
    });
    test('should detect file:// links with :line:col suffix', async () => {
        validResources = [URI.file('c:/folder/file')];
        await assertLink("LocalFile" /* TerminalBuiltinLinkType.LocalFile */, 'file:///c:/folder/file:23:10', [
            { range: [[1, 1], [28, 1]], uri: URI.parse('file:///c:/folder/file') }
        ]);
    });
    test('should filter out https:// link that exceed 4096 characters', async () => {
        // 8 + 200 * 10 = 2008 characters
        await assertLink("Url" /* TerminalBuiltinLinkType.Url */, `https://${'foobarbaz/'.repeat(200)}`, [{
                range: [[1, 1], [8, 26]],
                uri: URI.parse(`https://${'foobarbaz/'.repeat(200)}`)
            }]);
        // 8 + 450 * 10 = 4508 characters
        await assertLink("Url" /* TerminalBuiltinLinkType.Url */, `https://${'foobarbaz/'.repeat(450)}`, []);
    });
    test('should filter out file:// links that exceed 4096 characters', async () => {
        // 8 + 200 * 10 = 2008 characters
        validResources = [URI.file(`/${'foobarbaz/'.repeat(200)}`)];
        await assertLink("LocalFile" /* TerminalBuiltinLinkType.LocalFile */, `file:///${'foobarbaz/'.repeat(200)}`, [{
                uri: URI.parse(`file:///${'foobarbaz/'.repeat(200)}`),
                range: [[1, 1], [8, 26]]
            }]);
        // 8 + 450 * 10 = 4508 characters
        validResources = [URI.file(`/${'foobarbaz/'.repeat(450)}`)];
        await assertLink("LocalFile" /* TerminalBuiltinLinkType.LocalFile */, `file:///${'foobarbaz/'.repeat(450)}`, []);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxVcmlMaW5rRGV0ZWN0b3IudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy90ZXN0L2Jyb3dzZXIvdGVybWluYWxVcmlMaW5rRGV0ZWN0b3IudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDaEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFFNUgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDdEQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUczRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRXpHLEtBQUssQ0FBQyxxQ0FBcUMsRUFBRSxHQUFH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