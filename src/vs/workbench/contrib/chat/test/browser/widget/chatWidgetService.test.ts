/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatWidget, IQuickChatService } from '../../../browser/chat.js';
import { ChatWidgetService } from '../../../browser/widget/chatWidgetService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatWidgetService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes focus-local actions to embedded widgets without globally discovering them', async () => {
		const service = disposables.add(new ChatWidgetService(
			upcastPartial<IEditorGroupsService>({}),
			upcastPartial<IViewsService>({}),
			upcastPartial<IQuickChatService>({}),
			upcastPartial<ILayoutService>({}),
			upcastPartial<IEditorService>({}),
			upcastPartial<IChatService>({}),
			new NullLogService(),
		));
		const primaryFocus = disposables.add(new Emitter<void>());
		const primaryNode = mainWindow.document.createElement('div');
		const embeddedNode = mainWindow.document.createElement('div');
		primaryNode.tabIndex = -1;
		embeddedNode.tabIndex = -1;
		mainWindow.document.body.append(primaryNode, embeddedNode);
		disposables.add({ dispose: () => { primaryNode.remove(); embeddedNode.remove(); } });
		const primaryResource = URI.parse('test:///primary');
		const embeddedResource = URI.parse('test:///embedded');
		const primary = upcastPartial<IChatWidget>({
			domNode: primaryNode,
			onDidFocus: primaryFocus.event,
			onDidShow: Event.None,
			onDidHide: Event.None,
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: primaryResource }),
		});
		const embedded = upcastPartial<IChatWidget>({
			domNode: embeddedNode,
			isEmbedded: true,
			onDidFocus: Event.None,
			onDidShow: Event.None,
			onDidHide: Event.None,
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: embeddedResource }),
		});
		const added: IChatWidget[] = [];
		const removed: IChatWidget[] = [];
		let focusedEventCount = 0;
		disposables.add(service.onDidAddWidget(widget => added.push(widget)));
		disposables.add(service.onDidRemoveWidget(widget => removed.push(widget)));
		disposables.add(service.onDidChangeFocusedWidget(() => focusedEventCount++));
		disposables.add(service.register(primary));
		const embeddedRegistration = service.register(embedded);

		embeddedNode.dispatchEvent(new FocusEvent('focus'));
		const focusedEmbedded = service.lastFocusedWidget;
		const surfaceWhileEmbedded = service.lastFocusedChatSurface;
		embeddedNode.dispatchEvent(new FocusEvent('blur'));
		await timeout(0);
		const restoredPrimary = service.lastFocusedWidget;
		const embeddedLookup = service.getWidgetBySessionResource(embeddedResource);
		embeddedRegistration.dispose();

		assert.deepStrictEqual({
			allWidgets: service.getAllWidgets(),
			added,
			removed,
			focusedEventCount,
			focusedEmbedded,
			surfaceWhileEmbedded,
			restoredPrimary,
			embeddedLookup,
		}, {
			allWidgets: [primary],
			added: [primary],
			removed: [],
			focusedEventCount: 1,
			focusedEmbedded: embedded,
			surfaceWhileEmbedded: primary,
			restoredPrimary: primary,
			embeddedLookup: undefined,
		});
	});
});
