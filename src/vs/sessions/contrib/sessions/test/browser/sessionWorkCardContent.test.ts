/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IViewDescriptorService } from '../../../../../workbench/common/views.js';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetRegistry } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IChatModelFeedbackSurveyService } from '../../../../../workbench/contrib/chat/browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { IChatToolRiskAssessmentService } from '../../../../../workbench/contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { ChatInputPart } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { IChatModelReference, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IToolData, ILanguageModelToolsService, ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ILanguageModelToolConfirmationRef, ILanguageModelToolsConfirmationService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { MockChatModelFeedbackSurveyService } from '../../../../../workbench/contrib/chat/test/browser/feedbackSurvey/mockChatModelFeedbackSurveyService.js';
import { ITerminalChatService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionWorkCardContent, SessionWorkCardContentMode } from '../../browser/views/sessionWorkCardContent.js';
import { addWorkCardRequest, SessionWorkCardTestChatService } from './sessionWorkCardContentTestUtils.js';

suite('SessionWorkCardContent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const toolData: IToolData = {
		id: 'card.test.tool',
		displayName: 'Read File',
		modelDescription: 'Read a file',
		source: ToolDataSource.Internal,
	};

	function createHarness(canOpenSession: ISessionsService['canOpenSession'] = async () => true) {
		const disposables = store.add(new DisposableStore());
		const instantiation = workbenchInstantiationService(undefined, disposables);
		const chatService = new SessionWorkCardTestChatService(disposables);
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration('chat', { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'off' } });
		configuration.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false, bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false } });
		configuration.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configuration.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
		configuration.setUserConfiguration('chat.checkpoints.enabled', false);
		configuration.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IChatService, chatService);
		instantiation.stub(IChatAgentService, disposables.add(instantiation.createInstance(ChatAgentService)));
		instantiation.stub(IChatAttachmentWidgetRegistry, new ChatAttachmentWidgetRegistry());
		instantiation.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiation.stub(IViewDescriptorService, { onDidChangeLocation: Event.None });
		instantiation.stub(IAccessibleViewService, { getOpenAriaHint: () => '' });
		instantiation.stub(IChatAccessibilityService, { acceptRequest() { }, disposeRequest() { }, acceptResponse() { }, acceptElicitation() { } });
		instantiation.stub(ITerminalChatService, { getTerminalInstanceByExecutionId: () => undefined });
		instantiation.stub(IChatToolRiskAssessmentService, { isEnabled: () => false });
		instantiation.stub(ILanguageModelToolsService, { getTool: () => toolData, getTools: () => [toolData], onDidChangeTools: Event.None, onDidPrepareToolCallBecomeUnresponsive: Event.None });
		instantiation.stub(ILanguageModelToolsConfirmationService, { getPreConfirmActions: () => [], getPostConfirmActions: () => [] });
		const opened: URI[] = [];
		const trustChecks: { readonly session: ISession; readonly silent: boolean | undefined }[] = [];
		instantiation.stub(ISessionsService, {
			canOpenSession: async (session, options) => {
				trustChecks.push({ session, silent: options?.silent });
				return canOpenSession(session, options);
			},
			openSessionReview: async (_session, _section, options) => { if (options?.chatResource) { opened.push(options.chatResource); } },
		});
		const container = $('.monaco-workbench');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const createContent = () => {
			const content = disposables.add(instantiation.createInstance(SessionWorkCardContent));
			container.appendChild(content.element);
			content.layout(480, 360);
			return content;
		};
		const createModel = (name: string) => {
			const model = disposables.add(instantiation.createInstance(ChatModel, undefined, {
				initialLocation: ChatAgentLocation.Chat,
				canUseTools: true,
				resource: URI.parse(`card-test:/${name}`),
				disableBackgroundKeepAlive: true,
			}));
			chatService.addSession(model);
			return model;
		};
		const setInput = (content: SessionWorkCardContent, model: ChatModel, mode: SessionWorkCardContentMode = 'pending') => {
			const session = makeSession(model.sessionResource);
			content.setInput(session, session.mainChat.get(), mode);
			return session;
		};
		return { instantiation, disposables, chatService, opened, trustChecks, createContent, createModel, setInput };
	}

	async function settle(content: SessionWorkCardContent, state = 'ready'): Promise<void> {
		for (let attempt = 0; attempt < 100 && content.element.dataset.state !== state; attempt++) {
			await timeout(5);
		}
		assert.strictEqual(content.element.dataset.state, state, content.element.textContent ?? '');
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
	}

	function button(content: SessionWorkCardContent, label: string): HTMLElement {
		const button = [...content.element.querySelectorAll<HTMLElement>('.monaco-button')].find(element => element.textContent?.trim() === label);
		assert.ok(button, `Missing native button "${label}": ${content.element.textContent}`);
		return button;
	}

	function addTool(model: ChatModel, message = 'Read **main.ts** in this workspace.') {
		const parameters = { path: '/workspace/src/main.ts' };
		const tool = new ChatToolInvocation({
			invocationMessage: 'Reading main.ts',
			confirmationMessages: { title: 'Read main.ts?', message: new MarkdownString(message), allowAutoConfirm: true },
		}, toolData, `tool-${model.sessionId}`, undefined, parameters);
		const request = addWorkCardRequest(model, 'Inspect the code', [
			{ kind: 'markdownContent', content: new MarkdownString('Earlier response text must not appear in a pending card.') },
			tool,
		]);
		return { tool, request, parameters };
	}

	test('does not load until setInput and switches modes without reacquiring or creating a composer', async () => {
		const harness = createHarness();
		const content = harness.createContent();
		assert.strictEqual(harness.chatService.acquisitions.length, 0);
		const model = harness.createModel('first');
		addTool(model);
		const session = harness.setInput(content, model);
		await settle(content);
		content.setInput(session, session.mainChat.get(), 'conversation');
		await settle(content);
		content.setInput(session, session.mainChat.get(), 'pending');
		await settle(content);
		assert.deepStrictEqual({
			acquisitions: harness.chatService.acquisitions.map(load => load.resource.toString()),
			composers: content.element.querySelectorAll('.interactive-input-part').length,
			requests: content.element.querySelectorAll('.interactive-request').length,
			history: content.element.textContent?.includes('Earlier response text'),
			confirmations: content.element.querySelectorAll('.chat-tool-invocation-part').length,
		}, { acquisitions: [model.sessionResource.toString()], composers: 0, requests: 0, history: false, confirmations: 1 });
	});

	for (const mode of ['pending', 'conversation'] as const) {
		test(`${mode} checks workspace trust silently before acquiring even a cached model`, async () => {
			const gate = new DeferredPromise<boolean>();
			const harness = createHarness(() => gate.p);
			const model = harness.createModel(`untrusted-${mode}`);
			addTool(model);
			const content = harness.createContent();
			const session = harness.setInput(content, model, mode);
			assert.deepStrictEqual({
				checks: harness.trustChecks,
				acquisitions: harness.chatService.acquisitions.length,
				opened: harness.opened.length,
				rendered: content.element.querySelectorAll('.interactive-list').length,
			}, { checks: [{ session, silent: true }], acquisitions: 0, opened: 0, rendered: 0 });
			await gate.complete(false);
			await settle(content, 'unavailable');
			const beforeOpen = {
				acquisitions: harness.chatService.acquisitions.length,
				opened: harness.opened.length,
				rendered: content.element.querySelectorAll('.interactive-list').length,
				buttons: [...content.element.querySelectorAll('.monaco-button')].map(button => button.textContent),
			};
			button(content, 'Open Chat').click();
			await timeout(0);
			assert.deepStrictEqual({
				beforeOpen,
				opened: harness.opened.map(resource => resource.toString()),
				acquisitions: harness.chatService.acquisitions.length,
			}, {
				beforeOpen: { acquisitions: 0, opened: 0, rendered: 0, buttons: ['Open Chat'] },
				opened: [model.sessionResource.toString()],
				acquisitions: 0,
			});
		});
	}

	test('a trust result for a switched chat cannot start its model acquisition', async () => {
		const gate = new DeferredPromise<boolean>();
		const harness = createHarness(session => session.resource.path === '/first' ? gate.p : Promise.resolve(true));
		const first = harness.createModel('first');
		const second = harness.createModel('second');
		addTool(first);
		addTool(second);
		const content = harness.createContent();
		harness.setInput(content, first);
		harness.setInput(content, second);
		await settle(content);
		await gate.complete(true);
		await timeout(0);
		assert.deepStrictEqual({
			acquisitions: harness.chatService.acquisitions.map(load => load.resource.toString()),
			checks: harness.trustChecks.map(check => ({ resource: check.session.resource.toString(), silent: check.silent })),
			state: content.element.dataset.state,
		}, {
			acquisitions: [second.sessionResource.toString()],
			checks: [{ resource: first.sessionResource.toString(), silent: true }, { resource: second.sessionResource.toString(), silent: true }],
			state: 'ready',
		});
	});

	test('disposal while checking workspace trust never starts a model load', async () => {
		const gate = new DeferredPromise<boolean>();
		const harness = createHarness(() => gate.p);
		const model = harness.createModel('disposed-trust');
		const content = harness.createContent();
		harness.setInput(content, model);
		content.dispose();
		await gate.complete(true);
		await timeout(0);
		assert.deepStrictEqual({
			acquisitions: harness.chatService.acquisitions.length,
			opened: harness.opened.length,
			connected: content.element.isConnected,
		}, { acquisitions: 0, opened: 0, connected: false });
	});

	test('a failing trust lookup is visible and retry checks trust again before loading', async () => {
		let attempts = 0;
		const harness = createHarness(async () => {
			if (++attempts === 1) {
				throw new Error('Workspace trust is unavailable');
			}
			return true;
		});
		const model = harness.createModel('trust-retry');
		addTool(model);
		const content = harness.createContent();
		harness.setInput(content, model);
		await settle(content, 'error');
		assert.strictEqual(harness.chatService.acquisitions.length, 0);
		button(content, 'Retry').click();
		await settle(content);
		assert.deepStrictEqual({
			attempts,
			silentChecks: harness.trustChecks.map(check => check.silent),
			acquisitions: harness.chatService.acquisitions.map(load => load.resource.toString()),
			opened: harness.opened.length,
		}, { attempts: 2, silentChecks: [true, true], acquisitions: [model.sessionResource.toString()], opened: 0 });
	});

	test('cancels a switched load and disposes its late reference without replacing the current model', async () => {
		const harness = createHarness();
		const first = harness.createModel('first');
		const second = harness.createModel('second');
		addTool(first);
		addTool(second);
		const delayed = new DeferredPromise<IChatModelReference | undefined>();
		const started = new DeferredPromise<void>();
		harness.chatService.load = async resource => {
			if (resource.path === '/first') {
				await started.complete();
				return delayed.p;
			}
			return harness.chatService.reference(second);
		};
		const content = harness.createContent();
		harness.setInput(content, first);
		await started.p;
		harness.setInput(content, second);
		await settle(content);
		await delayed.complete(harness.chatService.reference(first));
		await timeout(0);
		assert.deepStrictEqual({
			cancelled: harness.chatService.acquisitions[0].token.isCancellationRequested,
			firstReferences: harness.chatService.references.get(first.sessionResource),
			secondReferences: harness.chatService.references.get(second.sessionResource),
			state: content.element.dataset.state,
		}, { cancelled: true, firstReferences: 0, secondReferences: 1, state: 'ready' });
	});

	test('cancels disposal and releases a late arrival exactly once', async () => {
		const harness = createHarness();
		const model = harness.createModel('late');
		const delayed = new DeferredPromise<IChatModelReference | undefined>();
		const started = new DeferredPromise<void>();
		harness.chatService.load = async () => {
			await started.complete();
			return delayed.p;
		};
		const content = harness.createContent();
		harness.setInput(content, model);
		await started.p;
		content.dispose();
		await delayed.complete(harness.chatService.reference(model));
		await timeout(0);
		content.dispose();
		assert.deepStrictEqual({
			cancelled: harness.chatService.acquisitions[0].token.isCancellationRequested,
			releases: harness.chatService.releases.map(resource => resource.toString()),
			connected: content.element.isConnected,
		}, { cancelled: true, releases: [model.sessionResource.toString()], connected: false });
	});

	test('releases only its own shared-model reference and never changes the input draft', async () => {
		const harness = createHarness();
		const model = harness.createModel('shared');
		addTool(model);
		model.inputModel.setState({ inputText: 'Keep my draft', attachments: [] });
		const draft = model.inputModel.state.get();
		const first = harness.createContent();
		const second = harness.createContent();
		harness.setInput(first, model, 'conversation');
		harness.setInput(second, model);
		await settle(first);
		await settle(second);
		first.dispose();
		assert.deepStrictEqual({
			references: harness.chatService.references.get(model.sessionResource),
			draft: model.inputModel.state.get(),
			secondState: second.element.dataset.state,
		}, { references: 1, draft, secondState: 'ready' });
	});

	test('native tool actions keep the original permission context and require an explicit decision', async () => {
		const harness = createHarness();
		const model = harness.createModel('approval');
		const { tool, parameters } = addTool(model);
		const scopes: ILanguageModelToolConfirmationRef[] = [];
		let selected = 0;
		harness.instantiation.stub(ILanguageModelToolsConfirmationService, {
			getPreConfirmActions: ref => {
				scopes.push(ref);
				return [{ label: 'Allow in This Chat', scope: 'session', select: async () => { selected++; return true; } }];
			},
			getPostConfirmActions: () => [],
		});
		const content = harness.createContent();
		harness.setInput(content, model);
		await settle(content);
		assert.strictEqual(tool.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
		button(content, 'Allow in This Chat').click();
		await settle(content, 'empty');
		assert.deepStrictEqual({
			context: scopes[0],
			selected,
			decision: IChatToolInvocation.executionConfirmedOrDenied(tool),
			controls: content.element.querySelectorAll('.chat-tool-invocation-part').length,
		}, {
			context: { toolId: toolData.id, source: toolData.source, parameters, chatSessionResource: model.sessionResource, combination: undefined },
			selected: 1,
			decision: { type: ToolConfirmKind.UserAction },
			controls: 0,
		});
	});

	test('native questions resolve the original runtime promise and extension event, then clear every host', async () => {
		const harness = createHarness();
		const model = harness.createModel('questions');
		const carousel = new ChatQuestionCarouselData([{ id: 'database', type: 'text', title: 'Which database?', required: true }], false, 'resolve-database');
		const request = addWorkCardRequest(model, 'Choose a database', [carousel]);
		const first = harness.createContent();
		const second = harness.createContent();
		harness.setInput(first, model);
		harness.setInput(second, model);
		await settle(first);
		await settle(second);
		const input = first.element.querySelector<HTMLInputElement>('input');
		assert.ok(input);
		assert.strictEqual(carousel.completion.isSettled, false);
		input.value = 'PostgreSQL';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		button(first, 'Submit').click();
		await settle(first, 'empty');
		await settle(second, 'empty');
		assert.deepStrictEqual({
			result: await carousel.completion.p,
			answers: harness.chatService.answers,
			firstControls: first.element.querySelectorAll('.chat-question-carousel-container').length,
			secondControls: second.element.querySelectorAll('.chat-question-carousel-container').length,
		}, {
			result: { answers: { database: 'PostgreSQL' } },
			answers: [{ requestId: request.id, resolveId: 'resolve-database', answers: { database: 'PostgreSQL' } }],
			firstControls: 0,
			secondControls: 0,
		});
	});

	test('disposing another card cannot overwrite a newer shared question draft', async () => {
		const harness = createHarness();
		const model = harness.createModel('question-draft');
		const carousel = new ChatQuestionCarouselData([{ id: 'name', type: 'text', title: 'Name the result' }], false);
		addWorkCardRequest(model, 'Name the result', [carousel]);
		const first = harness.createContent();
		const second = harness.createContent();
		harness.setInput(first, model);
		harness.setInput(second, model);
		await settle(first);
		await settle(second);
		const input = first.element.querySelector<HTMLInputElement>('input');
		assert.ok(input);
		input.value = 'Preserved draft';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		const third = harness.createContent();
		harness.setInput(third, model);
		await settle(third);
		second.dispose();
		assert.deepStrictEqual({ draft: carousel.draftAnswers, settled: carousel.completion.isSettled }, { draft: { name: 'Preserved draft' }, settled: false });
	});

	test('reports native request height above the supplied bounds and zero after resolution', async () => {
		const harness = createHarness();
		const model = harness.createModel('height');
		const { tool } = addTool(model, 'This operation reads **main.ts**. Review its requested access before deciding whether to allow the operation.\n\n'.repeat(12));
		const content = harness.createContent();
		const heights: number[] = [];
		store.add(content.onDidChangeHeight(height => {
			heights.push(height);
			content.layout(480, Math.min(height, 180));
		}));
		content.layout(480, 120);
		harness.setInput(content, model);
		await settle(content);
		const confirmation = content.element.querySelector<HTMLElement>('.chat-confirmation-widget2');
		assert.ok(confirmation);
		for (let frame = 0; frame < 4; frame++) {
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		}
		const nativeHeight = Math.ceil(confirmation.getBoundingClientRect().height);
		const desiredHeight = heights.at(-1) ?? 0;
		const viewportHeight = content.element.getBoundingClientRect().height;
		IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.Skipped });
		await settle(content, 'empty');
		assert.deepStrictEqual({
			exceedsViewport: nativeHeight > viewportHeight,
			reportsNativeHeight: desiredHeight >= nativeHeight,
			resolvedHeight: heights.at(-1),
		}, { exceedsViewport: true, reportsNativeHeight: true, resolvedHeight: 0 });
	});

	test('loads only the owning peer chat and exposes its accessible content without making it active', async () => {
		const harness = createHarness();
		const main = harness.createModel('main');
		const peer = harness.createModel('peer');
		addTool(peer);
		const mainSession = makeSession(main.sessionResource);
		const peerChat = makeSession(peer.sessionResource).mainChat.get();
		const session = { ...mainSession, chats: constObservable([mainSession.mainChat.get(), peerChat]) };
		const content = harness.createContent();
		assert.strictEqual(content.getAccessibleContent(), '');
		content.setInput(session, peerChat, 'pending');
		await settle(content);
		assert.deepStrictEqual({
			loaded: harness.chatService.acquisitions.map(load => load.resource.toString()),
			mainChat: session.activeChat.get().resource.toString(),
			opened: harness.opened.length,
			accessible: content.getAccessibleContent().includes('Read main.ts?'),
		}, { loaded: [peer.sessionResource.toString()], mainChat: main.sessionResource.toString(), opened: 0, accessible: true });
	});

	test('offers Open Chat for an unresolvable form instead of fabricating a decision', async () => {
		const harness = createHarness();
		const model = harness.createModel('unsupported-form');
		addWorkCardRequest(model, 'Answer the provider question', [{
			kind: 'questionCarousel',
			questions: [{ id: 'question', type: 'text', title: 'A form without a runtime resolver' }],
			allowSkip: false,
		}]);
		const content = harness.createContent();
		harness.setInput(content, model);
		await settle(content, 'unavailable');
		assert.deepStrictEqual({
			forms: content.element.querySelectorAll('.chat-question-carousel-container').length,
			open: button(content, 'Open Chat').textContent,
			answers: harness.chatService.answers.length,
		}, { forms: 0, open: 'Open Chat', answers: 0 });
	});

	test('read-only changes remove native decisions without confirming, and completed requests stay cleared', async () => {
		const harness = createHarness();
		const model = harness.createModel('readonly');
		const { tool, request } = addTool(model);
		const session = makeSession(model.sessionResource);
		const interactivity = observableValue(store, ChatInteractivity.Full);
		const chat: IChat = { ...session.mainChat.get(), interactivity };
		const scopedSession = { ...session, chats: constObservable([chat]), mainChat: constObservable(chat) };
		const content = harness.createContent();
		content.setInput(scopedSession, chat, 'pending');
		await settle(content);
		const staleButton = button(content, 'Allow Once');
		interactivity.set(ChatInteractivity.ReadOnly, undefined);
		staleButton.click();
		assert.deepStrictEqual({
			buttons: content.element.querySelectorAll('.chat-confirmation-widget-buttons .monaco-button').length,
			waiting: tool.state.get().type,
			readOnly: content.element.textContent?.includes('read-only'),
		}, { buttons: 0, waiting: IChatToolInvocation.StateKind.WaitingForConfirmation, readOnly: true });
		assert.ok(request.response);
		request.response.complete();
		await settle(content, 'empty');
		assert.strictEqual(content.element.querySelectorAll('.chat-tool-invocation-part').length, 0);
	});

	test('does not dock questions or confirmations in another widget for the same chat', async () => {
		const harness = createHarness();
		const foreignWidget = new class extends mock<IChatWidget>() {
			override readonly location = ChatAgentLocation.Chat;
			override readonly input = new class extends mock<ChatInputPart>() {
				override renderQuestionCarousel(): never { throw new Error('Questions must remain in their owning content host'); }
				override addToolToConfirmationCarousel(): never { throw new Error('Approvals must remain in their owning content host'); }
			}();
			override readonly inputPart = this.input;
		}();
		harness.instantiation.stub(IChatWidgetService, {
			getWidgetBySessionResource: () => foreignWidget,
			onDidAddWidget: Event.None,
			onDidRemoveWidget: Event.None,
			onDidChangeFocusedWidget: Event.None,
		});
		const model = harness.createModel('inline');
		const { request } = addTool(model);
		model.acceptResponseProgress(request, new ChatQuestionCarouselData([{ id: 'name', type: 'text', title: 'Name the result' }], true));
		const content = harness.createContent();
		harness.setInput(content, model);
		await settle(content);
		assert.deepStrictEqual({
			tool: !!content.element.querySelector('.chat-confirmation-widget-buttons'),
			question: !!content.element.querySelector('.chat-question-carousel-container'),
		}, { tool: true, question: true });
	});

	test('surfaces failures and unavailable models with explicit retry/open actions for the owning chat', async () => {
		const harness = createHarness();
		const model = harness.createModel('peer');
		addTool(model);
		let attempts = 0;
		harness.chatService.load = async () => {
			attempts++;
			if (attempts === 1) { throw new Error('Provider offline'); }
			if (attempts === 2) { return undefined; }
			return harness.chatService.reference(model);
		};
		const content = harness.createContent();
		harness.setInput(content, model);
		await settle(content, 'error');
		button(content, 'Retry').click();
		await settle(content, 'unavailable');
		button(content, 'Open Chat').click();
		await timeout(0);
		button(content, 'Retry').click();
		await settle(content);
		assert.deepStrictEqual({ attempts, opened: harness.opened.map(resource => resource.toString()) }, { attempts: 3, opened: [model.sessionResource.toString()] });
	});
});
