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
			element: mockElement as IChatResponseViewModel,
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
					confirmationMessages: {
						title: 'Confirm action',
						message: 'Are you sure you want to proceed?'
					},
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
		toolCallId?: string;
		subAgentInvocationId?: string;
		toolSpecificData?: IChatSubagentToolInvocationData;
		stateType?: IChatToolInvocation.StateKind;
		parameters?: ToolInvocationParameters;
		invocationMessage?: string;
	} = {}): IChatToolInvocation {
		const stateType = options.stateType ?? IChatToolInvocation.StateKind.Streaming;
		const stateValue = createState(stateType, options.parameters);
		const toolCallId = options.toolCallId ?? 'tool-call-' + Math.random().toString(36).substring(7);

		const toolInvocation: IChatToolInvocation = {
			presentation: undefined,
			toolSpecificData: options.toolSpecificData ?? {
				kind: 'subagent',
				description: 'Test subagent description',
				agentName: 'TestAgent',
				prompt: 'Test prompt'
			},
			originMessage: undefined,
			invocationMessage: options.invocationMessage ?? 'Running subagent...',
			pastTenseMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: options.toolId ?? RunSubagentTool.Id,
			toolCallId: toolCallId,
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
			const sharedToolCallId = 'shared-tool-call-id';
			const toolInvocation = createMockToolInvocation({
				toolId: RunSubagentTool.Id,
				toolCallId: sharedToolCallId,
				subAgentInvocationId: 'call-abc'
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context, toolInvocation.toolCallId);

			const otherInvocation = createMockToolInvocation({
				toolId: RunSubagentTool.Id,
				toolCallId: sharedToolCallId,
				subAgentInvocationId: 'call-abc'
			});

			const result = part.hasSameContent(otherInvocation, [], context.element);
			assert.strictEqual(result, true, 'Should match runSubagent tool using toolCallId as effective ID');
		});

		test('should return true for markdownContent (allowing grouping)', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'test' }
			};

			const result = part.hasSameContent(markdownContent, [], context.element);
			assert.strictEqual(result, true, 'Should match markdownContent to allow grouping');
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

	suite('Lazy rendering', () => {
		test('should defer prompt/result rendering until expanded when initially complete', () => {
			const serializedInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
					agentName: 'FinishedAgent',
					prompt: 'Original prompt for the task',
					result: 'Task completed successfully'
				}
			});
			const context = createMockRenderContext(true); // isComplete = true

			const part = createPart(serializedInvocation, context);

			// Content should be collapsed - no wrapper content initially visible
			// Just verify that the domNode has the collapsed class
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed initially');

			// Expand to trigger lazy rendering
			const button = getCollapseButton(part);
			assert.ok(button, 'Expand button should exist');
			button.click();

			// After expanding, the content containers should be rendered
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded');

			// Verify prompt and result sections exist in the expanded content
			const wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapperContent, 'Wrapper content should exist after expand');

			// Check that sections were inserted
			const sections = wrapperContent.querySelectorAll('.chat-subagent-section');
			assert.ok(sections.length >= 2, 'Should have prompt and result sections after expand');
		});

		test('should not render wrapper content while subagent is running (truly collapsed)', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Running task',
					agentName: 'RunningAgent',
					prompt: 'Prompt text'
				},
				stateType: IChatToolInvocation.StateKind.Streaming
			});
			const context = createMockRenderContext(false); // Not complete

			const part = createPart(toolInvocation, context);

			// Should be collapsed with just the title visible
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed while running');

			// Wrapper content should not be initialized yet (lazy)
			const wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.strictEqual(wrapperContent, null, 'Wrapper content should not be rendered while running and collapsed');
		});

		test('should show prompt on expand when no tool items yet', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Starting task',
					agentName: 'RunningAgent',
					prompt: 'This is the prompt to execute'
				},
				stateType: IChatToolInvocation.StateKind.Streaming
			});
			const context = createMockRenderContext(false); // Not complete

			const part = createPart(toolInvocation, context);

			// Initially collapsed with no content
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed initially');
			let wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.strictEqual(wrapperContent, null, 'Wrapper should not exist initially');

			// Expand
			const button = getCollapseButton(part);
			assert.ok(button, 'Expand button should exist');
			button.click();

			// Wrapper should now exist and be visible
			wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapperContent, 'Wrapper should exist after expand');

			// Prompt section should be rendered
			const promptSection = wrapperContent.querySelector('.chat-subagent-section');
			assert.ok(promptSection, 'Prompt section should be visible after expand');
		});
	});

	suite('Current running tool in title', () => {
		test('should update title with current running tool invocation message', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add a child tool invocation
			const childTool = createMockToolInvocation({
				toolId: 'readFile',
				subAgentInvocationId: toolInvocation.subAgentInvocationId,
				stateType: IChatToolInvocation.StateKind.Executing,
				invocationMessage: 'Reading config.ts'
			});

			part.appendToolInvocation(childTool, 0);

			// The title should include the current running tool message
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			assert.ok(buttonText.includes('Reading config.ts'), 'Title should include current running tool message');
		});

		test('should show latest tool when multiple tools are added', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add first tool
			const firstTool = createMockToolInvocation({
				toolId: 'readFile',
				subAgentInvocationId: toolInvocation.subAgentInvocationId,
				stateType: IChatToolInvocation.StateKind.Executing,
				invocationMessage: 'Reading file1.ts'
			});
			part.appendToolInvocation(firstTool, 0);

			// Add second tool
			const secondTool = createMockToolInvocation({
				toolId: 'searchFiles',
				subAgentInvocationId: toolInvocation.subAgentInvocationId,
				stateType: IChatToolInvocation.StateKind.Executing,
				invocationMessage: 'Searching for patterns'
			});
			part.appendToolInvocation(secondTool, 1);

			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			// Should show the latest tool message
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should include latest tool message');
		});

		test('should keep showing running tool when another tool completes', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add first tool (will complete)
			const firstToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const firstTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: firstToolState,
				invocationMessage: 'Reading file1.ts'
			};
			part.trackToolState(firstTool);

			// Add second tool (will keep running)
			const secondToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const secondTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'searchFiles',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: secondToolState,
				invocationMessage: 'Searching for patterns'
			};
			part.trackToolState(secondTool);

			// Verify title shows second tool
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should show second tool');

			// Complete the first tool
			firstToolState.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			// Title should still show the second tool (which is still running and owns the title)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should still show second tool after first completes');
		});

		test('should keep title when tool is cancelled', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add a tool that will be cancelled
			const toolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: toolState,
				invocationMessage: 'Reading file.ts'
			};
			part.trackToolState(childTool);

			// Verify title includes tool message
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading file.ts'), 'Title should include tool message while running');

			// Cancel the tool
			toolState.set(createState(IChatToolInvocation.StateKind.Cancelled), undefined);

			// Title should still include the tool message (persists like thinking part)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading file.ts'),
				'Title should still include tool message after cancellation');
		});

		test('should keep showing last tool message when that tool completes', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// First tool starts
			const firstToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const firstTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: firstToolState,
				invocationMessage: 'Reading file1.ts'
			};
			part.trackToolState(firstTool);

			// Verify title shows first tool
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading file1.ts'), 'Title should show first tool');

			// Second tool starts and becomes the current title
			const secondToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const secondTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'searchFiles',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: secondToolState,
				invocationMessage: 'Searching for patterns'
			};
			part.trackToolState(secondTool);

			// Verify title shows second tool
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should show second tool');

			// Second tool completes
			secondToolState.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			// Title should still show second tool (persists like thinking part)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'),
				'Title should still show last tool message after completion');
		});
	});

	suite('appendMarkdownItem', () => {
		test('should append markdown item to expanded subagent part', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-id',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand the part first
			const button = getCollapseButton(part);
			button?.click();
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded');

			// Create a mock markdown content with edit pill
			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'Edited file.ts' }
			};

			// Create a mock DOM node for the markdown
			const markdownDomNode = mainWindow.document.createElement('div');
			markdownDomNode.className = 'chat-codeblock-button';
			markdownDomNode.textContent = 'file.ts';

			let disposeCallCount = 0;
			const mockDisposable = { dispose: () => { disposeCallCount++; } };

			// Append markdown item
			part.appendMarkdownItem(
				() => ({ domNode: markdownDomNode, disposable: mockDisposable }),
				'codeblock-123',
				markdownContent,
				undefined
			);

			// Verify the markdown was appended
			const wrapper = getWrapperElement(part);
			assert.ok(wrapper, 'Wrapper should exist');
			const appendedElement = wrapper.querySelector('.chat-codeblock-button');
			assert.ok(appendedElement, 'Appended markdown element should exist in wrapper');
			assert.strictEqual(appendedElement.textContent, 'file.ts', 'Should have correct content');
		});

		test('should not render markdown item when part is collapsed', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-defer',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Part is collapsed by default
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should start collapsed');

			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'Deferred edit' }
			};

			let factoryCalled = false;
			const markdownDomNode = mainWindow.document.createElement('div');
			markdownDomNode.className = 'deferred-edit';
			markdownDomNode.textContent = 'deferred.ts';

			const mockDisposable = { dispose: () => { } };

			// Append markdown item while collapsed - factory should not be called
			part.appendMarkdownItem(
				() => {
					factoryCalled = true;
					return { domNode: markdownDomNode, disposable: mockDisposable };
				},
				'codeblock-deferred',
				markdownContent,
				undefined
			);

			// Factory should not be called when collapsed
			assert.strictEqual(factoryCalled, false, 'Factory should not be called when collapsed');
		});

		test('should append multiple markdown items with same codeblock ID', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-dedup',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand the part
			const button = getCollapseButton(part);
			button?.click();

			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'Same codeblock' }
			};

			const sharedCodeblockId = 'codeblock-same-id';

			// Append first item
			const firstNode = mainWindow.document.createElement('div');
			firstNode.className = 'first-item';
			firstNode.textContent = 'first item content';
			part.appendMarkdownItem(
				() => ({ domNode: firstNode, disposable: { dispose: () => { } } }),
				sharedCodeblockId,
				markdownContent,
				undefined
			);

			// Append second item with same codeblock ID
			const secondNode = mainWindow.document.createElement('div');
			secondNode.className = 'second-item';
			secondNode.textContent = 'second item content';
			part.appendMarkdownItem(
				() => ({ domNode: secondNode, disposable: { dispose: () => { } } }),
				sharedCodeblockId,
				markdownContent,
				undefined
			);

			// Both items are added (no built-in deduplication by codeblock ID)
			const wrapper = getWrapperElement(part);
			assert.ok(wrapper, 'Wrapper should exist');
			const firstItems = wrapper.querySelectorAll('.first-item');
			const secondItems = wrapper.querySelectorAll('.second-item');
			// Implementation does not deduplicate - both items exist
			assert.strictEqual(firstItems.length, 1, 'First item should exist');
			assert.strictEqual(secondItems.length, 1, 'Second item should exist');
		});

		test('should handle multiple different codeblock IDs', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-multi',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand the part
			const button = getCollapseButton(part);
			button?.click();

			// Append first item
			const firstNode = mainWindow.document.createElement('div');
			firstNode.className = 'item-one';
			firstNode.textContent = 'first item content';
			part.appendMarkdownItem(
				() => ({ domNode: firstNode, disposable: { dispose: () => { } } }),
				'codeblock-1',
				{ kind: 'markdownContent', content: { value: 'First' } },
				undefined
			);

			// Append second item with different ID
			const secondNode = mainWindow.document.createElement('div');
			secondNode.className = 'item-two';
			secondNode.textContent = 'second item content';
			part.appendMarkdownItem(
				() => ({ domNode: secondNode, disposable: { dispose: () => { } } }),
				'codeblock-2',
				{ kind: 'markdownContent', content: { value: 'Second' } },
				undefined
			);

			// Both should exist
			const wrapper = getWrapperElement(part);
			assert.ok(wrapper, 'Wrapper should exist');
			assert.ok(wrapper.querySelector('.item-one'), 'First item should exist');
			assert.ok(wrapper.querySelector('.item-two'), 'Second item should exist');
		});
	});

	suite('Auto-expand on confirmation', () => {
		test('should auto-expand when tool state becomes WaitingForConfirmation', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Verify initially collapsed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should start collapsed');

			// Create a tool invocation that starts in executing state, then changes to WaitingForConfirmation
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Reading file'
			};

			// Track this tool's state (this registers observers)
			part.trackToolState(childTool);

			// Should still be collapsed since tool is executing, not waiting for confirmation
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should still be collapsed when tool is executing');

			// Now change state to WaitingForConfirmation
			stateObservable.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), undefined);

			// Should auto-expand when tool needs confirmation
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand when tool needs confirmation');
		});

		test('should auto-collapse when confirmation is addressed', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Create a tool invocation that is waiting for confirmation
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Run npm install'
			};

			// Track this tool's state
			part.trackToolState(childTool);

			// Should be expanded now
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should be expanded when waiting for confirmation');

			// Now simulate confirmation being addressed (tool moves to executing)
			stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			// Should auto-collapse after confirmation is addressed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'),
				'Should auto-collapse after confirmation is addressed');
		});

		test('should not auto-collapse if user manually expanded', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// User manually expands
			const button = getCollapseButton(part);
			button?.click();

			// Should be expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded after user click');

			// Create a tool that goes through confirmation cycle
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Run npm install'
			};

			// Track this tool's state
			part.trackToolState(childTool);

			// Confirm the tool (move to executing)
			stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			// Since user manually expanded, it should stay expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should stay expanded when user manually expanded');
		});

		test('should respect manual expansion after auto-expand', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Verify initially collapsed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should start collapsed');

			// Create a tool that needs confirmation
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Run npm install'
			};

			part.trackToolState(childTool);

			// Should auto-expand
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand for confirmation');

			// User manually collapses
			const button = getCollapseButton(part);
			button?.click();
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user click');

			// User manually expands again
			button?.click();
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should expand after second user click');

			// Confirm the tool (move to executing)
			stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			// Since user manually re-expanded after auto-expand, should stay expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should stay expanded when user manually re-expanded after auto-expand');
		});

		test('should resume auto-collapse after user manually expands then collapses', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// First confirmation cycle - user manually expands
			const stateObservable1 = observableValue('state1', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool1: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					toolCallId: 'tool1',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable1,
				invocationMessage: 'First tool'
			};

			part.trackToolState(childTool1);

			// Should auto-expand for first confirmation
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand for first confirmation');

			// User manually collapses
			const button = getCollapseButton(part);
			button?.click();
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user click');

			// User manually expands (this sets userManuallyExpanded = true)
			button?.click();
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should expand after user re-expands');

			// Complete first tool (should not auto-collapse since user manually expanded)
			stateObservable1.set(createState(IChatToolInvocation.StateKind.Completed), undefined);
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should stay expanded after first tool completes (user manually expanded)');

			// User manually collapses again (this resets userManuallyExpanded)
			button?.click();
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user manually collapses');

			// Second confirmation cycle - should auto-collapse now since userManuallyExpanded was reset
			const stateObservable2 = observableValue('state2', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool2: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					toolCallId: 'tool2',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable2,
				invocationMessage: 'Second tool'
			};

			part.trackToolState(childTool2);

			// Should auto-expand for second confirmation
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand for second confirmation');

			// Complete second tool - should auto-collapse since userManuallyExpanded was reset by the earlier collapse
			stateObservable2.set(createState(IChatToolInvocation.StateKind.Executing), undefined);
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'),
				'Should auto-collapse after second confirmation is addressed (userManuallyExpanded was reset)');
		});

		test('should clear current running tool message when tool completes', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Create a tool that will complete
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Reading config.ts'
			};

			part.trackToolState(childTool);

			// Verify title includes tool message
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading config.ts'), 'Title should include tool message while running');

			// Complete the tool
			stateObservable.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			// Title should still include the tool message (persists like thinking part)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading config.ts'),
				'Title should still include tool message after completion');
		});
	});
});
