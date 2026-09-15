/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ILanguageModelToolsConfirmationService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ITerminalChatService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity } from '../../../../services/sessions/common/session.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionWorkCardContent } from '../../browser/views/sessionWorkCardContent.js';
import { addWorkCardRequest, SessionWorkCardTestChatService } from './sessionWorkCardContentTestUtils.js';

type Scenario = 'conversation' | 'tool' | 'questions' | 'readonly' | 'unavailable' | 'untrusted';

async function renderContent(context: ComponentFixtureContext, scenario: Scenario, height = 420): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.width = '480px';
	container.style.height = `${height}px`;
	const chatService = new SessionWorkCardTestChatService(disposableStore);
	const toolData: IToolData = { id: 'fixture.readFile', displayName: 'Read File', modelDescription: 'Read a workspace file', source: ToolDataSource.Internal };
	const instantiation = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IChatService, chatService);
			reg.defineInstance(ITerminalChatService, new class extends mock<ITerminalChatService>() {
				override getTerminalInstanceByExecutionId() { return undefined; }
			}());
			reg.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {
				override readonly onDidChangeTools = Event.None;
				override readonly onDidPrepareToolCallBecomeUnresponsive = Event.None;
				override getTools() { return [toolData]; }
				override getTool() { return toolData; }
			}());
			reg.defineInstance(ILanguageModelToolsConfirmationService, new class extends mock<ILanguageModelToolsConfirmationService>() {
				override getPreConfirmActions() { return []; }
				override getPostConfirmActions() { return []; }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override async canOpenSession(): Promise<boolean> { return scenario !== 'untrusted'; }
				override async openSessionReview(): Promise<void> { }
			}());
		},
	});
	const configuration = instantiation.get(IConfigurationService) as TestConfigurationService;
	configuration.setUserConfiguration('chat', { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'on' } });
	configuration.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false, bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false } });
	configuration.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
	configuration.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
	const model = disposableStore.add(instantiation.createInstance(ChatModel, undefined, {
		initialLocation: ChatAgentLocation.Chat,
		canUseTools: true,
		resource: URI.parse('card-fixture:/conversation'),
		disableBackgroundKeepAlive: true,
	}));
	if (scenario !== 'unavailable') {
		chatService.addSession(model);
	}
	if (scenario === 'conversation') {
		const request = addWorkCardRequest(model, 'Explain the change and its tests.', [{
			kind: 'markdownContent',
			content: new MarkdownString('## Shared conversation models\n\nThe cards use the same conversation, while each card owns its own view.\n\n- Pending approvals retain their original scope.\n- Questions resolve through the native renderer.\n- Draft text stays in the separate input.\n\n```ts\ncontent.setInput(session, chat, \'pending\');\n```'),
		}]);
		request.response?.complete();
	} else if (scenario === 'questions') {
		addWorkCardRequest(model, 'Configure the implementation.', [new ChatQuestionCarouselData([
			{ id: 'storage', type: 'singleSelect', title: 'Where should drafts live?', message: new MarkdownString('Choose the storage for **unsent drafts**. This does not change the agent permission level.'), options: [{ id: 'shared', label: 'Shared conversation model', value: 'shared' }, { id: 'local', label: 'This card only', value: 'local' }] },
			{ id: 'notes', type: 'text', title: 'Anything else to preserve?' },
		], true, 'draft-storage')]);
	} else {
		addWorkCardRequest(model, 'Inspect the implementation.', [new ChatToolInvocation({
			invocationMessage: 'Reading sessionWorkCardContent.ts',
			confirmationMessages: {
				title: 'Read the conversation content implementation?',
				message: new MarkdownString('The agent wants to read `src/vs/sessions/contrib/sessions/browser/views/sessionWorkCardContent.ts`.\n\nThis request belongs to this chat. It does not grant access to other folders or automatically approve later tools.\n\nReview the requested operation before choosing **Allow Once** or **Skip**.'),
				allowAutoConfirm: false,
			},
		}, toolData, 'read-content', undefined, { path: 'src/vs/sessions/contrib/sessions/browser/views/sessionWorkCardContent.ts' })]);
	}
	const session = makeSession(model.sessionResource);
	const chat = scenario === 'readonly'
		? { ...session.mainChat.get(), interactivity: constObservable(ChatInteractivity.ReadOnly) } : session.mainChat.get();
	const scopedSession = { ...session, chats: constObservable([chat]), mainChat: constObservable(chat) };
	const content = disposableStore.add(instantiation.createInstance(SessionWorkCardContent));
	container.appendChild(content.element);
	content.layout(480, height);
	content.setInput(scopedSession, chat, scenario === 'conversation' ? 'conversation' : 'pending');
	await Promise.resolve();
	await Promise.resolve();
}

export default defineThemedFixtureGroup({ path: 'sessions/SessionWorkCardContent/' }, {
	Conversation: defineComponentFixture({ render: context => renderContent(context, 'conversation') }),
	PendingTool: defineComponentFixture({ render: context => renderContent(context, 'tool') }),
	PendingQuestions: defineComponentFixture({ render: context => renderContent(context, 'questions') }),
	ShortPendingTool: defineComponentFixture({ render: context => renderContent(context, 'tool', 180) }),
	ReadOnly: defineComponentFixture({ render: context => renderContent(context, 'readonly') }),
	Unavailable: defineComponentFixture({ render: context => renderContent(context, 'unavailable') }),
	Untrusted: defineComponentFixture({ render: context => renderContent(context, 'untrusted') }),
});
