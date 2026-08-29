/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { IRenderedMarkdown, MarkdownRenderOptions, renderAsPlaintext, renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ILinkPresentation, ILinkPresentationService } from '../../../../../../../platform/dataChannel/common/dataChannel.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatAutomationConfiguredResultSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatAutomationConfiguredResultSubPart.js';
import { ChatSessionCreatedResultSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatSessionCreatedResultSubPart.js';
import { ChatToolInvocationPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { ChatToolConfirmationCarouselPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js';
import { BaseChatToolInvocationSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationSubPart.js';
import { ChatToolProgressSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolProgressPart.js';
import { ChatToolStreamingSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolStreamingSubPart.js';
import { isAskQuestionsToolInvocation, isMcpToolInvocation } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolPartUtilities.js';
import { DiffEditorPool, EditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { IChatAutomationConfiguredData, IChatSessionCreatedData, IChatTerminalToolInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ToolDataSource, type ToolDataSource as ToolDataSourceType } from '../../../../common/tools/languageModelToolsService.js';
import { CollapsibleListPool } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { IChatTodoListService } from '../../../../common/tools/chatTodoListService.js';

class TestToolInvocationSubPart extends BaseChatToolInvocationSubPart {
	readonly domNode = mainWindow.document.createElement('div');
	codeblocks = [];

	constructor(toolInvocation: IChatToolInvocation, terminalData: IChatTerminalToolInvocationData) {
		super(toolInvocation);
		this.domNode.dataset.terminalToolSessionId = terminalData.terminalToolSessionId ?? '';
	}
}

suite('ChatToolProgressSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockMarkdownRenderer: IMarkdownRenderer;
	let mockAnchorService: IChatMarkdownAnchorService;
	let mockHoverService: IHoverService;
	let mockConfigurationService: TestConfigurationService;
	let mockEditorPool: EditorPool;
	let sessionLinkPresentation: ISettableObservable<ILinkPresentation | undefined>;

	function createRenderContext(isComplete: boolean = false): IChatContentPartRenderContext {
		const mockElement: Partial<IChatResponseViewModel> = {
			isComplete,
			id: 'test-response-id',
			sessionResource: URI.parse('chat-session://test/session1'),
			setVote: () => { },
			get model() { return {} as IChatResponseViewModel['model']; }
		};

		return {
			element: mockElement as IChatResponseViewModel,
			inlineTextModels: {} as InlineTextModelCollection,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			editorPool: mockEditorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: {} as DiffEditorPool,
			currentWidth: observableValue('currentWidth', 500),
			onDidChangeVisibility: Event.None
		};
	}

	function createStreamingToolInvocation(streamingMessage: string, isAttachedToThinking: boolean = false): IChatToolInvocation {
		const state = observableValue<IChatToolInvocation.State>('state', {
			type: IChatToolInvocation.StateKind.Streaming,
			partialInput: observableValue('partialInput', {}),
			streamingMessage: observableValue('streamingMessage', streamingMessage)
		});
		return {
			...createToolInvocation({ invocationMessage: streamingMessage }),
			isAttachedToThinking,
			state,
		};
	}

	function createSerializedToolInvocation(options: {
		source?: ToolDataSourceType;
		toolId?: string;
		isComplete?: boolean;
		invocationMessage?: string | IMarkdownString;
	} = {}): IChatToolInvocationSerialized {
		return {
			presentation: undefined,
			toolSpecificData: undefined,
			originMessage: undefined,
			invocationMessage: options.invocationMessage ?? 'Running tool...',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: options.isComplete ?? false,
			toolCallId: 'tool-call-id',
			toolId: options.toolId ?? 'test_tool',
			source: options.source,
			kind: 'toolInvocationSerialized'
		};
	}

	function createToolInvocation(options: {
		source?: ToolDataSourceType;
		toolId?: string;
		invocationMessage?: string | IMarkdownString;
		progressMessage?: string;
	} = {}): IChatToolInvocation {
		const source = options.source ?? ToolDataSource.Internal;
		const toolId = options.toolId ?? 'test_tool';
		return {
			presentation: undefined,
			toolSpecificData: undefined,
			originMessage: undefined,
			invocationMessage: options.invocationMessage ?? 'Running tool...',
			pastTenseMessage: undefined,
			source,
			toolId,
			toolCallId: 'live-tool-call-id',
			state: observableValue('state', {
				type: IChatToolInvocation.StateKind.Executing,
				parameters: undefined,
				confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
				progress: observableValue('progress', { message: options.progressMessage, progress: undefined })
			}),
			toolSpecificDataKind: observableValue('test', undefined),
			isAttachedToThinking: false,
			kind: 'toolInvocation',
			toJSON: () => createSerializedToolInvocation({ source, toolId, invocationMessage: options.invocationMessage })
		};
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);

		mockConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, mockConfigurationService);

		mockMarkdownRenderer = {
			render: (markdown: IMarkdownString, _options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown => {
				const element = outElement ?? mainWindow.document.createElement('div');
				const content = typeof markdown === 'string' ? markdown : renderAsPlaintext(markdown);
				element.textContent = content;
				return {
					element,
					dispose: () => { }
				};
			}
		};

		mockAnchorService = {
			_serviceBrand: undefined,
			register: () => ({ dispose: () => { } }),
			lastFocusedAnchor: undefined
		};
		instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);

		mockHoverService = {
			_serviceBrand: undefined,
			showHover: () => undefined,
			showDelayedHover: () => undefined,
			showAndFocusLastHover: () => { },
			hideHover: () => { },
			setupDelayedHover: () => ({ dispose: () => { } }),
			setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
			showManagedHover: () => undefined,
			isHovered: () => false,
		} as unknown as IHoverService;
		instantiationService.stub(IHoverService, mockHoverService);

		sessionLinkPresentation = observableValue<ILinkPresentation | undefined>('sessionLinkPresentation', undefined);
		instantiationService.stub(ILinkPresentationService, {
			_serviceBrand: undefined,
			onDidChangeLinkPresentationRules: Event.None,
			linkPresentationRules: [],
			registerLinkPresentationProvider: () => ({ dispose() { } }),
			registerExtensionLinkPresentationProvider: () => ({ dispose() { } }),
			getLinkPresentationRule: () => ({ id: 'test-session-links', uriPattern: /^agent-host-session:/, kind: 'session' }),
			createLinkPresentationWatcher: () => ({ presentation: sessionLinkPresentation, dispose() { } }),
		});

		mockEditorPool = {} as EditorPool;
	});

	teardown(() => {
		disposables.dispose();
	});

	function renderToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, renderer = mockMarkdownRenderer): ChatToolInvocationPart {
		return disposables.add(new ChatToolInvocationPart(
			toolInvocation,
			createRenderContext(),
			renderer,
			{} as CollapsibleListPool,
			mockEditorPool,
			() => 500,
			undefined,
			0,
			instantiationService,
			{
				_serviceBrand: undefined,
				onDidUpdateTodos: Event.None,
				getTodos: () => [],
				setTodos() { },
				migrateTodos() { },
			} satisfies IChatTodoListService,
		));
	}

	test('does not retain an ordinary tool part when it becomes a parent subagent', () => {
		const invocation = createToolInvocation();
		const part = renderToolInvocation(invocation);
		(invocation as { toolSpecificData: IChatToolInvocation['toolSpecificData'] }).toolSpecificData = { kind: 'subagent' };

		assert.strictEqual(part.hasSameContent(invocation, [], {} as never), false);
	});

	test('confirmation carousel reports the active subagent title and invokes its reference action', () => {
		const createPendingInvocation = (toolCallId: string): IChatToolInvocation => ({
			...createToolInvocation(),
			toolCallId,
			state: observableValue<IChatToolInvocation.State>(`state-${toolCallId}`, {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: undefined,
				confirmationMessages: { title: 'Run command?', message: 'Run command?' },
				confirm: () => { },
			}),
		});
		const createExternalPart = () => {
			const domNode = mainWindow.document.createElement('div');
			domNode.className = 'chat-tool-invocation-part';
			return {
				domNode,
				addDisposable: (disposable: { dispose(): void }) => disposables.add(disposable),
			} as unknown as ChatToolInvocationPart;
		};
		const revealed: string[] = [];
		const active: Array<string | undefined> = [];
		const carousel = disposables.add(new ChatToolConfirmationCarouselPart(() => {
			throw new Error('External tool parts should be reused');
		}, []));
		disposables.add(carousel.onDidChangeActiveSubagent(id => active.push(id)));
		carousel.addToolInvocation(createPendingInvocation('first'), 'subagent-one', 'Inspect auth flow', id => revealed.push(id), 'Open Inspect auth flow Chat', createExternalPart());
		carousel.addToolInvocation(createPendingInvocation('second'), 'subagent-two', 'Review current branch', id => revealed.push(id), 'Open Review current branch Chat', createExternalPart());

		carousel.activateFirstToolForSubagent('subagent-two');
		const agentLabel = carousel.domNode.querySelector<HTMLButtonElement>('.chat-tool-carousel-agent-label');
		agentLabel?.click();

		assert.deepStrictEqual({
			active,
			revealed,
			text: agentLabel?.textContent,
			label: agentLabel?.title,
		}, {
			active: ['subagent-one', 'subagent-two'],
			revealed: ['subagent-two'],
			text: '\u2014 Review current branch',
			label: 'Open Review current branch Chat',
		});
	});

	test('detects MCP tool invocations for live and serialized rows', () => {
		const mcpSource: ToolDataSourceType = {
			type: 'mcp',
			label: 'Weather MCP',
			serverLabel: 'Weather',
			instructions: undefined,
			collectionId: 'collection',
			definitionId: 'definition'
		};

		const cases = [
			isMcpToolInvocation(createToolInvocation({ source: mcpSource })),
			isMcpToolInvocation(createSerializedToolInvocation({ source: undefined, toolId: 'mcp__weather' })),
			isMcpToolInvocation(createSerializedToolInvocation({ source: ToolDataSource.Internal, toolId: 'fetch_webpage' }))
		];

		assert.deepStrictEqual(cases, [true, true, false]);
	});

	test('detects all ask-question tool names for top-level rendering', () => {
		const toolNames = ['copilot_askQuestions', 'vscode_askQuestions', 'ask_user', 'AskUserQuestion', 'request_user_input'];
		assert.deepStrictEqual(toolNames.map(toolId => isAskQuestionsToolInvocation(createToolInvocation({ toolId }))), [true, true, true, true, true]);
	});

	test('renders the automation result subpart for configured automation data', () => {
		const invocation: IChatToolInvocationSerialized = {
			...createSerializedToolInvocation({ isComplete: true }),
			toolSpecificData: {
				kind: 'automationConfigured',
				automationId: 'automation-1',
				automationName: 'Morning review',
				operation: 'created',
			},
		};
		const createInstanceStub = sinon.stub(instantiationService, 'createInstance').callsFake((_ctor, ...args) => {
			return new TestToolInvocationSubPart(args[0] as IChatToolInvocation, {
				kind: 'terminal',
				commandLine: { original: '' },
				language: 'shellscript',
			});
		});
		disposables.add(toDisposable(() => createInstanceStub.restore()));

		renderToolInvocation(invocation);

		assert.strictEqual(createInstanceStub.firstCall.args[0], ChatAutomationConfiguredResultSubPart);
	});

	test('renders a created session as a plain title link', () => {
		const updateHover = sinon.spy();
		const setupManagedHoverStub = sinon.stub(mockHoverService, 'setupManagedHover').returns({
			dispose() { },
			show() { },
			hide() { },
			update: updateHover,
		});
		disposables.add(toDisposable(() => setupManagedHoverStub.restore()));
		const runningTitle = 'Weather question session with a detailed title that is longer than sixty characters';
		sessionLinkPresentation.set({
			kind: 'session',
			title: runningTitle,
			status: { kind: 'pending', label: 'Working' },
		}, undefined);
		const part = disposables.add(instantiationService.createInstance(
			ChatSessionCreatedResultSubPart,
			createSerializedToolInvocation({ isComplete: true }),
			{
				kind: 'sessionCreated',
				openLink: 'agent-host-session://copilot/task-a',
				label: 'Implement Task A for the current session…',
				fullTitle: 'Implement Task A for the current session and validate all of its behavior',
			} satisfies IChatSessionCreatedData,
			createRenderContext(),
			mockMarkdownRenderer,
		));
		const link = part.domNode.querySelector<HTMLAnchorElement>('a.monaco-link');

		assert.deepStrictEqual({
			text: link?.textContent,
			href: link?.getAttribute('href'),
			hoverTitle: updateHover.lastCall.args[0],
			role: link?.getAttribute('role'),
			hasButton: !!part.domNode.querySelector('.monaco-button'),
		}, {
			text: `${runningTitle.slice(0, 57)}…`,
			href: 'agent-host-session://copilot/task-a',
			hoverTitle: runningTitle,
			role: null,
			hasButton: false,
		});

		sessionLinkPresentation.set({
			kind: 'session',
			title: 'Finished weather session',
			status: { kind: 'success', label: 'Completed' },
		}, undefined);
		assert.deepStrictEqual({
			text: link?.textContent,
			hoverTitle: updateHover.lastCall.args[0],
		}, {
			text: 'Finished weather session',
			hoverTitle: 'Finished weather session',
		});
	});

	test('renders codicon syntax in an automation name as literal text', () => {
		const render = (automationName: string) => {
			const part = disposables.add(instantiationService.createInstance(
				ChatAutomationConfiguredResultSubPart,
				createSerializedToolInvocation({ isComplete: true }),
				{ kind: 'automationConfigured', automationId: 'automation-1', automationName, operation: 'created' } satisfies IChatAutomationConfiguredData,
				createRenderContext(),
				mockMarkdownRenderer,
			));
			const button = part.domNode.querySelector<HTMLElement>('.chat-open-session-button');
			return {
				text: button?.textContent,
				ariaLabel: button?.getAttribute('aria-label'),
				tabIndex: button?.tabIndex,
				calendarIconIsChild: !!button?.querySelector('.codicon-calendar'),
				// `codicon-*` on the root would restyle the label text.
				rootCarriesCodiconClass: button?.classList.contains('codicon'),
				injectedIcons: [...button?.querySelectorAll('.codicon') ?? []]
					.flatMap(el => [...el.classList]).filter(c => c.startsWith('codicon-')),
			};
		};

		assert.deepStrictEqual([render('$(error)'), render('a \\$(error) b')], [
			{
				text: 'Created an automation: $(error)',
				ariaLabel: 'Open automation $(error)',
				tabIndex: 0,
				calendarIconIsChild: true,
				rootCarriesCodiconClass: false,
				injectedIcons: ['codicon-calendar'],
			},
			{
				text: 'Created an automation: a \\$(error) b',
				ariaLabel: 'Open automation a \\$(error) b',
				tabIndex: 0,
				calendarIconIsChild: true,
				rootCarriesCodiconClass: false,
				injectedIcons: ['codicon-calendar'],
			},
		]);
	});

	test('rerenders when terminal metadata changes without changing data kind', () => {
		const state = observableValue<IChatToolInvocation.State>('state', {
			type: IChatToolInvocation.StateKind.Executing,
			parameters: undefined,
			confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			progress: observableValue('progress', { progress: undefined }),
		});
		let terminalData: IChatTerminalToolInvocationData = {
			kind: 'terminal',
			commandLine: { original: 'echo test' },
			language: 'shellscript',
		};
		const invocation = {
			...createToolInvocation(),
			get toolSpecificData() { return terminalData; },
			state,
			toolSpecificDataKind: observableValue('kind', 'terminal'),
		} as IChatToolInvocation;
		const createInstanceStub = sinon.stub(instantiationService, 'createInstance').callsFake((_ctor, ...args) => {
			return new TestToolInvocationSubPart(args[0] as IChatToolInvocation, args[1] as IChatTerminalToolInvocationData);
		});
		disposables.add(toDisposable(() => createInstanceStub.restore()));
		const part = disposables.add(new ChatToolInvocationPart(
			invocation,
			createRenderContext(),
			mockMarkdownRenderer,
			{} as CollapsibleListPool,
			mockEditorPool,
			() => 500,
			undefined,
			0,
			instantiationService,
			{
				_serviceBrand: undefined,
				onDidUpdateTodos: Event.None,
				getTodos: () => [],
				setTodos() { },
				migrateTodos() { },
			} satisfies IChatTodoListService,
		));
		const sessionIdBeforeUpdate = part.domNode.firstElementChild?.getAttribute('data-terminal-tool-session-id');

		terminalData = { ...terminalData, terminalToolSessionId: 'terminal-session' };
		state.set({ ...state.get() }, undefined);

		assert.deepStrictEqual({
			renderCount: createInstanceStub.callCount,
			sessionIdBeforeUpdate,
			sessionIdAfterUpdate: part.domNode.firstElementChild?.getAttribute('data-terminal-tool-session-id'),
		}, {
			renderCount: 2,
			sessionIdBeforeUpdate: '',
			sessionIdAfterUpdate: 'terminal-session',
		});
	});

	test('does not add shimmer styling for active MCP tool progress', () => {
		const mcpTool = createToolInvocation({
			source: {
				type: 'mcp',
				label: 'Weather MCP',
				serverLabel: 'Weather',
				instructions: undefined,
				collectionId: 'collection',
				definitionId: 'definition'
			},
			toolId: 'weather_lookup'
		});

		const part = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			mcpTool,
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));

		assert.strictEqual(part.domNode.querySelector('.shimmer-progress'), null);
	});

	test('shimmers only the leading verb of standalone streaming progress, but not inside a thinking part', () => {
		const patchPart = disposables.add(instantiationService.createInstance(
			ChatToolStreamingSubPart,
			createStreamingToolInvocation('Generating patch (282 lines)'),
			createRenderContext(false),
			mockMarkdownRenderer
		));
		const editPart = disposables.add(instantiationService.createInstance(
			ChatToolStreamingSubPart,
			createStreamingToolInvocation('Editing 5 lines'),
			createRenderContext(false),
			mockMarkdownRenderer
		));
		const thinkingPart = disposables.add(instantiationService.createInstance(
			ChatToolStreamingSubPart,
			createStreamingToolInvocation('Generating patch (282 lines)', /* isAttachedToThinking */ true),
			createRenderContext(false),
			mockMarkdownRenderer
		));

		const inspect = (part: ChatToolStreamingSubPart) => {
			const shimmerText = part.domNode.querySelector<HTMLElement>('.chat-progress-shimmer-text');
			return {
				shimmer: !!part.domNode.querySelector('.shimmer-progress'),
				spinner: !!part.domNode.querySelector('.codicon-loading, .codicon-loading-compact'),
				shimmerText: shimmerText?.textContent,
				// A negative animation-delay keeps the sweep continuous across streaming rerenders.
				shimmerPhaseSynced: (shimmerText?.style.animationDelay ?? '').endsWith('ms'),
				text: part.domNode.textContent,
			};
		};

		assert.deepStrictEqual({
			patch: inspect(patchPart),
			edit: inspect(editPart),
			thinking: inspect(thinkingPart),
		}, {
			patch: { shimmer: true, spinner: false, shimmerText: 'Generating patch', shimmerPhaseSynced: true, text: 'Generating patch (282 lines)' },
			edit: { shimmer: true, spinner: false, shimmerText: 'Editing', shimmerPhaseSynced: true, text: 'Editing 5 lines' },
			thinking: { shimmer: false, spinner: false, shimmerText: undefined, shimmerPhaseSynced: false, text: 'Generating patch (282 lines)' },
		});
	});

	test('adds shimmer styling only for active ask questions invocation progress', () => {
		const askQuestionsTool = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			createToolInvocation({
				toolId: 'vscode_askQuestions',
				invocationMessage: 'Asking a question (Target)'
			}),
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));
		const askMultipleQuestionsTool = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			createToolInvocation({
				toolId: 'vscode_askQuestions',
				invocationMessage: 'Asking 3 questions (What should we work on?, Preferred area, How hands-on?)'
			}),
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));
		const analyzingAnswersTool = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			createToolInvocation({
				toolId: 'vscode_askQuestions',
				invocationMessage: 'Asking a question (Target)',
				progressMessage: 'Analyzing your answers...'
			}),
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));
		const waitingForAnswerTool = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			createToolInvocation({
				toolId: 'ask_user',
				invocationMessage: 'Waiting for answer...'
			}),
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));

		assert.deepStrictEqual([
			!!askQuestionsTool.domNode.querySelector('.shimmer-progress'),
			askQuestionsTool.domNode.querySelector('.chat-progress-shimmer-text')?.textContent,
			askQuestionsTool.domNode.textContent,
			askMultipleQuestionsTool.domNode.querySelector('.chat-progress-shimmer-text')?.textContent,
			askMultipleQuestionsTool.domNode.textContent,
			!!analyzingAnswersTool.domNode.querySelector('.shimmer-progress'),
			analyzingAnswersTool.domNode.querySelector('.chat-progress-shimmer-text')?.textContent,
			!!waitingForAnswerTool.domNode.querySelector('.shimmer-progress')
		], [true, 'Asking a question', 'Asking a question (Target)', 'Asking 3 questions', 'Asking 3 questions (What should we work on?, Preferred area, How hands-on?)', false, undefined, true]);
	});

	test('does not render a loading icon for run playwright code progress', () => {
		const tool = createToolInvocation({
			toolId: 'run_playwright_code',
			invocationMessage: 'Running Playwright code...'
		});

		const part = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			tool,
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));

		assert.strictEqual(part.domNode.querySelector('.codicon-loading, .codicon-loading-compact'), null);
	});

	test('renders markdown file pills in regular tool messages', () => {
		const invocationMessage = new MarkdownString('Edit [](claudeAgent.ts)');
		invocationMessage.baseUri = URI.file('/workspace/');
		const tool = createToolInvocation({ toolId: 'edit', invocationMessage });
		const markdownRenderer: IMarkdownRenderer = {
			render: (markdown, options) => renderMarkdown(markdown, options),
		};

		const part = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			tool,
			createRenderContext(false),
			markdownRenderer,
			new Set<string>()
		));

		assert.strictEqual(
			part.domNode.querySelector<HTMLElement>('.chat-inline-anchor-widget .icon-label')?.textContent,
			'claudeAgent.ts'
		);
	});

	test('does not add shimmer styling for non-MCP tool progress', () => {
		const tool = createSerializedToolInvocation({
			source: ToolDataSource.Internal,
			toolId: 'fetch_webpage'
		});

		const part = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			tool,
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));

		assert.strictEqual(part.domNode.querySelector('.shimmer-progress'), null);
	});

	test('renders another client tool with an accessible inline skip action', () => {
		let cancelCount = 0;
		const state = observableValue<IChatToolInvocation.State>('state', {
			type: IChatToolInvocation.StateKind.Executing,
			parameters: undefined,
			confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			progress: observableValue('progress', { progress: undefined }),
		});
		const invocation: IChatToolInvocation = {
			...createToolInvocation({ invocationMessage: 'Running Run Task on another client...' }),
			pastTenseMessage: 'Ran Task',
			state,
			otherClientToolCall: {
				cancel: () => {
					cancelCount++;
					state.set({
						type: IChatToolInvocation.StateKind.Completed,
						parameters: undefined,
						confirmationMessages: undefined,
						confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
						postConfirmed: undefined,
						resultDetails: undefined,
						contentForModel: [],
					}, undefined);
				}
			},
		};
		const markdownRenderer: IMarkdownRenderer = {
			render: (markdown, options) => renderMarkdown(markdown, options),
		};
		const part = renderToolInvocation(invocation, markdownRenderer);
		const skipLink = part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]');
		const progressText = part.domNode.querySelector('.progress-step')?.textContent?.replaceAll('\u00a0', ' ');
		const linkParagraphText = skipLink?.closest('p')?.textContent?.replaceAll('\u00a0', ' ');
		const linkLabel = skipLink?.textContent;
		const linkRole = skipLink?.getAttribute('role');
		const linkHref = skipLink?.getAttribute('href');
		const tabIndex = skipLink?.tabIndex;

		skipLink?.click();

		assert.deepStrictEqual({
			progressText,
			linkParagraphText,
			textAfterSkip: part.domNode.textContent?.replaceAll('\u00a0', ' '),
			linkAfterSkip: part.domNode.querySelector('a[data-href="#skip"]'),
			linkLabel,
			linkRole,
			linkHref,
			tabIndex,
			cancelCount,
		}, {
			progressText: 'Running Run Task on another client... Skip?',
			linkParagraphText: 'Running Run Task on another client... Skip?',
			textAfterSkip: 'Ran Task',
			linkAfterSkip: null,
			linkLabel: 'Skip?',
			linkRole: 'button',
			linkHref: '',
			tabIndex: 0,
			cancelCount: 1,
		});
	});

	test('does not add shimmer styling for completed MCP tool progress', () => {
		const mcpTool = createSerializedToolInvocation({
			source: {
				type: 'mcp',
				label: 'Weather MCP',
				serverLabel: 'Weather',
				instructions: undefined,
				collectionId: 'collection',
				definitionId: 'definition'
			},
			toolId: 'weather_lookup'
		});

		const part = disposables.add(instantiationService.createInstance(
			ChatToolProgressSubPart,
			mcpTool,
			createRenderContext(false),
			mockMarkdownRenderer,
			new Set<string>()
		));

		assert.strictEqual(part.domNode.querySelector('.shimmer-progress'), null);
	});
});
