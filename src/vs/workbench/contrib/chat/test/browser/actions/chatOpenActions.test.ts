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
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatViewHostService, IChatViewHostSessionStart } from '../../../browser/chatViewHost.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { AgentSessionProviders, AgentSessionsViewerOrientation, IAgentSessionsControl } from '../../../browser/agentSessions/agentSessions.js';
import { ChatSessionPosition, openChatSessionAndSend } from '../../../browser/chatSessions/chatSessions.contribution.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { ChatMode, IChatMode } from '../../../common/chatModes.js';
import { ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { FindAgentSessionInViewerAction, FocusAgentSessionsAction, HideAgentSessionsSidebar, RefreshAgentSessionsViewerAction, SetAgentSessionsOrientationSideBySideAction, SetAgentSessionsOrientationStackedAction, ShowAgentSessionsSidebar, ToggleAgentSessionsSidebar, ToggleShowAgentSessionsAction } from '../../../browser/agentSessions/agentSessionsActions.js';
import { ContinueInlineChatInChatViewAction } from '../../../../inlineChat/browser/inlineChatActions.js';
import { CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_TERMINATED, CTX_INLINE_CHAT_VISIBLE } from '../../../../inlineChat/common/inlineChat.js';

import { IChatAgentData, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ISCMService } from '../../../../scm/common/scm.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatSendResult, IChatService } from '../../../common/chatService/chatService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';

suite('Open Chat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('while the Agents view replaces the Chat view, Open Chat asked for what only local chat serves shows that it is not available, and opens nothing', async () => {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		const contextKeyService = new MockContextKeyService();
		contextKeyService.createKey(ChatContextKeys.agentsViewActive.key, true);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			revealWidget: async () => { calls.push('revealWidget'); return undefined; },
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ info: () => { calls.push('notification'); return upcastPartial<INotificationHandle>({}); } }));
		instantiationService.stub(IChatAgentService, upcastPartial<IChatAgentService>({
			getAgentsByName: name => name === 'workspace' ? [upcastPartial<IChatAgentData>({ name })] : [],
			getAgentByFullyQualifiedId: () => undefined,
		}));
		const unrelatedServices: ServiceIdentifier<unknown>[] = [IChatService, ILanguageModelToolsService, IHostService, ICommandService, IFileService, ILanguageModelsService, ISCMService, IConfigurationService];
		for (const service of unrelatedServices) {
			instantiationService.stub(service, {});
		}
		const openChat = (mode: IChatMode, opts?: IChatViewOpenOptions) => instantiationService.invokeFunction(accessor => new class extends ModeOpenChatGlobalAction {
			constructor() { super(mode); }
		}().run(accessor, opts));

		// A precondition cannot see the arguments, such as the mode or the chat participant a caller asks for
		await openChat(ChatMode.Agent, { query: 'refactor this', mode: ChatModeKind.Edit });
		await openChat(ChatMode.Agent, { query: ' @workspace where is the layout?' });

		// Leading `@` text that names no participant, such as a decorator, is a plain query
		await openChat(ChatMode.Agent, { query: '@dataclass\nclass Point: ...' });

		assert.deepStrictEqual(calls, ['notification', 'notification', 'revealWidget']);
	});

	test('a session opened in the Chat view starts, moves and completes in the host of the Chat view\'s chats, which holds what it needs until the start ends, and gets back a request it does not show', async () => {
		const calls: unknown[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		let sendKind: 'sent' | 'failed' = 'sent';
		let startFails = false;
		let composerAvailable = true;
		const prepared = URI.from({ scheme: AgentSessionProviders.AgentHostCopilot, path: '/untitled-prepared' });
		const materialized = URI.from({ scheme: AgentSessionProviders.AgentHostCopilot, path: '/session-1' });
		const composer = upcastPartial<IChatWidget>({
			setInput: (query?: string) => { calls.push({ composerInput: query }); },
			attachmentModel: upcastPartial<IChatWidget['attachmentModel']>({ addContext: (...entries: IChatRequestVariableEntry[]) => { calls.push({ composerContext: entries.map(entry => entry.id) }); } }),
		});
		// A host that shows only sessions whose request ran, such as the Agents view, and holds the session's model meanwhile
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			startSession: async (resource, options) => {
				calls.push({ start: resource.toString(), local: options.local });
				if (startFails) {
					throw new Error('cannot show');
				}
				calls.push('hold');
				return upcastPartial<IChatViewHostSessionStart>({
					moved: async moved => { calls.push({ moved: moved.toString() }); },
					complete: async (completed, sent) => { calls.push({ complete: completed.toString(), sent }); return sent; },
					createComposer: async () => { calls.push('composer'); return composerAvailable ? composer : undefined; },
					dispose: () => { calls.push('release'); },
				});
			},
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			sendRequest: async (resource, prompt) => {
				calls.push({ send: prompt, to: resource.toString() });
				if (sendKind === 'failed') {
					throw new Error('send failed');
				}
				return upcastPartial<ChatSendResult>({ kind: 'sent', newSessionResource: materialized });
			},
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			warn: () => { calls.push('requestRestoredNotice'); return upcastPartial<INotificationHandle>({}); },
			error: () => { calls.push('requestNotSentError'); return upcastPartial<INotificationHandle>({}); },
		}));
		instantiationService.stub(IAgentHostImportConversationStore, upcastPartial<IAgentHostImportConversationStore>({ take: () => { calls.push('importDropped'); return undefined; } }));
		instantiationService.stub(IAgentHostActiveClientService, upcastPartial<IAgentHostActiveClientService>({
			setSessionTools: () => { }, moveSessionTools: () => { }, clearSessionTools: () => { },
		}));
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ error: () => { } }));
		const services: ServiceIdentifier<unknown>[] = [IChatSessionsService, IEditorGroupsService, IEditorService, ICustomizationHarnessService, ILanguageModelToolsService];
		for (const service of services) {
			instantiationService.stub(service, {});
		}
		const open = (type: string, sessionResource?: URI, chatSendOptions?: Parameters<typeof openChatSessionAndSend>[2]) => instantiationService.invokeFunction(accessor => openChatSessionAndSend(accessor, { type, displayName: type, position: ChatSessionPosition.Sidebar, sessionResource }, chatSendOptions));
		const plain = { prompt: 'review this', attachedContext: [upcastPartial<IChatRequestVariableEntry>({ id: 'file' })] };
		const start = { start: prepared.toString(), local: false };
		const send = { send: 'review this', to: prepared.toString() };
		const steps: Record<string, unknown> = {};
		const run = async (name: string, ...args: Parameters<typeof open>) => { const result = await open(...args); steps[name] = { result, calls: calls.splice(0) }; };

		await run('sent', AgentSessionProviders.AgentHostCopilot, prepared, plain);
		sendKind = 'failed';
		await run('restored', AgentSessionProviders.AgentHostCopilot, prepared, plain);
		await run('withTools', AgentSessionProviders.AgentHostCopilot, prepared, { ...plain, sessionToolIds: ['report'] });
		composerAvailable = false;
		await run('noComposer', AgentSessionProviders.AgentHostCopilot, prepared, plain);
		await run('opened', AgentSessionProviders.AgentHostCopilot, prepared);
		startFails = true;
		await run('notShown', AgentSessionProviders.AgentHostCopilot, prepared, plain);

		assert.deepStrictEqual(steps, {
			sent: { result: { resource: materialized, sendOutcome: 'sent' }, calls: [start, 'hold', send, { moved: materialized.toString() }, { complete: materialized.toString(), sent: true }, 'release'] },
			// A request of only a prompt and attachments that did not run stays in the input of a new session, to send again
			restored: {
				result: { resource: prepared, sendOutcome: 'failed' },
				calls: [start, 'hold', send, { complete: prepared.toString(), sent: false }, 'importDropped', 'composer', { composerInput: 'review this' }, { composerContext: ['file'] }, 'requestRestoredNotice', 'release'],
			},
			// One with tools would start a different session from a composer: it only says it was not sent
			withTools: { result: { resource: prepared, sendOutcome: 'failed' }, calls: [start, 'hold', send, { complete: prepared.toString(), sent: false }, 'importDropped', 'requestNotSentError', 'release'] },
			noComposer: { result: { resource: prepared, sendOutcome: 'failed' }, calls: [start, 'hold', send, { complete: prepared.toString(), sent: false }, 'importDropped', 'composer', 'requestNotSentError', 'release'] },
			opened: { result: { resource: prepared, sendOutcome: 'none' }, calls: [start, 'hold', { complete: prepared.toString(), sent: false }, 'release'] },
			// A host that cannot show it opens nothing and sends nothing
			notShown: { result: undefined, calls: [start] },
		});
	});

	test('Refresh and Find act on the sessions control they are given, also while the Agents view replaces the Chat view', async () => {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		const control = upcastPartial<IAgentSessionsControl>({ refresh: () => { calls.push('refresh'); }, openFind: () => { calls.push('find'); } });
		const actions = [new RefreshAgentSessionsViewerAction(), new FindAgentSessionInViewerAction()];

		for (const action of actions) {
			await instantiationService.invokeFunction(accessor => action.run(accessor, control));
		}

		// Only the Chat view's sessions toolbar offers them, with its control: they are not gated on the Chat view showing
		assert.deepStrictEqual({ calls, preconditions: actions.map(action => action.desc.precondition) }, { calls: ['refresh', 'find'], preconditions: [undefined, undefined] });
	});

	test('while the Agents view replaces the Chat view, what needs local chat or the Chat view\'s sessions is not enabled', () => {
		const modeAction = (mode: IChatMode) => new class extends ModeOpenChatGlobalAction {
			constructor() { super(mode); }
		}();
		const preconditions = {
			openAsk: modeAction(ChatMode.Ask).desc.precondition,
			openEdit: modeAction(ChatMode.Edit).desc.precondition,
			openAgent: modeAction(ChatMode.Agent).desc.precondition,
			askInChat: new ContinueInlineChatInChatViewAction().desc.precondition,
			showSessions: new ToggleShowAgentSessionsAction().desc.precondition,
			orientationStacked: new SetAgentSessionsOrientationStackedAction().desc.precondition,
			orientationSideBySide: new SetAgentSessionsOrientationSideBySideAction().desc.precondition,
			showSidebar: new ShowAgentSessionsSidebar().desc.precondition,
			hideSidebar: new HideAgentSessionsSidebar().desc.precondition,
			toggleSidebar: new ToggleAgentSessionsSidebar().desc.precondition,
			focusSessions: new FocusAgentSessionsAction().desc.precondition,
		};
		const enabled = (agentsViewActive: boolean, orientation: number) => {
			const values: Record<string, unknown> = {
				[ChatContextKeys.enabled.key]: true,
				[CTX_INLINE_CHAT_HAS_AGENT.key]: true,
				[CTX_INLINE_CHAT_VISIBLE.key]: true,
				[CTX_INLINE_CHAT_TERMINATED.key]: true,
				[`config.${ChatConfiguration.ChatViewSessionsEnabled}`]: true,
				[ChatContextKeys.agentSessionsViewerOrientation.key]: orientation,
				[ChatContextKeys.agentsViewActive.key]: agentsViewActive,
			};
			const context = { getValue: <T>(key: string) => values[key] as T };
			return Object.fromEntries(Object.entries(preconditions).map(([name, precondition]) => [name, precondition?.evaluate(context) ?? true]));
		};
		const all = (value: boolean) => Object.fromEntries(Object.keys(preconditions).map(name => [name, value]));

		// Show and Hide Agent Sessions Sidebar are each enabled in one orientation: both are checked in the one they need
		const chatView = { ...enabled(false, AgentSessionsViewerOrientation.Stacked), hideSidebar: enabled(false, AgentSessionsViewerOrientation.SideBySide).hideSidebar };
		const agentsView = { ...enabled(true, AgentSessionsViewerOrientation.Stacked), hideSidebar: enabled(true, AgentSessionsViewerOrientation.SideBySide).hideSidebar };
		assert.deepStrictEqual({ chatView, agentsView }, { chatView: all(true), agentsView: { ...all(false), openAgent: true } });
	});
});
