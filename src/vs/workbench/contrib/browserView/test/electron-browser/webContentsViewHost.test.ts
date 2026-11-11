/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IScreenshotToolLayer, IScreenshotToolService } from '../../../screenshotTool/browser/screenshotTool.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { WebContentsViewHost } from '../../electron-browser/webContentsViewHost.js';

suite('WebContentsViewHost', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(layers: IScreenshotToolLayer[] = [], configurationService: IConfigurationService = new TestConfigurationService()): WebContentsViewHost {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IScreenshotToolService, upcastPartial<IScreenshotToolService>({
			registerLayer: layer => {
				layers.push(layer);
				return toDisposable(() => layers.splice(layers.indexOf(layer), 1));
			},
		}));
		return store.add(instantiationService.createInstance(WebContentsViewHost, mainWindow, () => { }));
	}

	test('hides the page a frame after its container, unless the container itself is hidden', async () => {
		const calls: boolean[] = [];
		let visible = false;
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.test',
			error: undefined,
			screenshot: undefined,
			focused: false,
			get visible() { return visible; },
			onDidChangeVisibility: Event.None,
			onDidKeyCommand: Event.None,
			onDidNavigate: Event.None,
			onDidChangeLoadingState: Event.None,
			onWillDispose: Event.None,
			setVisible: async (value: boolean) => {
				calls.push(value);
				visible = value;
			},
			// The host keeps the last screenshot as its placeholder; a pending capture keeps this test free of timers.
			captureScreenshot: () => new Promise<VSBuffer>(() => { }),
		});
		const host = createHost();

		host.setModel(model);
		host.setVisible(true);
		host.setVisible(false);
		const beforeFrame = [...calls];
		await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
		const afterFrame = [...calls];
		host.setVisible(true);
		host.setVisible(false, true);

		assert.deepStrictEqual({ beforeFrame, afterFrame, immediate: calls }, {
			beforeFrame: [true],
			afterFrame: [true, false],
			immediate: [true, false, true, false],
		});
	});

	test('hides the page at once when its container is hidden after a deferred hide in the same frame', async () => {
		const calls: boolean[] = [];
		let visible = false;
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.test',
			error: undefined,
			screenshot: undefined,
			focused: false,
			get visible() { return visible; },
			onDidChangeVisibility: Event.None,
			onDidKeyCommand: Event.None,
			onDidNavigate: Event.None,
			onDidChangeLoadingState: Event.None,
			onWillDispose: Event.None,
			setVisible: async (value: boolean) => {
				calls.push(value);
				visible = value;
			},
			captureScreenshot: () => new Promise<VSBuffer>(() => { }),
		});
		const host = createHost();

		host.setModel(model);
		host.setVisible(true);
		// A layout hides the page for the next frame, then its container is hidden in the same frame.
		host.setVisible(false);
		host.setVisible(false, true);
		const beforeFrame = [...calls];
		await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));

		assert.deepStrictEqual({ beforeFrame, visibleAfterFrame: visible }, {
			beforeFrame: [true, false],
			visibleAfterFrame: false,
		});
	});

	test('dims the page for overlays only when the setting is enabled', async () => {
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.test',
			error: undefined,
			screenshot: undefined,
			focused: false,
			visible: true,
			onDidChangeVisibility: Event.None,
			onDidKeyCommand: Event.None,
			onDidNavigate: Event.None,
			onDidChangeLoadingState: Event.None,
			onWillDispose: Event.None,
			setVisible: async () => { },
			captureScreenshot: () => new Promise<VSBuffer>(() => { }),
		});
		const configurationService = new TestConfigurationService({ workbench: { browser: { dimOnOverlay: false } } });
		const host = createHost([], configurationService);

		const place = (className: string) => {
			const element = mainWindow.document.createElement('div');
			element.className = className;
			element.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px';
			mainWindow.document.body.appendChild(element);
			store.add({ dispose: () => element.remove() });
			return element;
		};
		const container = place('test-browser-container');
		host.onContainerCreated(container);
		host.setModel(model);
		host.setVisible(true);

		const menu = place('monaco-menu-container');
		host.layout();
		const disabled = host.pauseElement.classList.contains('visible');

		await configurationService.setUserConfiguration('workbench.browser.dimOnOverlay', true);
		configurationService.onDidChangeConfigurationEmitter.fire({ source: ConfigurationTarget.USER, affectedKeys: new Set(['workbench.browser.dimOnOverlay']), change: { keys: [], overrides: [] }, affectsConfiguration: () => true });
		const enabled = host.pauseElement.classList.contains('visible');

		menu.remove();
		host.layout();
		const cleared = host.pauseElement.classList.contains('visible');

		await configurationService.setUserConfiguration('workbench.browser.dimOnOverlay', false);
		place('notifications-center');
		host.layout();
		const notification = host.pauseElement.classList.contains('visible') && host.pauseElement.classList.contains('show-message');

		assert.deepStrictEqual({ disabled, enabled, cleared, notification }, { disabled: false, enabled: true, cleared: false, notification: true });
	});

	for (const [overlayClass, paused] of [['screenshot-tool-overlay', false], ['monaco-dialog-modal-block', true]] as const) {
		test(`hides the page under ${overlayClass} ${paused ? 'and shows' : 'without showing'} that it is paused, and ${paused ? 'tells' : 'does not tell'} the screenshot tool that UI covers it`, async () => {
			const calls: boolean[] = [];
			let visible = false;
			const model = upcastPartial<IBrowserViewModel>({
				url: 'https://example.test',
				error: undefined,
				screenshot: undefined,
				focused: false,
				get visible() { return visible; },
				onDidChangeVisibility: Event.None,
				onDidKeyCommand: Event.None,
				onDidNavigate: Event.None,
				onDidChangeLoadingState: Event.None,
				onWillDispose: Event.None,
				setVisible: async (value: boolean) => {
					calls.push(value);
					visible = value;
				},
				captureScreenshot: () => new Promise<VSBuffer>(() => { }),
			});
			const layers: IScreenshotToolLayer[] = [];
			const host = createHost(layers);
			const container = $('div');
			container.style.cssText = 'position: fixed; left: 0; top: 0; width: 100px; height: 100px;';
			const overlay = $(`div.${overlayClass}`);
			overlay.style.cssText = 'position: fixed; inset: 0; z-index: 10000;';
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => { container.remove(); overlay.remove(); }));
			host.onContainerCreated(container);
			host.setModel(model);
			host.setVisible(true);

			mainWindow.document.body.appendChild(overlay);
			for (let frame = 0; frame < 2; frame++) {
				await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
			}

			assert.deepStrictEqual({ calls, paused: host.pauseElement.classList.contains('visible'), covered: layers.map(layer => layer.covered) }, { calls: [true, false], paused, covered: [paused] });
		});
	}

	test('offers its page to the screenshot tool while its container presents the page', async () => {
		const layers: IScreenshotToolLayer[] = [];
		const page = VSBuffer.fromString('page');
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.test',
			error: undefined,
			screenshot: undefined,
			focused: false,
			// The page never reports itself visible, so the host keeps no placeholder screenshot loop running.
			visible: false,
			onDidChangeVisibility: Event.None,
			onDidKeyCommand: Event.None,
			onDidNavigate: Event.None,
			onDidChangeLoadingState: Event.None,
			onWillDispose: Event.None,
			setVisible: async () => { },
			captureScreenshot: async () => page,
		});
		const host = createHost(layers);
		const container = $('div');
		host.onContainerCreated(container);
		host.setModel(model);
		const beforeShown = layers.map(layer => layer.element);
		host.setVisible(true);
		const shown = layers.map(layer => layer.element === container);
		const captured = await layers[0].capture();
		host.setVisible(false, true);

		assert.deepStrictEqual({
			beforeShown, shown, capturesOnClick: layers[0].capturesOnClick, covered: layers[0].covered, url: layers[0].url,
			captured: captured && { data: captured.data.toString(), mimeType: captured.mimeType },
			afterHidden: layers.map(layer => layer.element),
		}, {
			beforeShown: [undefined], shown: [true], capturesOnClick: true, covered: false, url: 'https://example.test',
			captured: { data: 'page', mimeType: 'image/jpeg' },
			afterHidden: [undefined],
		});
	});
});
