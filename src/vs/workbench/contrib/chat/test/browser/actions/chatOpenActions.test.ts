/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationHandle, INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IChatViewOpenOptions, ModeOpenChatGlobalAction } from '../../../browser/actions/chatActions.js';
import { IChatViewHostDelegate, IChatWidgetService } from '../../../browser/chat.js';
import { ChatMode, IChatMode } from '../../../common/chatModes.js';
import { ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { FocusAgentSessionsAction, ToggleAgentSessionsSidebar } from '../../../browser/agentSessions/agentSessionsActions.js';
import { ContinueInlineChatInChatViewAction } from '../../../../inlineChat/browser/inlineChatActions.js';
import { CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_TERMINATED, CTX_INLINE_CHAT_VISIBLE } from '../../../../inlineChat/common/inlineChat.js';

suite('Open Chat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('while something replaces the Chat view, what only local chat serves shows that it is not available, and opens nothing', async () => {
		const calls: string[] = [];
		const delegate: IChatViewHostDelegate = {
			reveal: async () => { calls.push('reveal'); return undefined; },
			openSession: async () => { calls.push('openSession'); return undefined; },
			toggle: async () => { calls.push('toggle'); },
			prefillInput: async () => { calls.push('prefillInput'); },
		};
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			chatViewHostDelegate: delegate,
			revealWidget: async () => { calls.push('revealWidget'); return undefined; },
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ info: () => { calls.push('notification'); return upcastPartial<INotificationHandle>({}); } }));
		const openChat = (mode: IChatMode, opts?: IChatViewOpenOptions) => instantiationService.invokeFunction(accessor => new class extends ModeOpenChatGlobalAction {
			constructor() { super(mode); }
		}().run(accessor, opts));

		await openChat(ChatMode.Ask);
		await openChat(ChatMode.Agent, { query: 'refactor this', mode: ChatModeKind.Edit });
		await openChat(ChatMode.Agent, { query: ' @workspace where is the layout?' });

		assert.deepStrictEqual(calls, ['notification', 'notification', 'notification']);
	});

	test('while the Agents view replaces the Chat view, what needs the Chat view or local chat is not enabled', () => {
		const modeAction = (mode: IChatMode) => new class extends ModeOpenChatGlobalAction {
			constructor() { super(mode); }
		}();
		const preconditions = {
			openAsk: modeAction(ChatMode.Ask).desc.precondition,
			openEdit: modeAction(ChatMode.Edit).desc.precondition,
			openAgent: modeAction(ChatMode.Agent).desc.precondition,
			askInChat: new ContinueInlineChatInChatViewAction().desc.precondition,
			focusAgentSessions: new FocusAgentSessionsAction().desc.precondition,
			toggleAgentSessionsSidebar: new ToggleAgentSessionsSidebar().desc.precondition,
		};
		const enabled = (agentsViewActive: boolean) => {
			const values: Record<string, unknown> = {
				[ChatContextKeys.enabled.key]: true,
				[CTX_INLINE_CHAT_HAS_AGENT.key]: true,
				[CTX_INLINE_CHAT_VISIBLE.key]: true,
				[CTX_INLINE_CHAT_TERMINATED.key]: true,
				[`config.${ChatConfiguration.ChatViewSessionsEnabled}`]: true,
				[ChatContextKeys.agentsViewActive.key]: agentsViewActive,
			};
			const context = { getValue: <T>(key: string) => values[key] as T };
			return Object.fromEntries(Object.entries(preconditions).map(([name, precondition]) => [name, precondition?.evaluate(context) ?? true]));
		};

		assert.deepStrictEqual({ chatView: enabled(false), agentsView: enabled(true) }, {
			chatView: { openAsk: true, openEdit: true, openAgent: true, askInChat: true, focusAgentSessions: true, toggleAgentSessionsSidebar: true },
			agentsView: { openAsk: false, openEdit: false, openAgent: true, askInChat: false, focusAgentSessions: false, toggleAgentSessionsSidebar: false },
		});
	});
});
