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
import { IBrowserViewCaptureScreenshotOptions } from '../../../../../platform/browserView/common/browserView.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { WebContentsViewHost } from '../../electron-browser/webContentsViewHost.js';

suite('WebContentsViewHost', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses stable capturePage screenshots for the live corner underlay', () => {
		const captureOptions: (IBrowserViewCaptureScreenshotOptions | undefined)[] = [];
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.com',
			visible: true,
			focused: false,
			onDidChangeVisibility: Event.None,
			onDidKeyCommand: Event.None,
			onDidNavigate: Event.None,
			onDidChangeLoadingState: Event.None,
			onWillDispose: Event.None,
			captureScreenshot: async options => {
				captureOptions.push(options);
				return VSBuffer.fromString('screenshot');
			},
			setVisible: async () => { },
		});
		const host = store.add(new WebContentsViewHost(mainWindow, () => { }, new NullLogService(), new MockKeybindingService()));

		host.setVisible(true);
		host.setModel(model);

		assert.deepStrictEqual({
			captureOptions,
			fillsNativeCornerClip: host.screenshotElement.classList.contains('browser-placeholder-screenshot--corner-fill'),
		}, {
			captureOptions: [{ quality: 80 }],
			fillsNativeCornerClip: true,
		});
	});
});
