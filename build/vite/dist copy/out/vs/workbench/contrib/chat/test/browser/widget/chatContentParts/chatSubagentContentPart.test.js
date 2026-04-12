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
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { RunSubagentTool } from '../../../../common/tools/builtinTools/runSubagentTool.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
suite('ChatSubagentContentPart', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let disposables;
    let instantiationService;
    let mockMarkdownRenderer;
    let mockAnchorService;
    let mockHoverService;
    let mockListPool;
    let mockEditorPool;
    let announcedToolProgressKeys;
    function createMockRenderContext(isComplete = false) {
        const mockElement = {
            isComplete,
            id: 'test-response-id',
            sessionResource: URI.parse('chat-session://test/session1'),
            get model() { return {}; }
        };
        return {
            element: mockElement,
            inlineTextModels: {},
            elementIndex: 0,
            container: mainWindow.document.createElement('div'),
            content: [],
            contentIndex: 0,
            editorPool: mockEditorPool,
            codeBlockStartIndex: 0,
            treeStartIndex: 0,
            diffEditorPool: {},
            currentWidth: observableValue('currentWidth', 500),
            onDidChangeVisibility: Event.None
        };
    }
    function createState(stateType, parameters) {
        switch (stateType) {
            case 0 /* IChatToolInvocation.StateKind.Streaming */:
                return {
                    type: 0 /* IChatToolInvocation.StateKind.Streaming */,
                    partialInput: observableValue('partialInput', {}),
                    streamingMessage: observableValue('streamingMessage', undefined)
                };
            case 4 /* IChatToolInvocation.StateKind.Completed */:
                return {
                    type: 4 /* IChatToolInvocation.StateKind.Completed */,
                    parameters,
                    confirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
                    resultDetails: undefined,
                    postConfirmed: undefined,
                    contentForModel: [{ kind: 'text', value: 'test result' }]
                };
            case 2 /* IChatToolInvocation.StateKind.Executing */:
                return {
                    type: 2 /* IChatToolInvocation.StateKind.Executing */,
                    parameters,
                    confirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
                    progress: observableValue('progress', { message: undefined, progress: undefined })
                };
            case 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */:
                return {
                    type: 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */,
                    parameters,
                    confirmationMessages: {
                        title: 'Confirm action',
                        message: 'Are you sure you want to proceed?'
                    },
                    confirm: () => { }
                };
            case 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */:
                return {
                    type: 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */,
                    parameters,
                    confirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
                    resultDetails: undefined,
                    contentForModel: [{ kind: 'text', value: 'test result' }],
                    confirm: () => { }
                };
            case 5 /* IChatToolInvocation.StateKind.Cancelled */:
                return {
                    type: 5 /* IChatToolInvocation.StateKind.Cancelled */,
                    parameters,
                    reason: 0 /* ToolConfirmKind.Denied */
                };
        }
    }
    function createMockToolInvocation(options = {}) {
        const stateType = options.stateType ?? 0 /* IChatToolInvocation.StateKind.Streaming */;
        const stateValue = createState(stateType, options.parameters);
        const toolCallId = options.toolCallId ?? 'tool-call-' + Math.random().toString(36).substring(7);
        const toolInvocation = {
            presentation: undefined,
            toolSpecificData: options.toolSpecificData ?? {
                kind: 'subagent',
                description: 'Test subagent description',
                agentName: 'TestAgent',
                prompt: 'Test prompt'
            },
            originMessage: undefined,
            invocationMessage: options.invocationMessage ?? 'Running subagent',
            pastTenseMessage: undefined,
            source: ToolDataSource.Internal,
            toolId: options.toolId ?? RunSubagentTool.Id,
            toolCallId: toolCallId,
            subAgentInvocationId: options.subAgentInvocationId,
            state: observableValue('state', stateValue),
            isAttachedToThinking: false,
            kind: 'toolInvocation',
            toJSON: () => createMockSerializedToolInvocation({
                toolId: options.toolId ?? RunSubagentTool.Id,
                subAgentInvocationId: options.subAgentInvocationId,
                toolSpecificData: options.toolSpecificData,
                isComplete: stateType === 4 /* IChatToolInvocation.StateKind.Completed */
            })
        };
        return toolInvocation;
    }
    function createMockSerializedToolInvocation(options = {}) {
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
            invocationMessage: 'Running subagent',
            pastTenseMessage: undefined,
            resultDetails: undefined,
            isConfirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
            isComplete: options.isComplete ?? true,
            toolCallId: options.subAgentInvocationId ?? 'test-tool-call-id',
            toolId: options.toolId ?? RunSubagentTool.Id,
            source: ToolDataSource.Internal,
            subAgentInvocationId: options.subAgentInvocationId,
            kind: 'toolInvocationSerialized'
        };
    }
    setup(() => {
        disposables = store.add(new DisposableStore());
        instantiationService = workbenchInstantiationService(undefined, store);
        // Create a mock markdown renderer
        mockMarkdownRenderer = {
            render: (_markdown, _options, outElement) => {
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
        mockListPool = {};
        mockEditorPool = {};
        announcedToolProgressKeys = new Set();
    });
    teardown(() => {
        disposables.dispose();
    });
    function createPart(toolInvocation, context, idOverride) {
        const part = store.add(instantiationService.createInstance(ChatSubagentContentPart, idOverride ?? toolInvocation.subAgentInvocationId ?? toolInvocation.toolCallId, toolInvocation, context, mockMarkdownRenderer, mockListPool, mockEditorPool, () => 500, announcedToolProgressKeys));
        mainWindow.document.body.appendChild(part.domNode);
        disposables.add({ dispose: () => part.domNode.remove() });
        return part;
    }
    function getCollapseButton(part) {
        const label = part.domNode.firstElementChild;
        if (!isHTMLElement(label)) {
            return undefined;
        }
        const button = label.firstElementChild;
        return isHTMLElement(button) ? button : undefined;
    }
    function getCollapseButtonLabel(button) {
        const label = button.querySelector('.monaco-button-mdlabel');
        return isHTMLElement(label) ? label : undefined;
    }
    function getCollapseButtonIcon(button) {
        const icon = button.firstElementChild;
        return isHTMLElement(icon) ? icon : undefined;
    }
    function getWrapperElement(part) {
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
                assert.strictEqual(wrapper.classList.contains('chat-thinking-streaming'), false, 'Streaming class should be removed after markAsInactive');
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
        test('markAsInactive should change default description to past tense', () => {
            const toolInvocation = createMockToolInvocation({
                toolSpecificData: {
                    kind: 'subagent',
                    // no description — should use the default "Running subagent"
                }
            });
            const context = createMockRenderContext(false);
            const part = createPart(toolInvocation, context);
            // Before marking inactive, title should show "Running subagent"
            const button = getCollapseButton(part);
            assert.ok(button, 'Should have collapse button');
            const labelBefore = getCollapseButtonLabel(button);
            const textBefore = labelBefore?.textContent ?? button.textContent ?? '';
            assert.ok(textBefore.includes('Running subagent'), 'Title should show "Running subagent" before completion');
            part.markAsInactive();
            // After marking inactive, title should show "Ran subagent"
            const labelAfter = getCollapseButtonLabel(button);
            const textAfter = labelAfter?.textContent ?? button.textContent ?? '';
            assert.ok(textAfter.includes('Ran subagent'), 'Title should show "Ran subagent" after completion');
            assert.ok(!textAfter.includes('Running subagent'), 'Title should no longer show "Running subagent"');
        });
        test('markAsInactive should keep custom description unchanged', () => {
            const toolInvocation = createMockToolInvocation({
                toolSpecificData: {
                    kind: 'subagent',
                    description: 'Searching the codebase',
                    agentName: 'Explorer',
                }
            });
            const context = createMockRenderContext(false);
            const part = createPart(toolInvocation, context);
            part.markAsInactive();
            // After marking inactive, title should still show the custom description
            const button = getCollapseButton(part);
            assert.ok(button, 'Should have collapse button');
            const label = getCollapseButtonLabel(button);
            const text = label?.textContent ?? button.textContent ?? '';
            assert.ok(text.includes('Searching the codebase'), 'Title should keep custom description after completion');
        });
        test('finalizeTitle should update button icon to check', () => {
            // Enable the showCheckmarks setting so the check icon is visible
            const configService = instantiationService.get(IConfigurationService);
            configService.setUserConfiguration("accessibility.chat.showCheckmarks" /* AccessibilityWorkbenchSettingId.ShowChatCheckmarks */, true);
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
            });
            const context = createMockRenderContext(false);
            const part = createPart(toolInvocation, context, toolInvocation.toolCallId);
            const otherInvocation = createMockToolInvocation({
                toolId: RunSubagentTool.Id,
                toolCallId: sharedToolCallId,
            });
            const result = part.hasSameContent(otherInvocation, [], context.element);
            assert.strictEqual(result, true, 'Should match runSubagent tool using toolCallId as effective ID');
        });
        test('should return true for markdownContent (allowing grouping)', () => {
            const toolInvocation = createMockToolInvocation();
            const context = createMockRenderContext(false);
            const part = createPart(toolInvocation, context);
            const markdownContent = {
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
                stateType: 0 /* IChatToolInvocation.StateKind.Streaming */
            });
            const context = createMockRenderContext(false);
            const part = createPart(toolInvocation, context);
            // Should have loading spinner icon while streaming
            const button = getCollapseButton(part);
            assert.ok(button, 'Should have collapse button');
            const loadingIcon = getCollapseButtonIcon(button);
            assert.ok(loadingIcon?.classList.contains('codicon-circle-filled'), 'Should have circle-filled icon while streaming');
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
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded after clicking button');
            // Click again to collapse
            button.click();
            // Should be collapsed again
            assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed after clicking button again');
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
                stateType: 0 /* IChatToolInvocation.StateKind.Streaming */
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
                stateType: 0 /* IChatToolInvocation.StateKind.Streaming */
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
                stateType: 2 /* IChatToolInvocation.StateKind.Executing */,
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
                stateType: 2 /* IChatToolInvocation.StateKind.Executing */,
                invocationMessage: 'Reading file1.ts'
            });
            part.appendToolInvocation(firstTool, 0);
            // Add second tool
            const secondTool = createMockToolInvocation({
                toolId: 'searchFiles',
                subAgentInvocationId: toolInvocation.subAgentInvocationId,
                stateType: 2 /* IChatToolInvocation.StateKind.Executing */,
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
            const firstToolState = observableValue('state', createState(2 /* IChatToolInvocation.StateKind.Executing */));
            const firstTool = {
                ...createMockToolInvocation({
                    toolId: 'readFile',
                    subAgentInvocationId: toolInvocation.subAgentInvocationId
                }),
                state: firstToolState,
                invocationMessage: 'Reading file1.ts'
            };
            part.trackToolState(firstTool);
            // Add second tool (will keep running)
            const secondToolState = observableValue('state', createState(2 /* IChatToolInvocation.StateKind.Executing */));
            const secondTool = {
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
            firstToolState.set(createState(4 /* IChatToolInvocation.StateKind.Completed */), undefined);
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
            const toolState = observableValue('state', createState(2 /* IChatToolInvocation.StateKind.Executing */));
            const childTool = {
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
            toolState.set(createState(5 /* IChatToolInvocation.StateKind.Cancelled */), undefined);
            // Title should still include the tool message (persists like thinking part)
            buttonText = labelElement?.textContent ?? button?.textContent ?? '';
            assert.ok(buttonText.includes('Reading file.ts'), 'Title should still include tool message after cancellation');
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
            const firstToolState = observableValue('state', createState(2 /* IChatToolInvocation.StateKind.Executing */));
            const firstTool = {
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
            const secondToolState = observableValue('state', createState(2 /* IChatToolInvocation.StateKind.Executing */));
            const secondTool = {
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
            secondToolState.set(createState(4 /* IChatToolInvocation.StateKind.Completed */), undefined);
            // Title should still show second tool (persists like thinking part)
            buttonText = labelElement?.textContent ?? button?.textContent ?? '';
            assert.ok(buttonText.includes('Searching for patterns'), 'Title should still show last tool message after completion');
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
            const markdownContent = {
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
            part.appendMarkdownItem(() => ({ domNode: markdownDomNode, disposable: mockDisposable }), 'codeblock-123', markdownContent, undefined);
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
            const markdownContent = {
                kind: 'markdownContent',
                content: { value: 'Deferred edit' }
            };
            let factoryCalled = false;
            const markdownDomNode = mainWindow.document.createElement('div');
            markdownDomNode.className = 'deferred-edit';
            markdownDomNode.textContent = 'deferred.ts';
            const mockDisposable = { dispose: () => { } };
            // Append markdown item while collapsed - factory should not be called
            part.appendMarkdownItem(() => {
                factoryCalled = true;
                return { domNode: markdownDomNode, disposable: mockDisposable };
            }, 'codeblock-deferred', markdownContent, undefined);
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
            const markdownContent = {
                kind: 'markdownContent',
                content: { value: 'Same codeblock' }
            };
            const sharedCodeblockId = 'codeblock-same-id';
            // Append first item
            const firstNode = mainWindow.document.createElement('div');
            firstNode.className = 'first-item';
            firstNode.textContent = 'first item content';
            part.appendMarkdownItem(() => ({ domNode: firstNode, disposable: { dispose: () => { } } }), sharedCodeblockId, markdownContent, undefined);
            // Append second item with same codeblock ID
            const secondNode = mainWindow.document.createElement('div');
            secondNode.className = 'second-item';
            secondNode.textContent = 'second item content';
            part.appendMarkdownItem(() => ({ domNode: secondNode, disposable: { dispose: () => { } } }), sharedCodeblockId, markdownContent, undefined);
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
            part.appendMarkdownItem(() => ({ domNode: firstNode, disposable: { dispose: () => { } } }), 'codeblock-1', { kind: 'markdownContent', content: { value: 'First' } }, undefined);
            // Append second item with different ID
            const secondNode = mainWindow.document.createElement('div');
            secondNode.className = 'item-two';
            secondNode.textContent = 'second item content';
            part.appendMarkdownItem(() => ({ domNode: secondNode, disposable: { dispose: () => { } } }), 'codeblock-2', { kind: 'markdownContent', content: { value: 'Second' } }, undefined);
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
            const stateObservable = observableValue('state', createState(2 /* IChatToolInvocation.StateKind.Executing */));
            const childTool = {
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
            stateObservable.set(createState(1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */), undefined);
            // Should auto-expand when tool needs confirmation
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should auto-expand when tool needs confirmation');
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
            const stateObservable = observableValue('state', createState(1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */));
            const childTool = {
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
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded when waiting for confirmation');
            // Now simulate confirmation being addressed (tool moves to executing)
            stateObservable.set(createState(2 /* IChatToolInvocation.StateKind.Executing */), undefined);
            // Should auto-collapse after confirmation is addressed
            assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should auto-collapse after confirmation is addressed');
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
            const stateObservable = observableValue('state', createState(1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */));
            const childTool = {
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
            stateObservable.set(createState(2 /* IChatToolInvocation.StateKind.Executing */), undefined);
            // Since user manually expanded, it should stay expanded
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should stay expanded when user manually expanded');
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
            const stateObservable = observableValue('state', createState(1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */));
            const childTool = {
                ...createMockToolInvocation({
                    toolId: 'runInTerminal',
                    subAgentInvocationId: toolInvocation.subAgentInvocationId
                }),
                state: stateObservable,
                invocationMessage: 'Run npm install'
            };
            part.trackToolState(childTool);
            // Should auto-expand
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should auto-expand for confirmation');
            // User manually collapses
            const button = getCollapseButton(part);
            button?.click();
            assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user click');
            // User manually expands again
            button?.click();
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should expand after second user click');
            // Confirm the tool (move to executing)
            stateObservable.set(createState(2 /* IChatToolInvocation.StateKind.Executing */), undefined);
            // Since user manually re-expanded after auto-expand, should stay expanded
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should stay expanded when user manually re-expanded after auto-expand');
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
            const stateObservable1 = observableValue('state1', createState(1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */));
            const childTool1 = {
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
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should auto-expand for first confirmation');
            // User manually collapses
            const button = getCollapseButton(part);
            button?.click();
            assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user click');
            // User manually expands (this sets userManuallyExpanded = true)
            button?.click();
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should expand after user re-expands');
            // Complete first tool (should not auto-collapse since user manually expanded)
            stateObservable1.set(createState(4 /* IChatToolInvocation.StateKind.Completed */), undefined);
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should stay expanded after first tool completes (user manually expanded)');
            // User manually collapses again (this resets userManuallyExpanded)
            button?.click();
            assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user manually collapses');
            // Second confirmation cycle - should auto-collapse now since userManuallyExpanded was reset
            const stateObservable2 = observableValue('state2', createState(1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */));
            const childTool2 = {
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
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should auto-expand for second confirmation');
            // Complete second tool - should auto-collapse since userManuallyExpanded was reset by the earlier collapse
            stateObservable2.set(createState(2 /* IChatToolInvocation.StateKind.Executing */), undefined);
            assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should auto-collapse after second confirmation is addressed (userManuallyExpanded was reset)');
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
            const stateObservable = observableValue('state', createState(2 /* IChatToolInvocation.StateKind.Executing */));
            const childTool = {
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
            stateObservable.set(createState(4 /* IChatToolInvocation.StateKind.Completed */), undefined);
            // Title should still include the tool message (persists like thinking part)
            buttonText = labelElement?.textContent ?? button?.textContent ?? '';
            assert.ok(buttonText.includes('Reading config.ts'), 'Title should still include tool message after completion');
        });
    });
    suite('Model name tooltip', () => {
        test('should set up hover with model name from serialized toolSpecificData', () => {
            const setupDelayedHoverCalls = [];
            mockHoverService.setupDelayedHover = (element, options) => {
                setupDelayedHoverCalls.push({ element, content: typeof options.content === 'string' ? options.content : '' });
                return { dispose: () => { } };
            };
            const serializedInvocation = createMockSerializedToolInvocation({
                toolSpecificData: {
                    kind: 'subagent',
                    description: 'Completed task',
                    agentName: 'TestAgent',
                    prompt: 'Do the thing',
                    result: 'Done',
                    modelName: 'GPT-4o'
                }
            });
            const context = createMockRenderContext(true);
            createPart(serializedInvocation, context);
            // Should have set up a hover with the model name
            const modelHover = setupDelayedHoverCalls.find(c => c.content.includes('GPT-4o'));
            assert.ok(modelHover, 'Should set up hover with model name');
        });
        test('should not set up hover when no model name is available', () => {
            const setupDelayedHoverCalls = [];
            mockHoverService.setupDelayedHover = (element, options) => {
                setupDelayedHoverCalls.push({ element, content: typeof options.content === 'string' ? options.content : '' });
                return { dispose: () => { } };
            };
            const serializedInvocation = createMockSerializedToolInvocation({
                toolSpecificData: {
                    kind: 'subagent',
                    description: 'Completed task',
                    agentName: 'TestAgent',
                    prompt: 'Do the thing',
                    result: 'Done',
                    // no modelName
                }
            });
            const context = createMockRenderContext(true);
            createPart(serializedInvocation, context);
            // Should not have set up any hover with model info
            const modelHover = setupDelayedHoverCalls.find(c => c.content.includes('Model:'));
            assert.strictEqual(modelHover, undefined, 'Should not set up model hover when no model name');
        });
        test('should set up hover when tool completes and toolSpecificData has modelName', () => {
            const setupDelayedHoverCalls = [];
            mockHoverService.setupDelayedHover = (element, options) => {
                setupDelayedHoverCalls.push({ element, content: typeof options.content === 'string' ? options.content : '' });
                return { dispose: () => { } };
            };
            const toolSpecificData = {
                kind: 'subagent',
                description: 'Working on task',
                agentName: 'TestAgent',
                prompt: 'Do stuff',
            };
            const toolInvocation = createMockToolInvocation({
                toolSpecificData,
                stateType: 2 /* IChatToolInvocation.StateKind.Executing */,
            });
            const context = createMockRenderContext(false);
            createPart(toolInvocation, context);
            // No model hover initially (no modelName yet)
            const initialHover = setupDelayedHoverCalls.find(c => c.content.includes('Model:'));
            assert.strictEqual(initialHover, undefined, 'Should not have model hover initially');
            // Simulate invoke() setting modelName on toolSpecificData
            toolSpecificData.modelName = 'Claude Sonnet 4';
            // Simulate tool completion
            const state = toolInvocation.state;
            state.set(createState(4 /* IChatToolInvocation.StateKind.Completed */), undefined);
            // Should now have a hover with the model name
            const modelHover = setupDelayedHoverCalls.find(c => c.content.includes('Claude Sonnet 4'));
            assert.ok(modelHover, 'Should set up hover with model name after completion');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN1YmFnZW50Q29udGVudFBhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFJakgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sMEVBQTBFLENBQUM7QUFLdEgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRzVHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFM0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FB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