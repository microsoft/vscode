/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRectangle } from '../../../../../platform/window/common/window.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { openChatWindowAtDragEnd } from '../../browser/chatWindowDragOut.js';

suite('Chat Window Drag Out', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const chat = URI.parse('test-chat:/a');
	const session = new class extends mock<ISession>() {
		override readonly sessionId = 'session';
	}();
	const outside = mainWindow.screenX + mainWindow.outerWidth + 5000;

	function setup(options: { readonly enabled: boolean; readonly hasProvider?: boolean; readonly dragToOpenWindow?: boolean }) {
		// No drag over a window lingers from an earlier test
		mainWindow.dispatchEvent(new DragEvent('dragleave'));

		const opened: { session: string; chat: string; bounds: Partial<IRectangle> }[] = [];
		const hostService = new class extends mock<IHostService>() {
			override async getCursorScreenPoint() { return { point: { x: outside + 500, y: 500 }, display: { x: outside, y: 0, width: 2000, height: 2000 } }; }
		}();
		const context = {
			hostService,
			isEnabled: () => options.enabled,
			dragToOpenWindow: () => options.dragToOpenWindow ?? true,
			hasProvider: observableValue('hasProvider', options.hasProvider ?? true),
			open: async (session: ISession, chat: URI, openOptions: { readonly bounds: Partial<IRectangle> }) => { opened.push({ session: session.sessionId, chat: chat.toString(), bounds: openOptions.bounds }); }
		};
		const element = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		element.style.cssText = 'width: 200px; height: 100px;';

		const dragEnd = async (init?: DragEventInit, dropEffect?: DataTransfer['dropEffect']) => {
			const event = new DragEvent('dragend', init);
			if (dropEffect) {
				// A drag the browser did not start keeps `none`: stand in for one that something accepted
				Object.defineProperty(event, 'dataTransfer', { value: { dropEffect } });
			}
			try {
				return await openChatWindowAtDragEnd(context, event, element, session, chat, 'Chat A');
			} finally {
				element.remove();
			}
		};

		return { opened, dragEnd };
	}

	test('a chat dragged out of the windows opens in a chat window where the drag ended', async () => {
		const { opened, dragEnd } = setup({ enabled: true });

		assert.deepStrictEqual({ result: await dragEnd(), opened }, { result: true, opened: [{ session: 'session', chat: chat.toString(), bounds: { x: outside + 400, y: 420 } }] });
	});

	test('a chat drag that ends over a window, with chat windows not enabled, or without a provider, opens nothing', async () => {
		const overWindow = setup({ enabled: true });
		mainWindow.document.dispatchEvent(new DragEvent('dragover', { bubbles: true }));
		const overWindowResult = await overWindow.dragEnd();
		mainWindow.dispatchEvent(new DragEvent('dragleave'));

		const disabled = setup({ enabled: false });
		const withoutProvider = setup({ enabled: true, hasProvider: false });

		assert.deepStrictEqual({
			overWindow: { result: overWindowResult, opened: overWindow.opened.length },
			disabled: { result: await disabled.dragEnd(), opened: disabled.opened.length },
			withoutProvider: { result: await withoutProvider.dragEnd(), opened: withoutProvider.opened.length }
		}, {
			overWindow: { result: false, opened: 0 },
			disabled: { result: false, opened: 0 },
			withoutProvider: { result: false, opened: 0 }
		});
	});

	test('a chat drag out of the window follows the setting and the Alt key of tabs, and opens nothing when dropped into another app', async () => {
		const withAlt = setup({ enabled: true });
		const settingOff = setup({ enabled: true, dragToOpenWindow: false });
		const settingOffWithAlt = setup({ enabled: true, dragToOpenWindow: false });
		const intoAnotherApp = setup({ enabled: true });

		assert.deepStrictEqual({
			withAlt: await withAlt.dragEnd({ altKey: true }),
			settingOff: await settingOff.dragEnd(),
			settingOffWithAlt: await settingOffWithAlt.dragEnd({ altKey: true }),
			intoAnotherApp: await intoAnotherApp.dragEnd(undefined, 'copy'),
		}, { withAlt: false, settingOff: false, settingOffWithAlt: true, intoAnotherApp: false });
	});
});
