/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { WebContentsViewHost } from '../../electron-browser/webContentsViewHost.js';

suite('WebContentsViewHost', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		const host = store.add(instantiationService.createInstance(WebContentsViewHost, mainWindow, () => { }));

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
});
