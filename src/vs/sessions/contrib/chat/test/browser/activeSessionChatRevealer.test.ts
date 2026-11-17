/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatViewId, IChatWidget, IChatWidgetService, IQuickChatService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatWidgetService } from '../../../../../workbench/contrib/chat/browser/widget/chatWidgetService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IFocusedSessionHostService, ISessionHost } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChat } from '../../../../../workbench/services/sessions/common/session.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { ActiveSessionChatRevealerContribution } from '../../browser/activeSessionChatRevealer.js';

suite('ActiveSessionChatRevealer', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reveals the chat of the focused host before the last focused widget or the Chat view', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const openedViews: string[] = [];
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ groups: [] }));
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			getViewWithId: () => null,
			openView: async (id: string) => {
				openedViews.push(id);
				return null;
			},
		}));
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ILogService, new NullLogService());
		const chatWidgetService = store.add(instantiationService.createInstance(ChatWidgetService));
		instantiationService.stub(IChatWidgetService, chatWidgetService);

		const focused: string[] = [];
		const createWidget = (name: string, sessionResource: URI, supportsInputRequests: boolean) => upcastPartial<IChatWidget>({
			supportsInputRequests,
			viewContext: {},
			viewModel: upcastPartial<IChatViewModel>({ sessionResource }),
			focusInput: () => { focused.push(name); },
			onDidFocus: Event.None,
			onDidShow: Event.None,
			onDidHide: Event.None,
			onDidChangeViewModel: Event.None,
		});
		const activeResource = URI.parse('test:/active');
		// Registered first, so it is the last focused widget.
		store.add(chatWidgetService.register(createWidget('other', URI.parse('test:/other'), true)));
		store.add(chatWidgetService.register(createWidget('inbox', activeResource, false)));
		const active = createWidget('active', activeResource, true);
		store.add(chatWidgetService.register(active));

		const shownChat = observableValue<IChat | undefined>('shownChat', upcastPartial<IChat>({ resource: activeResource }));
		instantiationService.stub(IFocusedSessionHostService, upcastPartial<IFocusedSessionHostService>({
			getFocusedHost: () => upcastPartial<ISessionHost>({ chat: shownChat }),
		}));
		const contribution = instantiationService.createInstance(ActiveSessionChatRevealerContribution);

		const revealed = await chatWidgetService.revealWidget();
		const revealedPreservingFocus = await chatWidgetService.revealWidget(true);
		shownChat.set(undefined, undefined);
		const withoutShownChat = await chatWidgetService.revealWidget();
		shownChat.set(upcastPartial<IChat>({ resource: activeResource }), undefined);
		contribution.dispose();
		const afterDispose = await chatWidgetService.revealWidget();

		assert.deepStrictEqual({
			revealed: revealed === active,
			revealedPreservingFocus: revealedPreservingFocus === active,
			withoutShownChat,
			afterDispose,
			focused,
			openedViews,
		}, {
			revealed: true,
			revealedPreservingFocus: true,
			withoutShownChat: undefined,
			afterDispose: undefined,
			focused: ['active'],
			openedViews: [ChatViewId, ChatViewId],
		});
	});
});
