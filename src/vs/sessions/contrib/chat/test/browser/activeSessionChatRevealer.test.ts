/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent, IQuickChatService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatViewHostService } from '../../../../../workbench/contrib/chat/browser/chatViewHost.js';
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
	const activeResource = URI.parse('test:/active');

	/**
	 * The revealer on a chat widget service whose focused host shows the chat of `activeResource`, with a log of the widgets
	 * whose input it focused and of how often it fell back to the Chat view.
	 */
	function createRevealer() {
		const instantiationService = store.add(new TestInstantiationService());
		const log = { focused: [] as string[], chatViewReveals: 0 };
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ groups: [] }));
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			revealIfShowing: async () => undefined,
			reveal: async () => {
				log.chatViewReveals++;
				return undefined;
			},
		}));
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ILogService, new NullLogService());
		const chatWidgetService = store.add(instantiationService.createInstance(ChatWidgetService));
		instantiationService.stub(IChatWidgetService, chatWidgetService);

		const shownChat = observableValue<IChat | undefined>('shownChat', upcastPartial<IChat>({ resource: activeResource }));
		instantiationService.stub(IFocusedSessionHostService, upcastPartial<IFocusedSessionHostService>({
			getFocusedHost: () => upcastPartial<ISessionHost>({ chat: shownChat }),
		}));
		const contribution = store.add(instantiationService.createInstance(ActiveSessionChatRevealerContribution));

		/** Registers a widget that shows the chat of `sessionResource`, or none until it loads one. */
		const registerWidget = (name: string, sessionResource: URI | undefined, supportsInputRequests: boolean) => {
			const onDidChangeViewModel = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
			let viewModel = sessionResource && upcastPartial<IChatViewModel>({ sessionResource });
			const widget = upcastPartial<IChatWidget>({
				supportsInputRequests,
				viewContext: {},
				get viewModel() { return viewModel; },
				focusInput: () => { log.focused.push(name); },
				onDidFocus: Event.None,
				onDidShow: Event.None,
				onDidHide: Event.None,
				onDidChangeViewModel: onDidChangeViewModel.event,
			});
			store.add(chatWidgetService.register(widget));
			return {
				widget,
				load: (resource: URI) => {
					viewModel = upcastPartial<IChatViewModel>({ sessionResource: resource });
					onDidChangeViewModel.fire({ previousSessionResource: undefined, currentSessionResource: resource });
				},
			};
		};

		return { chatWidgetService, shownChat, contribution, registerWidget, log };
	}

	test('reveals the chat of the focused host before the last focused widget or the Chat view', async () => {
		const { chatWidgetService, shownChat, contribution, registerWidget, log } = createRevealer();
		// Registered first, so it is the last focused widget.
		registerWidget('other', URI.parse('test:/other'), true);
		registerWidget('inbox', activeResource, false);
		const active = registerWidget('active', activeResource, true).widget;

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
			...log,
		}, {
			revealed: true,
			revealedPreservingFocus: true,
			withoutShownChat: undefined,
			afterDispose: undefined,
			focused: ['active'],
			chatViewReveals: 2,
		});
	});

	test('waits for the view of the focused host to load its chat rather than revealing its row in the Inbox', async () => {
		const { chatWidgetService, registerWidget, log } = createRevealer();
		registerWidget('inbox', activeResource, false);
		const active = registerWidget('active', undefined, true);

		const revealing = chatWidgetService.revealWidget();
		active.load(activeResource);

		assert.deepStrictEqual({ revealed: (await revealing) === active.widget, ...log }, { revealed: true, focused: ['active'], chatViewReveals: 0 });
	});
});

