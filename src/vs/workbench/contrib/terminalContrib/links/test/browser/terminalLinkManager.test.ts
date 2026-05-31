/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { equals } from '../../../../../../base/common/arrays.js';
import { IEditorOptions } from '../../../../../../editor/common/config/editorOptions.js';
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
import { IDetectedLinks, TerminalLinkManager } from '../../browser/terminalLinkManager.js';
import { ITerminalCapabilityImplMap, ITerminalCapabilityStore, TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalConfiguration, ITerminalProcessManager } from '../../../../terminal/common/terminal.js';
import { TestViewDescriptorService } from '../../../../terminal/test/browser/xterm/xtermTerminal.test.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import type { ILink, Terminal } from '@xterm/xterm';
import { IXtermCore } from '../../../../terminal/browser/xterm-private.js';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../base/common/async.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';

const defaultTerminalConfig: Partial<ITerminalConfiguration> = {
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
	private _links: IDetectedLinks | undefined;
	protected override async _getLinksForType(y: number, type: 'word' | 'url' | 'localFile'): Promise<ILink[] | undefined> {
		switch (type) {
			case 'word':
				return this._links?.wordLinks?.[y] ? [this._links?.wordLinks?.[y]] : undefined;
			case 'url':
				return this._links?.webLinks?.[y] ? [this._links?.webLinks?.[y]] : undefined;
			case 'localFile':
				return this._links?.fileLinks?.[y] ? [this._links?.fileLinks?.[y]] : undefined;
		}
	}
	setLinks(links: IDetectedLinks): void {
		this._links = links;
	}
}

suite('TerminalLinkManager', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let viewDescriptorService: TestViewDescriptorService;
	let xterm: Terminal;
	let linkManager: TestLinkManager;

	setup(async () => {
		configurationService = new TestConfigurationService({
			editor: {
				fastScrollSensitivity: 2,
				mouseWheelScrollSensitivity: 1
			} as Partial<IEditorOptions>,
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

		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
		linkManager = store.add(instantiationService.createInstance(TestLinkManager, xterm, upcastPartial<ITerminalProcessManager>({
			get initialCwd() {
				return '';
			}
			// eslint-disable-next-line local/code-no-any-casts
		}), {
			get<T extends TerminalCapability>(capability: T): ITerminalCapabilityImplMap[T] | undefined {
				return undefined;
			}
		} as Partial<ITerminalCapabilityStore> as any, instantiationService.createInstance(TerminalLinkResolver)));
	});

	suite('registerExternalLinkProvider', () => {
		test('should not leak disposables if the link manager is already disposed', () => {
			linkManager.externalProvideLinksCb = async () => undefined;
			linkManager.dispose();
			linkManager.externalProvideLinksCb = async () => undefined;
		});
	});

	// eslint-disable-next-line @typescript-eslint/naming-convention
	type TestableLinkManager = { _showHover: (...args: unknown[]) => IDisposable | undefined };

	function overrideXtermEvent<T>(terminal: Terminal, eventName: string, handler: (listener: (e: T) => void) => IDisposable): IDisposable {
		const originalDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal), eventName);
		Object.defineProperty(terminal, eventName, { value: handler, configurable: true });
		return {
			dispose: () => {
				if (originalDescriptor) {
					Object.defineProperty(terminal, eventName, originalDescriptor);
				} else {
					delete (terminal as unknown as Record<string, unknown>)[eventName];
				}
			}
		};
	}

	function mockXtermCoreRenderService(): IDisposable {
		interface XtermWithCore extends Terminal { _core: IXtermCore }
		const xtermWithCore = xterm as unknown as XtermWithCore;
		const origRenderService = xtermWithCore._core?._renderService;
		if (!xtermWithCore._core) { (xtermWithCore as XtermWithCore)._core = {} as IXtermCore; }
		xtermWithCore._core._renderService = { dimensions: { css: { cell: { width: 8, height: 16 } } }, _renderer: {} };
		return {
			dispose: () => { xtermWithCore._core._renderService = origRenderService!; }
		};
	}

	suite('OSC 8 hover', () => {
		test('should cancel delayed tooltip when leave happens before hover delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			await configurationService.setUserConfiguration('workbench.hover.delay', 10);
			const linkHandler = xterm.options.linkHandler;
			if (!linkHandler?.hover || !linkHandler.leave) {
				throw new Error('Expected linkHandler with hover/leave callbacks');
			}
			let hoverShownCount = 0;
			const testableLinkManager = linkManager as unknown as TestableLinkManager;
			const originalShowHover = testableLinkManager._showHover;
			testableLinkManager._showHover = () => {
				hoverShownCount++;
				return undefined;
			};
			const range: Parameters<typeof linkHandler.hover>[2] = { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } };
			const event = new MouseEvent('mousemove');
			try {
				linkHandler.hover(event, 'http://example.com', range);
				linkHandler.leave(event, 'http://example.com', range);
				await timeout(0);
				strictEqual(hoverShownCount, 0);
			} finally {
				testableLinkManager._showHover = originalShowHover;
			}
		}));

		/**
		 * Triggers the hover callback, flushes the 0ms scheduler, then
		 * fires the given xterm event and asserts the hover was disposed.
		 */
		async function assertHoverDismissedOnEvent(
			overrideEvent: (setFireEvent: (fn: () => void) => void) => IDisposable,
		): Promise<void> {
			await configurationService.setUserConfiguration('workbench.hover.delay', 0);
			const linkHandler = xterm.options.linkHandler;
			if (!linkHandler?.hover) {
				throw new Error('Expected linkHandler with hover callback');
			}
			let hoverDisposed = false;
			const testableLinkManager = linkManager as unknown as TestableLinkManager;
			const originalShowHover = testableLinkManager._showHover;
			testableLinkManager._showHover = () => ({
				dispose: () => { hoverDisposed = true; }
			});
			const renderServiceRestore = mockXtermCoreRenderService();
			const range: Parameters<typeof linkHandler.hover>[2] = { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } };
			let fireEvent: (() => void) | undefined;
			const eventRestore = overrideEvent(fn => { fireEvent = fn; });
			try {
				linkHandler.hover(new MouseEvent('mousemove'), 'http://example.com', range);
				await timeout(0);
				strictEqual(hoverDisposed, false);
				fireEvent?.();
				strictEqual(hoverDisposed, true);
			} finally {
				eventRestore.dispose();
				renderServiceRestore.dispose();
				testableLinkManager._showHover = originalShowHover;
			}
		}

		test('should dismiss shown tooltip on scroll', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			await assertHoverDismissedOnEvent(setFire => {
				return overrideXtermEvent<number>(xterm, 'onScroll', listener => {
					setFire(() => listener(1));
					return { dispose: () => { } };
				});
			});
		}));

		test('should dismiss shown tooltip on render', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			await assertHoverDismissedOnEvent(setFire => {
				return overrideXtermEvent<{ start: number; end: number }>(xterm, 'onRender', listener => {
					setFire(() => listener({ start: 0, end: 5 }));
					return { dispose: () => { } };
				});
			});
		}));
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
function upcastPartial<T>(v: Partial<T>): T {
	return v as T;
}
