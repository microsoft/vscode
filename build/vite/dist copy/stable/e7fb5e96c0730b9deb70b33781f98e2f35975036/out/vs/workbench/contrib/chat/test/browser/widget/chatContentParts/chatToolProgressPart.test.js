/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ChatToolProgressSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolProgressPart.js';
import { isMcpToolInvocation } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolPartUtilities.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
suite('ChatToolProgressSubPart', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let disposables;
    let instantiationService;
    let mockMarkdownRenderer;
    let mockAnchorService;
    let mockHoverService;
    let mockConfigurationService;
    let mockEditorPool;
    function createRenderContext(isComplete = false) {
        const mockElement = {
            isComplete,
            id: 'test-response-id',
            sessionResource: URI.parse('chat-session://test/session1'),
            setVote: () => { },
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
    function createSerializedToolInvocation(options = {}) {
        return {
            presentation: undefined,
            toolSpecificData: undefined,
            originMessage: undefined,
            invocationMessage: options.invocationMessage ?? 'Running tool...',
            pastTenseMessage: undefined,
            resultDetails: undefined,
            isConfirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
            isComplete: options.isComplete ?? false,
            toolCallId: 'tool-call-id',
            toolId: options.toolId ?? 'test_tool',
            source: options.source,
            kind: 'toolInvocationSerialized'
        };
    }
    function createToolInvocation(options = {}) {
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
                type: 2 /* IChatToolInvocation.StateKind.Executing */,
                parameters: undefined,
                confirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */ },
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
            render: (markdown, _options, outElement) => {
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
        };
        instantiationService.stub(IHoverService, mockHoverService);
        mockEditorPool = {};
    });
    teardown(() => {
        disposables.dispose();
    });
    test('detects MCP tool invocations for live and serialized rows', () => {
        const mcpSource = {
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
        const part = disposables.add(instantiationService.createInstance(ChatToolProgressSubPart, mcpTool, createRenderContext(false), mockMarkdownRenderer, new Set()));
        assert.ok(part.domNode.querySelector('.shimmer-progress'));
    });
    test('does not add shimmer styling for non-MCP tool progress', () => {
        const tool = createSerializedToolInvocation({
            source: ToolDataSource.Internal,
            toolId: 'fetch_webpage'
        });
        const part = disposables.add(instantiationService.createInstance(ChatToolProgressSubPart, tool, createRenderContext(false), mockMarkdownRenderer, new Set()));
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
        const part = disposables.add(instantiationService.createInstance(ChatToolProgressSubPart, mcpTool, createRenderContext(false), mockMarkdownRenderer, new Set()));
        assert.strictEqual(part.domNode.querySelector('.shimmer-progress'), null);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xQcm9ncmVzc1BhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUb29sUHJvZ3Jlc3NQYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBR2pGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHFGQUFxRixDQUFDO0FBQy9ILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBRXRILE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlGQUF5RixDQUFDO0FBQ2xJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBGQUEwRixDQUFDO0FBSS9ILE9BQU8sRUFBRSxjQUFjLEVBQTZDLE1BQU0sdURBQXVELENBQUM7QUFF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