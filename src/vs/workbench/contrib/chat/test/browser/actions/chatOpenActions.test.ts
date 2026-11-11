/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
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
import { ChatSendResult, IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentHostImportConversation, IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
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

	test('a session opened in the Chat view while something replaces it is created and sent to as anywhere, with its tools, options and copied conversation, and shows there, or its request stays to send again', async () => {
		const calls: unknown[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		let sendKind: 'sent' | 'rejected' | 'failed' = 'sent';
		const prepared = URI.from({ scheme: AgentSessionProviders.AgentHostCopilot, path: '/untitled-prepared' });
		const materialized = URI.from({ scheme: AgentSessionProviders.AgentHostCopilot, path: '/session-1' });
		const listed = [materialized.toString()];
		let composerAvailable = true;
		const composer = upcastPartial<IChatWidget>({
			setInput: (query?: string) => { calls.push({ composerInput: query }); },
			attachmentModel: upcastPartial<IChatWidget['attachmentModel']>({ addContext: (...entries: IChatRequestVariableEntry[]) => { calls.push({ composerContext: entries.map(entry => entry.id) }); } }),
		});
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			chatViewHostDelegate: upcastPartial<IChatViewHostDelegate>({
				openSession: async resource => { calls.push({ show: resource.toString() }); return listed.includes(resource.toString()) ? upcastPartial<IChatWidget>({}) : undefined; },
				newSession: async sessionType => { calls.push({ composer: sessionType }); return composerAvailable ? composer : undefined; },
			}),
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			info: () => { calls.push('notification'); return upcastPartial<INotificationHandle>({}); },
			warn: () => { calls.push('requestRestoredNotice'); return upcastPartial<INotificationHandle>({}); },
			error: () => { calls.push('requestNotSentError'); return upcastPartial<INotificationHandle>({}); },
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			acquireOrLoadSession: async resource => { calls.push({ load: resource.toString() }); return upcastPartial<IChatModelReference>({ dispose: () => calls.push('release') }); },
			sendRequest: async (resource, prompt) => {
				calls.push({ send: prompt, to: resource.toString() });
				switch (sendKind) {
					case 'sent': return upcastPartial<ChatSendResult>({ kind: 'sent', newSessionResource: materialized });
					case 'rejected': return upcastPartial<ChatSendResult>({ kind: 'rejected', newSessionResource: materialized });
					case 'failed': throw new Error('send failed');
				}
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ updateSessionOptions: (resource, options) => { calls.push({ options: [...options.keys()] }); return true; } }));
		instantiationService.stub(IAgentHostActiveClientService, upcastPartial<IAgentHostActiveClientService>({
			setSessionTools: (_resource, ids) => { calls.push({ tools: ids }); },
			moveSessionTools: (_from, to) => { calls.push({ toolsMovedTo: to.toString() }); },
			clearSessionTools: () => { calls.push('toolsCleared'); },
		}));
		instantiationService.stub(IAgentHostImportConversationStore, upcastPartial<IAgentHostImportConversationStore>({
			set: () => { calls.push('imported'); },
			take: () => { calls.push('importDropped'); return undefined; },
		}));
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ error: () => { } }));
		// Opening the Chat view or an editor would fail: nothing shows in them
		const services: ServiceIdentifier<unknown>[] = [IViewsService, IEditorGroupsService, IEditorService, ICustomizationHarnessService, ILanguageModelToolsService, IProgressService];
		for (const service of services) {
			instantiationService.stub(service, {});
		}
		const open = (type: string, chatSendOptions?: Parameters<typeof openChatSessionAndSend>[2]) => instantiationService.invokeFunction(accessor => openChatSessionAndSend(accessor, { type, displayName: type, position: ChatSessionPosition.Sidebar, sessionResource: chatSendOptions ? prepared : undefined }, chatSendOptions));
		const sendOptions = {
			prompt: 'review this',
			attachedContext: [upcastPartial<IChatRequestVariableEntry>({ id: 'file' })],
			initialSessionOptions: new Map([['model', 'gpt']]),
			sessionToolIds: ['report'],
			importConversation: upcastPartial<IAgentHostImportConversation>({ turns: [upcastPartial<IAgentHostImportConversation['turns'][number]>({})] }),
		};
		const prologue = [{ tools: ['report'] }, 'imported', { load: prepared.toString() }, { options: ['model'] }, { send: 'review this', to: prepared.toString() }];

		const sent = await open(AgentSessionProviders.AgentHostCopilot, sendOptions);
		const sentCalls = calls.splice(0);
		sendKind = 'rejected';
		const rejected = await open(AgentSessionProviders.AgentHostCopilot, sendOptions);
		const rejectedCalls = calls.splice(0);
		sendKind = 'failed';
		const failed = await open(AgentSessionProviders.AgentHostCopilot, sendOptions);
		const failedCalls = calls.splice(0);
		const plainOptions = { prompt: 'review this', attachedContext: sendOptions.attachedContext };
		const failedPlain = await open(AgentSessionProviders.AgentHostCopilot, plainOptions);
		const failedPlainCalls = calls.splice(0);
		composerAvailable = false;
		await open(AgentSessionProviders.AgentHostCopilot, plainOptions);
		const failedPlainNoComposerCalls = calls.splice(0);
		composerAvailable = true;
		const others = [await open(AgentSessionProviders.AgentHostCopilot), await open(AgentSessionProviders.Local, { prompt: 'hi' })];

		assert.deepStrictEqual({ sent, sentCalls, rejected, rejectedCalls, failed, failedCalls, failedPlain, failedPlainCalls, failedPlainNoComposerCalls, others, othersCalls: calls }, {
			sent: { resource: materialized, sendOutcome: 'sent' },
			sentCalls: [...prologue, { toolsMovedTo: materialized.toString() }, { show: materialized.toString() }, 'release'],
			// A rejected request whose session became real shows that session
			rejected: { resource: materialized, sendOutcome: 'rejected' },
			rejectedCalls: [...prologue, { toolsMovedTo: materialized.toString() }, 'toolsCleared', { show: materialized.toString() }, 'release'],
			// A failed send of a session that is not listed, whose copied conversation, options and tools a composer cannot
			// carry, opens none: it says the request was not sent, for its caller to report
			failed: { resource: prepared, sendOutcome: 'failed' },
			failedCalls: [...prologue, 'toolsCleared', { show: prepared.toString() }, 'importDropped', 'requestNotSentError', 'release'],
			// A request of only a prompt and attachments stays in the input of a new session, to send again
			failedPlain: { resource: prepared, sendOutcome: 'failed' },
			failedPlainCalls: [
				{ load: prepared.toString() }, { send: 'review this', to: prepared.toString() }, { show: prepared.toString() },
				'importDropped', { composer: AgentSessionProviders.AgentHostCopilot }, { composerInput: 'review this' }, { composerContext: ['file'] }, 'requestRestoredNotice',
				'release',
			],
			// Without a composer, it only says the request was not sent
			failedPlainNoComposerCalls: [
				{ load: prepared.toString() }, { send: 'review this', to: prepared.toString() }, { show: prepared.toString() },
				'importDropped', { composer: AgentSessionProviders.AgentHostCopilot }, 'requestNotSentError',
				'release',
			],
			others: [undefined, undefined],
			othersCalls: [{ composer: AgentSessionProviders.AgentHostCopilot }, 'notification'],
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
