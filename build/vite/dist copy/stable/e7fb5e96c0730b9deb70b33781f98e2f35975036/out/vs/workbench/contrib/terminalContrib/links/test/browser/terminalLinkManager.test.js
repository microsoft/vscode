/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { equals } from '../../../../../../base/common/arrays.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextMenuService } from '../../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { TerminalLinkManager } from '../../browser/terminalLinkManager.js';
import { TestViewDescriptorService } from '../../../../terminal/test/browser/xterm/xtermTerminal.test.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
const defaultTerminalConfig = {
    fontFamily: 'monospace',
    fontWeight: 'normal',
    fontWeightBold: 'normal',
    gpuAcceleration: 'off',
    scrollback: 1000,
    fastScrollSensitivity: 2,
    mouseWheelScrollSensitivity: 1,
    unicodeVersion: '11',
    wordSeparators: ' ()[]{}\',"`─‘’“”'
};
class TestLinkManager extends TerminalLinkManager {
    async _getLinksForType(y, type) {
        switch (type) {
            case 'word':
                return this._links?.wordLinks?.[y] ? [this._links?.wordLinks?.[y]] : undefined;
            case 'url':
                return this._links?.webLinks?.[y] ? [this._links?.webLinks?.[y]] : undefined;
            case 'localFile':
                return this._links?.fileLinks?.[y] ? [this._links?.fileLinks?.[y]] : undefined;
        }
    }
    setLinks(links) {
        this._links = links;
    }
}
suite('TerminalLinkManager', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let themeService;
    let viewDescriptorService;
    let xterm;
    let linkManager;
    setup(async () => {
        configurationService = new TestConfigurationService({
            editor: {
                fastScrollSensitivity: 2,
                mouseWheelScrollSensitivity: 1
            },
            terminal: {
                integrated: defaultTerminalConfig
            }
        });
        themeService = new TestThemeService();
        viewDescriptorService = new TestViewDescriptorService();
        instantiationService = store.add(new TestInstantiationService());
        instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IStorageService, store.add(new TestStorageService()));
        instantiationService.stub(IThemeService, themeService);
        instantiationService.stub(IViewDescriptorService, viewDescriptorService);
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
        linkManager = store.add(instantiationService.createInstance(TestLinkManager, xterm, upcastPartial({
            get initialCwd() {
                return '';
            }
            // eslint-disable-next-line local/code-no-any-casts
        }), {
            get(capability) {
                return undefined;
            }
        }, instantiationService.createInstance(TerminalLinkResolver)));
    });
    suite('registerExternalLinkProvider', () => {
        test('should not leak disposables if the link manager is already disposed', () => {
            linkManager.externalProvideLinksCb = async () => undefined;
            linkManager.dispose();
            linkManager.externalProvideLinksCb = async () => undefined;
        });
    });
    suite('getLinks and open recent link', () => {
        test('should return no links', async () => {
            const links = await linkManager.getLinks();
            equals(links.viewport.webLinks, []);
            equals(links.viewport.wordLinks, []);
            equals(links.viewport.fileLinks, []);
            const webLink = await linkManager.openRecentLink('url');
            strictEqual(webLink, undefined);
            const fileLink = await linkManager.openRecentLink('localFile');
            strictEqual(fileLink, undefined);
        });
        test('should return word links in order', async () => {
            const link1 = {
                range: {
                    start: { x: 1, y: 1 }, end: { x: 14, y: 1 }
                },
                text: '1_我是学生.txt',
                activate: () => Promise.resolve('')
            };
            const link2 = {
                range: {
                    start: { x: 1, y: 1 }, end: { x: 14, y: 1 }
                },
                text: '2_我是学生.txt',
                activate: () => Promise.resolve('')
            };
            linkManager.setLinks({ wordLinks: [link1, link2] });
            const links = await linkManager.getLinks();
            deepStrictEqual(links.viewport.wordLinks?.[0].text, link2.text);
            deepStrictEqual(links.viewport.wordLinks?.[1].text, link1.text);
            const webLink = await linkManager.openRecentLink('url');
            strictEqual(webLink, undefined);
            const fileLink = await linkManager.openRecentLink('localFile');
            strictEqual(fileLink, undefined);
        });
        test('should return web links in order', async () => {
            const link1 = {
                range: { start: { x: 5, y: 1 }, end: { x: 40, y: 1 } },
                text: 'https://foo.bar/[this is foo site 1]',
                activate: () => Promise.resolve('')
            };
            const link2 = {
                range: { start: { x: 5, y: 2 }, end: { x: 40, y: 2 } },
                text: 'https://foo.bar/[this is foo site 2]',
                activate: () => Promise.resolve('')
            };
            linkManager.setLinks({ webLinks: [link1, link2] });
            const links = await linkManager.getLinks();
            deepStrictEqual(links.viewport.webLinks?.[0].text, link2.text);
            deepStrictEqual(links.viewport.webLinks?.[1].text, link1.text);
            const webLink = await linkManager.openRecentLink('url');
            strictEqual(webLink, link2);
            const fileLink = await linkManager.openRecentLink('localFile');
            strictEqual(fileLink, undefined);
        });
        test('should return file links in order', async () => {
            const link1 = {
                range: { start: { x: 1, y: 1 }, end: { x: 32, y: 1 } },
                text: 'file:///C:/users/test/file_1.txt',
                activate: () => Promise.resolve('')
            };
            const link2 = {
                range: { start: { x: 1, y: 2 }, end: { x: 32, y: 2 } },
                text: 'file:///C:/users/test/file_2.txt',
                activate: () => Promise.resolve('')
            };
            linkManager.setLinks({ fileLinks: [link1, link2] });
            const links = await linkManager.getLinks();
            deepStrictEqual(links.viewport.fileLinks?.[0].text, link2.text);
            deepStrictEqual(links.viewport.fileLinks?.[1].text, link1.text);
            const webLink = await linkManager.openRecentLink('url');
            strictEqual(webLink, undefined);
            linkManager.setLinks({ fileLinks: [link2] });
            const fileLink = await linkManager.openRecentLink('localFile');
            strictEqual(fileLink, link2);
        });
    });
});
function upcastPartial(v) {
    return v;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rTWFuYWdlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbExpbmtNYW5hZ2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDdEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNwRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RSxPQUFPLEVBQWtCLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHM0YsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDMUcsT0FBTyxFQUFFLGtCQUFr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