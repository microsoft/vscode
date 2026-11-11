/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ServiceIdentifier } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationHandle, INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IChatViewOpenOptions, ModeOpenChatGlobalAction } from '../../../browser/actions/chatActions.js';
import { IChatViewHostDelegate, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { ChatSessionPosition, openChatSessionAndSend } from '../../../browser/chatSessions/chatSessions.contribution.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
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
			newSession: async () => { calls.push('newSession'); return undefined; },
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

	test('a session opened in the Chat view while something replaces it shows there: a new session of its type, with its request sent, not local chat', async () => {
		const calls: unknown[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		const composerWidget = upcastPartial<IChatWidget>({
			attachmentModel: upcastPartial<IChatWidget['attachmentModel']>({ addContext: (...entries: IChatRequestVariableEntry[]) => { calls.push({ attached: entries.length }); } }),
			acceptInput: async (query?: string) => { calls.push({ sent: query }); return undefined; },
		});
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			chatViewHostDelegate: upcastPartial<IChatViewHostDelegate>({ newSession: async sessionType => { calls.push({ newSession: sessionType }); return composerWidget; } }),
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ info: () => { calls.push('notification'); return upcastPartial<INotificationHandle>({}); } }));
		const services: ServiceIdentifier<unknown>[] = [IViewsService, IChatService, IChatSessionsService, ILogService, IEditorGroupsService, IEditorService, ICustomizationHarnessService, ILanguageModelToolsService, IAgentHostImportConversationStore, IProgressService];
		for (const service of services) {
			instantiationService.stub(service, {});
		}
		const open = (type: string, prompt: string) => instantiationService.invokeFunction(accessor => openChatSessionAndSend(accessor, { type, displayName: type, position: ChatSessionPosition.Sidebar }, { prompt, attachedContext: [upcastPartial<IChatRequestVariableEntry>({ id: 'file' })] }));

		const results = [await open(AgentSessionProviders.AgentHostCopilot, 'review this'), await open(AgentSessionProviders.Local, 'hi')];

		assert.deepStrictEqual({ calls, results }, {
			calls: [{ newSession: AgentSessionProviders.AgentHostCopilot }, { attached: 1 }, { sent: 'review this' }, 'notification'],
			results: [undefined, undefined],
		});
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
