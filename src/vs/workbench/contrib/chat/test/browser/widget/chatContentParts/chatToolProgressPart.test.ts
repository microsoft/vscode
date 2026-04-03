/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatToolProgressSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolProgressPart.js';
import { isMcpToolInvocation } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolPartUtilities.js';
import { DiffEditorPool, EditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ToolDataSource, type ToolDataSource as ToolDataSourceType } from '../../../../common/tools/languageModelToolsService.js';

suite('ChatToolProgressSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockMarkdownRenderer: IMarkdownRenderer;
	let mockAnchorService: IChatMarkdownAnchorService;
	let mockHoverService: IHoverService;
	let mockConfigurationService: TestConfigurationService;
	let mockEditorPool: EditorPool;

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

	function createSerializedToolInvocation(options: {
		source?: ToolDataSourceType;
		toolId?: string;
		isComplete?: boolean;
		invocationMessage?: string;
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
		invocationMessage?: string;
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
				progress: observableValue('progress', { message: undefined, progress: undefined })
			}),
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
				const content = typeof markdown === 'string' ? markdown : (markdown.value ?? '');
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

		mockEditorPool = {} as EditorPool;
	});

	teardown(() => {
		disposables.dispose();
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

	test('adds shimmer styling for active MCP tool progress', () => {
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

		assert.ok(part.domNode.querySelector('.shimmer-progress'));
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
