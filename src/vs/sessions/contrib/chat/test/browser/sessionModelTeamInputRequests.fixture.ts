/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun, constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatSessionInputRequestsPart } from '../../../../../workbench/contrib/chat/browser/widget/input/chatSessionInputRequestsPart.js';
import { IAgentHostCustomizationService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ITerminalChatService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IPlanReviewFeedbackService } from '../../../../../workbench/contrib/chat/browser/planReviewFeedback/planReviewFeedbackService.js';
import { IChatSessionInputRequest } from '../../../../../workbench/contrib/chat/common/chatSessionInputRequests.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatPlanReviewData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatRequestTextPart } from '../../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js';
import { ILanguageModelToolsConfirmationService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IAgentEditorCommentsBridge } from '../../../../../workbench/services/agentEditorComments/common/agentEditorComments.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import '../../../../../workbench/contrib/chat/browser/widget/media/chat.css';

type RequestKind = 'parameters' | 'terminal' | 'result' | 'question' | 'plan' | 'authentication';

class FixtureCommandService extends TestCommandService {
	constructor(@IInstantiationService service: IInstantiationService) {
		super(service);
	}
}

async function renderQueue({ container, disposableStore, theme }: ComponentFixtureContext, kind: RequestKind, width = 540): Promise<void> {
	container.classList.add('monaco-workbench', 'interactive-session');
	container.style.width = `${width}px`;
	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	const input = append(container, $('.interactive-input-part'));
	const queueContainer = append(input, $('.chat-tool-confirmation-carousel-container'));
	disposableStore.add(CommandsRegistry.registerCommand('json.validate', () => []));
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerChatFixtureServices(registration);
			registration.define(IMarkerService, MarkerService);
			registration.define(ICommandService, FixtureCommandService);
			registration.defineInstance(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
				override async playSignal(): Promise<void> {
					container.dataset.announcements = String(Number(container.dataset.announcements ?? 0) + 1);
				}
			}());
			registration.defineInstance(IAgentHostCustomizationService, new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override async authenticateMcpServer(resource: URI, server: string): Promise<boolean> {
					container.dataset.authenticationSource = resource.toString();
					container.dataset.authenticationServer = server;
					return true;
				}
			}());
			registration.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {
				override readonly onDidChangeTools = Event.None;
				override getTool() { return undefined; }
				override getTools() { return []; }
			}());
			registration.defineInstance(ILanguageModelToolsConfirmationService, new class extends mock<ILanguageModelToolsConfirmationService>() {
				override getPreConfirmActions() { return []; }
				override getPostConfirmActions() { return []; }
			}());
			registration.defineInstance(IPlanReviewFeedbackService, new class extends mock<IPlanReviewFeedbackService>() { }());
			registration.defineInstance(IAgentEditorCommentsBridge, new class extends mock<IAgentEditorCommentsBridge>() { }());
			registration.defineInstance(ITerminalChatService, new class extends mock<ITerminalChatService>() { }());
		},
	});
	const configuration = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configuration.setUserConfiguration('chat', { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'off' } });
	configuration.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false });
	const requests: IChatSessionInputRequest[] = [];
	for (const [role, requestKind] of [['Worker', kind], ['Scout', 'question']] as const) {
		const resource = URI.parse(`agent-host-copilotcli:/team#${role.toLowerCase()}`);
		const model = disposableStore.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource }));
		const request = model.addRequest({
			text: 'Assignment',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 10), new Range(1, 1, 1, 11), 'Assignment')],
		}, { variables: [] }, 0);
		let content: IChatSessionInputRequest['content'];
		if (requestKind === 'question') {
			content = new ChatQuestionCarouselData([{
				id: 'scope', title: 'Choose the validation scope', type: 'singleSelect',
				message: 'Which validation should I run before reporting back to Lead?',
				options: [
					{ id: 'focused', label: 'Focused regression tests', value: 'focused' },
					{ id: 'all', label: 'Full test suite', value: 'all' },
				],
			}], true, 'same-request');
		} else if (requestKind === 'plan') {
			content = new ChatPlanReviewData('Review implementation plan', '1. Implement the source-aware approval queue.\n2. Add regression tests.\n3. Return the deliverable to Lead for review.', [{ id: 'approve', label: 'Approve', default: true }], true, undefined, 'same-request');
		} else {
			const tool = new ChatToolInvocation(requestKind === 'terminal' ? {
				invocationMessage: 'Run focused validation',
				confirmationMessages: {
					title: 'Run focused validation?', message: 'Worker needs to run the regression tests.', allowAutoConfirm: false,
					customOptions: [
						{ id: 'run-once', label: 'Run Once', kind: ConfirmationOptionKind.Approve },
						{ id: 'deny', label: 'Do Not Run', kind: ConfirmationOptionKind.Deny },
					],
				},
				toolSpecificData: { kind: 'terminal', commandLine: { original: 'npm run test -- approval' }, language: 'shellscript', editable: true },
			} : requestKind === 'parameters' ? {
				invocationMessage: 'Read the project configuration',
				confirmationMessages: { title: 'Read project configuration?', message: 'Worker needs to inspect the project configuration before continuing.', allowAutoConfirm: false },
				toolSpecificData: { kind: 'input', rawInput: { path: 'project/configuration.json' }, editable: true },
			} : undefined, { id: 'fixture.read', displayName: 'Read file', modelDescription: '', source: ToolDataSource.Internal }, 'same-tool-id', undefined, {});
			if (requestKind === 'result') {
				tool.confirmationMessages = { confirmResults: true, allowAutoConfirm: false };
				await tool.didExecuteTool({ content: [{ kind: 'text', value: 'The configuration contains the expected build targets.\n\nReview this result before it is sent back to Worker.' }] });
			} else if (requestKind === 'authentication') {
				tool.setAuthenticationRequired({ id: 'local/repository-server', name: 'Repository server', resource: 'https://repository.example/mcp' });
			}
			content = tool;
		}
		model.acceptResponseProgress(request, content);
		const isActive = observableValue('activeRequest', true);
		if (content.kind === 'toolInvocation') {
			disposableStore.add(autorun(reader => {
				const currentState = content.state.read(reader);
				const state = currentState.type;
				if (!disposableStore.isDisposed) {
					if (currentState.type === IChatToolInvocation.StateKind.Executing && currentState.confirmed.type === ToolConfirmKind.UserAction) {
						container.dataset.selectedConfirmation = currentState.confirmed.selectedButton;
					}
					if (state === IChatToolInvocation.StateKind.Executing && content.toolSpecificData?.kind === 'input') {
						container.dataset.submittedParameters = JSON.stringify(content.toolSpecificData.rawInput);
					}
					isActive.set(state === IChatToolInvocation.StateKind.WaitingForConfirmation || state === IChatToolInvocation.StateKind.WaitingForPostApproval || state === IChatToolInvocation.StateKind.WaitingForAuthentication, undefined);
				}
			}));
		} else if (content instanceof ChatQuestionCarouselData || content instanceof ChatPlanReviewData) {
			void content.completion.p.then(() => {
				if (!disposableStore.isDisposed) {
					isActive.set(false, undefined);
				}
			});
		}
		requests.push({
			id: `${resource}\0${request.id}\0${requestKind}`,
			source: { resource, label: role },
			model, requestId: request.id, content, isActive,
		});
	}
	const pending = derived(reader => requests.filter(request => request.isActive.read(reader)));
	const part = disposableStore.add(instantiationService.createInstance(ChatSessionInputRequestsPart, pending, constObservable(width), () => {
		container.dataset.returnedToLead = 'true';
	}));
	queueContainer.appendChild(part.domNode);
}

const additionalThemes = ['darkHighContrast', 'lightHighContrast'] as const;

export default defineThemedFixtureGroup({ path: 'sessions/chat/teamInput/' }, {
	Parameters: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The standard tool confirmation shows Worker attribution, editable parameters, individual Allow Once and Skip actions, and navigation for two requests. No bulk Allow All or Open Chat action appears.'],
		render: context => renderQueue(context, 'parameters'),
	}),
	TerminalOptions: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The standard terminal command editor preserves Worker attribution and the provider-defined Run Once and Do Not Run choices without auto-approval actions.'],
		render: context => renderQueue(context, 'terminal'),
	}),
	Questions: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['A standard question form is shown inside the source-attributed queue, with question choices and request navigation.'],
		render: context => renderQueue(context, 'question'),
	}),
	Plan: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The normal plan review content, feedback, and approval controls are visible with Worker source attribution and two-request navigation.'],
		render: context => renderQueue(context, 'plan'),
	}),
	Result: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['Tool result text and individual result-review controls appear in the Worker card; there is no bulk approval action.'],
		render: context => renderQueue(context, 'result'),
	}),
	Authentication: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The Worker card asks for Repository server authentication with Authenticate and Cancel, never a generic Allow action.'],
		render: context => renderQueue(context, 'authentication'),
	}),
	Narrow: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The source-attributed question and its navigation/actions fit a narrow input surface without horizontal clipping.'],
		render: context => renderQueue(context, 'question', 280),
	}),
});
