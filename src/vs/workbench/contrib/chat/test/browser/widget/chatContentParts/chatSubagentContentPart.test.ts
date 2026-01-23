/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLElement } from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatSubagentContentPart } from '../../../../browser/widget/chatContentParts/chatSubagentContentPart.js';
import { IChatMarkdownContent, IChatSubagentToolInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { CodeBlockModelCollection } from '../../../../common/widget/codeBlockModelCollection.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { ChatTreeItem } from '../../../../browser/chat.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { RunSubagentTool } from '../../../../common/tools/builtinTools/runSubagentTool.js';
import { CollapsibleListPool } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';

suite('ChatSubagentContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type ToolInvocationParameters = IChatToolInvocation.State extends { parameters: infer P } ? P : never;

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockMarkdownRenderer: IMarkdownRenderer;
	let mockAnchorService: IChatMarkdownAnchorService;
	let mockHoverService: IHoverService;
	let mockListPool: CollapsibleListPool;
	let mockEditorPool: EditorPool;
	let mockCodeBlockModelCollection: CodeBlockModelCollection;
	let announcedToolProgressKeys: Set<string>;

	function createMockRenderContext(isComplete: boolean = false): IChatContentPartRenderContext {
		const mockElement: Partial<IChatResponseViewModel> = {
			isComplete,
			id: 'test-response-id',
			sessionResource: URI.parse('chat-session://test/session1'),
			get model() { return {} as IChatResponseViewModel['model']; }
		};

		return {
			element: mockElement as ChatTreeItem,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			editorPool: mockEditorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: {} as DiffEditorPool,
			codeBlockModelCollection: mockCodeBlockModelCollection,
			currentWidth: observableValue('currentWidth', 500),
			onDidChangeVisibility: Event.None
		};
	}

	function createState(stateType: IChatToolInvocation.StateKind, parameters?: ToolInvocationParameters): IChatToolInvocation.State {
		switch (stateType) {
			case IChatToolInvocation.StateKind.Streaming:
				return {
					type: IChatToolInvocation.StateKind.Streaming,
					partialInput: observableValue('partialInput', {}),
					streamingMessage: observableValue('streamingMessage', undefined)
				};
			case IChatToolInvocation.StateKind.Completed:
				return {
					type: IChatToolInvocation.StateKind.Completed,
					parameters,
					confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					resultDetails: undefined,
					postConfirmed: undefined,
					contentForModel: [{ kind: 'text', value: 'test result' }]
				};
			case IChatToolInvocation.StateKind.Executing:
				return {
					type: IChatToolInvocation.StateKind.Executing,
					parameters,
					confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					progress: observableValue('progress', { message: undefined, progress: undefined })
				};
			case IChatToolInvocation.StateKind.WaitingForConfirmation:
				return {
					type: IChatToolInvocation.StateKind.WaitingForConfirmation,
					parameters,
					confirm: () => { }
				};
			case IChatToolInvocation.StateKind.WaitingForPostApproval:
				return {
					type: IChatToolInvocation.StateKind.WaitingForPostApproval,
					parameters,
					confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					resultDetails: undefined,
					contentForModel: [{ kind: 'text', value: 'test result' }],
					confirm: () => { }
				};
			case IChatToolInvocation.StateKind.Cancelled:
				return {
					type: IChatToolInvocation.StateKind.Cancelled,
					parameters,
					reason: ToolConfirmKind.Denied
				};
		}
	}

	function createMockToolInvocation(options: {
		toolId?: string;
		subAgentInvocationId?: string;
		toolSpecificData?: IChatSubagentToolInvocationData;
		stateType?: IChatToolInvocation.StateKind;
		parameters?: ToolInvocationParameters;
	} = {}): IChatToolInvocation {
		const stateType = options.stateType ?? IChatToolInvocation.StateKind.Streaming;
		const stateValue = createState(stateType, options.parameters);

		const toolInvocation: IChatToolInvocation = {
			presentation: undefined,
			toolSpecificData: options.toolSpecificData ?? {
				kind: 'subagent',
				description: 'Test subagent description',
				agentName: 'TestAgent',
				prompt: 'Test prompt'
			},
			originMessage: undefined,
			invocationMessage: 'Running subagent...',
			pastTenseMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: options.toolId ?? RunSubagentTool.Id,
			toolCallId: options.subAgentInvocationId ?? 'test-tool-call-id',
			subAgentInvocationId: options.subAgentInvocationId ?? 'test-subagent-id',
			state: observableValue('state', stateValue),
			kind: 'toolInvocation',
			toJSON: () => createMockSerializedToolInvocation({
				toolId: options.toolId ?? RunSubagentTool.Id,
				subAgentInvocationId: options.subAgentInvocationId ?? 'test-subagent-id',
				toolSpecificData: options.toolSpecificData,
				isComplete: stateType === IChatToolInvocation.StateKind.Completed
			})
		};

		return toolInvocation;
	}

	function createMockSerializedToolInvocation(options: {
		toolId?: string;
		subAgentInvocationId?: string;
		toolSpecificData?: IChatSubagentToolInvocationData;
		isComplete?: boolean;
	} = {}): IChatToolInvocationSerialized {
		return {
			presentation: undefined,
			toolSpecificData: options.toolSpecificData ?? {
				kind: 'subagent',
				description: 'Test subagent description',
				agentName: 'TestAgent',
				prompt: 'Test prompt',
				result: 'Test result text'
			},
			originMessage: undefined,
			invocationMessage: 'Running subagent...',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: options.isComplete ?? true,
			toolCallId: options.subAgentInvocationId ?? 'test-tool-call-id',
			toolId: options.toolId ?? RunSubagentTool.Id,
			source: ToolDataSource.Internal,
			subAgentInvocationId: options.subAgentInvocationId ?? 'test-subagent-id',
			kind: 'toolInvocationSerialized'
		};
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);

		// Create a mock markdown renderer
		mockMarkdownRenderer = {
			render: (_markdown: IMarkdownString, _options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown => {
				const element = outElement ?? mainWindow.document.createElement('div');
				const content = typeof _markdown === 'string' ? _markdown : (_markdown.value ?? '');
				element.textContent = content;
				return {
					element,
					dispose: () => { }
				};
			}
		};

		// Mock the anchor service
		mockAnchorService = {
			_serviceBrand: undefined,
			register: () => ({ dispose: () => { } }),
			lastFocusedAnchor: undefined
		};
		instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);

		// Mock hover service
		mockHoverService = {
			_serviceBrand: undefined,
			showDelayedHover: () => undefined,
			setupDelayedHover: () => ({ dispose: () => { } }),
			setupDelayedHoverAtMouse: () => ({ dispose: () => { } }),
			showInstantHover: () => undefined,
			hideHover: () => { },
			showAndFocusLastHover: () => { },
			setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
			showManagedHover: () => { }
		};
		instantiationService.stub(IHoverService, mockHoverService);

		// Mock list pool and editor pool
		mockListPool = {} as CollapsibleListPool;
		mockEditorPool = {} as EditorPool;
		mockCodeBlockModelCollection = {} as CodeBlockModelCollection;
		announcedToolProgressKeys = new Set();
	});

	teardown(() => {
		disposables.dispose();
	});

	function createPart(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		idOverride?: string
	): ChatSubagentContentPart {
		const part = store.add(instantiationService.createInstance(
			ChatSubagentContentPart,
			idOverride ?? toolInvocation.subAgentInvocationId!,
			toolInvocation,
			context,
			mockMarkdownRenderer,
			mockListPool,
			mockEditorPool,
			() => 500,
			mockCodeBlockModelCollection,
			announcedToolProgressKeys
		));

		mainWindow.document.body.appendChild(part.domNode);
		disposables.add({ dispose: () => part.domNode.remove() });

		return part;
	}


	function getCollapseButton(part: ChatSubagentContentPart): HTMLElement | undefined {
		const label = part.domNode.firstElementChild;
		if (!isHTMLElement(label)) {
			return undefined;
		}

		const button = label.firstElementChild;
		return isHTMLElement(button) ? button : undefined;
	}

	function getCollapseButtonLabel(button: HTMLElement): HTMLElement | undefined {
		const label = button.lastElementChild;
		return isHTMLElement(label) ? label : undefined;
	}

	function getCollapseButtonIcon(button: HTMLElement): HTMLElement | undefined {
		const icon = button.firstElementChild;
		return isHTMLElement(icon) ? icon : undefined;
	}

	function getWrapperElement(part: ChatSubagentContentPart): HTMLElement | undefined {
		const wrapper = part.domNode.lastElementChild;
		return isHTMLElement(wrapper) ? wrapper : undefined;
	}

	suite('Basic rendering', () => {
		test('should create subagent part with correct classes', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.ok(part.domNode.classList.contains('chat-thinking-box'), 'Should have chat-thinking-box class');
			assert.ok(part.domNode.classList.contains('chat-subagent-part'), 'Should have chat-subagent-part class');
			assert.ok(part.domNode.classList.contains('chat-thinking-fixed-mode'), 'Should have chat-thinking-fixed-mode class');
		});

		test('should start collapsed', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed by default');
		});

		test('should be focusable via tabIndex', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.strictEqual(part.domNode.tabIndex, 0, 'Should be focusable');
		});
	});

	suite('Title extraction', () => {
		test('should extract title with agent name from toolSpecificData', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Searching the codebase',
					agentName: 'CodeSearchAgent',
					prompt: 'Search for authentication'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			assert.ok(buttonText.includes('CodeSearchAgent'), 'Title should include agent name');
			assert.ok(buttonText.includes('Searching the codebase'), 'Title should include description');
		});

		test('should use default prefix when no agent name is provided', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task'
					// no agentName
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			assert.ok(buttonText.includes('Subagent:'), 'Title should use default Subagent prefix');
		});
	});

	suite('State management', () => {
		test('should start as active', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.strictEqual(part.getIsActive(), true, 'Should start as active');
		});

		test('markAsInactive should update isActive state', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			part.markAsInactive();

			assert.strictEqual(part.getIsActive(), false, 'Should be inactive after markAsInactive');
		});

		test('markAsInactive should remove streaming class', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand to trigger wrapper creation
			const button = getCollapseButton(part);
			button?.click();

			part.markAsInactive();

			const wrapper = getWrapperElement(part);
			if (wrapper) {
				assert.strictEqual(wrapper.classList.contains('chat-thinking-streaming'), false,
					'Streaming class should be removed after markAsInactive');
			}
		});

		test('markAsInactive should collapse the part', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// First expand
			const button = getCollapseButton(part);
			button?.click();

			// Verify expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false);

			part.markAsInactive();

			// Should collapse when inactive
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed after markAsInactive');
		});

		test('finalizeTitle should update button icon to check', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			part.finalizeTitle();

			// The button should now show a check icon
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const iconElement = getCollapseButtonIcon(button);
			assert.ok(iconElement?.classList.contains('codicon-check'), 'Should have check icon after finalization');
		});
	});

	suite('Serialized invocation', () => {
		test('should handle serialized tool invocation', () => {
			const serializedInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
					agentName: 'FinishedAgent',
					prompt: 'Original prompt',
					result: 'Task completed successfully'
				}
			});
			const context = createMockRenderContext(true); // isComplete = true

			const part = createPart(serializedInvocation, context);

			// Should already be inactive since it's serialized
			assert.strictEqual(part.getIsActive(), false, 'Serialized invocation should be inactive');
		});
	});

	suite('hasSameContent', () => {
		test('should return true for tool invocation with same subAgentInvocationId', () => {
			const toolInvocation = createMockToolInvocation({ subAgentInvocationId: 'subagent-123' });
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const otherInvocation = createMockToolInvocation({
				toolId: 'some-tool',
				subAgentInvocationId: 'subagent-123'
			});

			const result = part.hasSameContent(otherInvocation, [], context.element);
			assert.strictEqual(result, true, 'Should match tool invocation with same subAgentInvocationId');
		});

		test('should return false for tool invocation with different subAgentInvocationId', () => {
			const toolInvocation = createMockToolInvocation({ subAgentInvocationId: 'subagent-123' });
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const otherInvocation = createMockToolInvocation({
				toolId: 'some-tool',
				subAgentInvocationId: 'subagent-456'
			});

			const result = part.hasSameContent(otherInvocation, [], context.element);
			assert.strictEqual(result, false, 'Should not match tool invocation with different subAgentInvocationId');
		});

		test('should return true for runSubagent tool using toolCallId as effective ID', () => {
			const toolInvocation = createMockToolInvocation({
				toolId: RunSubagentTool.Id,
				subAgentInvocationId: 'call-abc'
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context, toolInvocation.toolCallId);

			const otherInvocation = createMockToolInvocation({
				toolId: RunSubagentTool.Id,
				subAgentInvocationId: 'call-abc'
			});

			const result = part.hasSameContent(otherInvocation, [], context.element);
			assert.strictEqual(result, true, 'Should match runSubagent tool using toolCallId as effective ID');
		});

		test('should return false for non-subagent content', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'test' }
			};

			const result = part.hasSameContent(markdownContent, [], context.element);
			assert.strictEqual(result, false, 'Should not match non-subagent content');
		});
	});

	suite('Streaming behavior', () => {
		test('should show loading spinner while streaming', () => {
			const toolInvocation = createMockToolInvocation({
				stateType: IChatToolInvocation.StateKind.Streaming
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Should have loading spinner icon while streaming
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const loadingIcon = getCollapseButtonIcon(button);
			assert.ok(loadingIcon?.classList.contains('codicon-loading'), 'Should have loading spinner while streaming');
		});
	});

	suite('Expand/collapse', () => {
		test('should toggle expansion when button is clicked', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Initially collapsed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'));

			// Click to expand
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have expand button');
			button.click();

			// Should be expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should be expanded after clicking button');

			// Click again to collapse
			button.click();

			// Should be collapsed again
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'),
				'Should be collapsed after clicking button again');
		});

		test('should have proper aria-expanded attribute', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			assert.strictEqual(button.getAttribute('aria-expanded'), 'false', 'Should have aria-expanded="false" when collapsed');

			// Expand
			button.click();

			assert.strictEqual(button.getAttribute('aria-expanded'), 'true', 'Should have aria-expanded="true" when expanded');
		});
	});
});
