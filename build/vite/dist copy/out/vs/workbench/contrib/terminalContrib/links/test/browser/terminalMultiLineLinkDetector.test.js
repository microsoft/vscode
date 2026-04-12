/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWindows } from '../../../../../../base/common/platform.js';
import { format } from '../../../../../../base/common/strings.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { assertLinkHelper } from './linkTestUtils.js';
import { timeout } from '../../../../../../base/common/async.js';
import { strictEqual } from 'assert';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { createFileStat } from '../../../../../test/common/workbenchTestServices.js';
import { URI } from '../../../../../../base/common/uri.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { TerminalMultiLineLinkDetector } from '../../browser/terminalMultiLineLinkDetector.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isString } from '../../../../../../base/common/types.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
const unixLinks = [
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
const windowsLinks = [
    // Absolute
    'c:\\foo',
    { link: '\\\\?\\C:\\foo', resource: URI.file('C:\\foo') },
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
const supportedLinkFormats = [
    // 5: file content...                         [#181837]
    //   5:3  error                               [#181837]
    { urlFormat: '{0}\r\n{1}:foo', line: '5' },
    { urlFormat: '{0}\r\n{1}: foo', line: '5' },
    { urlFormat: '{0}\r\n5:another link\r\n{1}:{2} foo', line: '5', column: '3' },
    { urlFormat: '{0}\r\n  {1}:{2} foo', line: '5', column: '3' },
    { urlFormat: '{0}\r\n  5:6  error  another one\r\n  {1}:{2}  error', line: '5', column: '3' },
    { urlFormat: `{0}\r\n  5:6  error  ${'a'.repeat(80)}\r\n  {1}:{2}  error`, line: '5', column: '3' },
    // @@ ... <to-file-range> @@ content...       [#182878]   (tests check the entire line, so they don't include the line content at the end of the last @@)
    { urlFormat: '+++ b/{0}\r\n@@ -7,6 +{1},7 @@', line: '5' },
    { urlFormat: '+++ b/{0}\r\n@@ -1,1 +1,1 @@\r\nfoo\r\nbar\r\n@@ -7,6 +{1},7 @@', line: '5' },
];
suite('Workbench - TerminalMultiLineLinkDetector', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let detector;
    let resolver;
    let xterm;
    let validResources;
    async function assertLinks(type, text, expected) {
        let to;
        const race = await Promise.race([
            assertLinkHelper(text, expected, detector, type).then(() => 'success'),
            (to = timeout(2)).then(() => 'timeout')
        ]);
        strictEqual(race, 'success', `Awaiting link assertion for "${text}" timed out`);
        to.cancel();
    }
    async function assertLinksMain(link, resource) {
        const uri = resource ?? URI.file(link);
        const lines = link.split('\r\n');
        const lastLine = lines.at(-1);
        // Count lines, accounting for wrapping
        let lineCount = 0;
        for (const line of lines) {
            lineCount += Math.max(Math.ceil(line.length / 80), 1);
        }
        await assertLinks("LocalFile" /* TerminalBuiltinLinkType.LocalFile */, link, [{ uri, range: [[1, lineCount], [lastLine.length, lineCount]] }]);
    }
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
        resolver = instantiationService.createInstance(TerminalLinkResolver);
        validResources = [];
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger });
    });
    suite('macOS/Linux', () => {
        setup(() => {
            detector = instantiationService.createInstance(TerminalMultiLineLinkDetector, xterm, {
                initialCwd: '/parent/cwd',
                os: 3 /* OperatingSystem.Linux */,
                remoteAuthority: undefined,
                userHome: '/home',
                backend: undefined
            }, resolver);
        });
        for (const l of unixLinks) {
            const baseLink = isString(l) ? l : l.link;
            const resource = isString(l) ? URI.file(l) : l.resource;
            suite(`Link: ${baseLink}`, () => {
                for (let i = 0; i < supportedLinkFormats.length; i++) {
                    const linkFormat = supportedLinkFormats[i];
                    const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
                    test(`should detect in "${escapeMultilineTestName(formattedLink)}"`, async () => {
                        validResources = [resource];
                        await assertLinksMain(formattedLink, resource);
                    });
                }
            });
        }
    });
    // Only test these when on Windows because there is special behavior around replacing separators
    // in URI that cannot be changed
    if (isWindows) {
        suite('Windows', () => {
            setup(() => {
                detector = instantiationService.createInstance(TerminalMultiLineLinkDetector, xterm, {
                    initialCwd: 'C:\\Parent\\Cwd',
                    os: 1 /* OperatingSystem.Windows */,
                    remoteAuthority: undefined,
                    userHome: 'C:\\Home',
                }, resolver);
            });
            for (const l of windowsLinks) {
                const baseLink = isString(l) ? l : l.link;
                const resource = isString(l) ? URI.file(l) : l.resource;
                suite(`Link "${baseLink}"`, () => {
                    for (let i = 0; i < supportedLinkFormats.length; i++) {
                        const linkFormat = supportedLinkFormats[i];
                        const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
                        test(`should detect in "${escapeMultilineTestName(formattedLink)}"`, async () => {
                            validResources = [resource];
                            await assertLinksMain(formattedLink, resource);
                        });
                    }
                });
            }
        });
    }
});
function escapeMultilineTestName(text) {
    return text.replaceAll('\r\n', '\\r\\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy90ZXN0L2Jyb3dzZXIvdGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFtQixNQUFNLDJDQUEyQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUU1SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUV0RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDaEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLDZCQUE2QixFQUFF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