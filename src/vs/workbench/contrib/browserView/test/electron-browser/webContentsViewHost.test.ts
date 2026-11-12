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
import { IBrowserViewCaptureScreenshotOptions } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { WebContentsViewHost } from '../../electron-browser/webContentsViewHost.js';

suite('WebContentsViewHost', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(configurationService: IConfigurationService = new TestConfigurationService()): WebContentsViewHost {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(IConfigurationService, configurationService);
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
		const host = createHost(configurationService);

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

	for (const [overlayClasses, paused] of [
		[['screenshot-tool-overlay'], false],
		[['monaco-dialog-modal-block'], true],
		[['screenshot-annotation-editor'], true],
		// Other overlays still pause the page while the screenshot tool's overlay covers it too.
		[['screenshot-tool-overlay', 'notification-toast-container'], true],
	] as const) {
		test(`hides the page under ${overlayClasses.join(' and ')} ${paused ? 'and shows' : 'without showing'} that it is paused`, async () => {
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
			const container = $('div');
			container.style.cssText = 'position: fixed; left: 0; top: 0; width: 100px; height: 100px;';
			// Each overlay is on top at the center of where it covers the page, which is where overlays are hit-tested.
			const overlays = overlayClasses.map((overlayClass, index) => {
				const overlay = $(`div.${overlayClass}`);
				overlay.style.cssText = index === 0
					? 'position: fixed; inset: 0; z-index: 10000;'
					: 'position: fixed; left: 60px; top: 60px; width: 40px; height: 40px; z-index: 10001;';
				return overlay;
			});
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => { container.remove(); overlays.forEach(overlay => overlay.remove()); }));
			host.onContainerCreated(container);
			host.setModel(model);
			host.setVisible(true);

			mainWindow.document.body.append(...overlays);
			for (let frame = 0; frame < 2; frame++) {
				await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
			}

			assert.deepStrictEqual({ calls, paused: host.pauseElement.classList.contains('visible') }, { calls: [true, false], paused });
		});
	}

	test('requests DevTools in the placeholder screenshot', () => {
		const requests: (IBrowserViewCaptureScreenshotOptions | undefined)[] = [];
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
			captureScreenshot: (options?: IBrowserViewCaptureScreenshotOptions) => {
				requests.push(options);
				return new Promise<VSBuffer>(() => { });
			},
		});
		const host = createHost();

		host.setModel(model);

		assert.deepStrictEqual({ captured: requests.length > 0, allIncludeDevTools: requests.every(options => options?.includeDevTools) }, { captured: true, allIncludeDevTools: true });
	});
});
