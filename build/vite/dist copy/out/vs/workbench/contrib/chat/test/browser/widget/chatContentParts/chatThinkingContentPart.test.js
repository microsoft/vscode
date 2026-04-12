/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { $ } from '../../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatThinkingContentPart } from '../../../../browser/widget/chatContentParts/chatThinkingContentPart.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ThinkingDisplayMode } from '../../../../common/constants.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { ILanguageModelsService } from '../../../../common/languageModels.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { URI } from '../../../../../../../base/common/uri.js';
suite('ChatThinkingContentPart', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let disposables;
    let instantiationService;
    let mockConfigurationService;
    let mockMarkdownRenderer;
    let mockAnchorService;
    let mockHoverService;
    let mockLanguageModelsService;
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
            editorPool: {},
            codeBlockStartIndex: 0,
            treeStartIndex: 0,
            diffEditorPool: {},
            currentWidth: observableValue('currentWidth', 500),
            onDidChangeVisibility: Event.None
        };
    }
    function createThinkingPart(value, id) {
        return {
            kind: 'thinking',
            value: value ?? '',
            id: id ?? 'test-thinking-id'
        };
    }
    setup(() => {
        disposables = store.add(new DisposableStore());
        instantiationService = workbenchInstantiationService(undefined, store);
        mockConfigurationService = new TestConfigurationService();
        instantiationService.stub(IConfigurationService, mockConfigurationService);
        // Create a mock markdown renderer
        mockMarkdownRenderer = {
            render: (_markdown, options, outElement) => {
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
            register: () => toDisposable(() => { }),
            lastFocusedAnchor: undefined
        };
        instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);
        // Mock hover service
        mockHoverService = {
            _serviceBrand: undefined,
            showHover: () => undefined,
            showDelayedHover: () => undefined,
            showAndFocusLastHover: () => { },
            hideHover: () => { },
            setupDelayedHover: () => toDisposable(() => { }),
            setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
            showManagedHover: () => undefined,
            isHovered: () => false,
        };
        instantiationService.stub(IHoverService, mockHoverService);
        // Mock language models service
        mockLanguageModelsService = {
            _serviceBrand: undefined,
            onDidChangeLanguageModels: Event.None,
            getLanguageModelIds: () => [],
            lookupLanguageModel: () => undefined,
            selectLanguageModels: async () => [],
            registerLanguageModelChat: () => toDisposable(() => { }),
            sendChatRequest: async () => ({ stream: (async function* () { })(), result: Promise.resolve({}) }),
            computeTokenLength: async () => 0
        };
        instantiationService.stub(ILanguageModelsService, mockLanguageModelsService);
    });
    teardown(() => {
        disposables.dispose();
    });
    suite('ThinkingDisplayMode.Collapsed', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
        });
        test('should start collapsed', () => {
            const content = createThinkingPart('**Analyzing code**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true, 'Should be collapsed by default');
        });
        test('should have chat-thinking-box class', () => {
            const content = createThinkingPart('**Processing**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            assert.ok(part.domNode.classList.contains('chat-thinking-box'), 'Should have chat-thinking-box class');
        });
        test('should extract title from bold markdown', () => {
            const content = createThinkingPart('**Reading configuration files**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const button = part.domNode.querySelector('.chat-used-context-label .monaco-button');
            assert.ok(button, 'Should have collapse button');
            // The title should contain the extracted text
            const labelElement = button.querySelector('.icon-label');
            assert.ok(labelElement?.textContent?.includes('Reading configuration files') || button.textContent?.includes('Reading configuration files'), 'Title should contain extracted text');
        });
        test('lazy rendering - should not render content until expanded', () => {
            const content = createThinkingPart('**Initial thinking content**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // In collapsed mode, content wrapper should not be initialized
            const contentList = part.domNode.querySelector('.chat-used-context-list');
            assert.strictEqual(contentList, null, 'Content should not be rendered when collapsed');
        });
        test('lazy rendering - should render content when expanded', () => {
            const content = createThinkingPart('**Thinking content to render**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Click the button to expand
            const button = part.domNode.querySelector('.monaco-button');
            assert.ok(button, 'Should have expand button');
            button.click();
            // Now content should be rendered
            const contentList = part.domNode.querySelector('.chat-used-context-list');
            assert.ok(contentList, 'Content should be rendered after expanding');
        });
    });
    suite('ThinkingDisplayMode.CollapsedPreview', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.CollapsedPreview);
        });
        test('should start expanded when streaming (not complete)', () => {
            const content = createThinkingPart('**Analyzing**\nSome detailed reasoning about the code structure');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // In CollapsedPreview mode, should be expanded while streaming
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded during streaming in CollapsedPreview mode');
        });
        test('should be collapsed when complete', () => {
            const content = createThinkingPart('**Completed task**');
            const context = createMockRenderContext(true); // isComplete = true
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true // streamingCompleted
            ));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // When complete, should be collapsed
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true, 'Should be collapsed when complete');
        });
        test('should be collapsed when streamingCompleted is true even if element.isComplete is false (look-ahead completion)', () => {
            // This tests the scenario where we know the thinking part is complete
            // based on look-ahead (subsequent non-pinnable parts exist), but the
            // overall response is still in progress
            const content = createThinkingPart('**Finished analyzing**');
            const context = createMockRenderContext(false); // element.isComplete = false
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true // streamingCompleted = true (look-ahead detected this thinking is done)
            ));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Even though element.isComplete is false, this thinking part should be
            // collapsed because streamingCompleted is true (determined by look-ahead)
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true, 'Should be collapsed when streamingCompleted is true, even if element.isComplete is false');
        });
        test('should use lazy rendering when streamingCompleted is true even if element.isComplete is false', () => {
            // Verify lazy rendering is triggered when streamingCompleted=true and element.isComplete=false
            const content = createThinkingPart('**Looking ahead completed**');
            const context = createMockRenderContext(false); // element.isComplete = false
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true // streamingCompleted = true
            ));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Content should not be rendered because it's collapsed (lazy rendering)
            const contentList = part.domNode.querySelector('.chat-used-context-list');
            assert.strictEqual(contentList, null, 'Content should not be rendered when streamingCompleted=true (collapsed = lazy)');
        });
    });
    suite('ThinkingDisplayMode.FixedScrolling', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.FixedScrolling);
        });
        test('should have fixed mode class', () => {
            const content = createThinkingPart('**Scrolling content**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            assert.ok(part.domNode.classList.contains('chat-thinking-fixed-mode'), 'Should have fixed mode class');
        });
        test('should init content early (eager rendering)', () => {
            const content = createThinkingPart('**Fixed scrolling content**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Fixed mode should initialize content immediately (eager rendering)
            // The scrollable element should be present
            const scrollableContent = part.domNode.querySelector('.monaco-scrollable-element');
            assert.ok(scrollableContent, 'Should have scrollable element in fixed mode (eager rendering)');
        });
        test('should create scrollable container', () => {
            const content = createThinkingPart('**Content with scrolling**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const scrollable = part.domNode.querySelector('.monaco-scrollable-element');
            assert.ok(scrollable, 'Should have scrollable container');
        });
    });
    suite('Thinking content updates', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
        });
        test('updateThinking should update content', () => {
            const content = createThinkingPart('**Initial**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // First expand to render content
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // Update the thinking content
            const updatedContent = createThinkingPart('**Updated thinking**', content.id);
            part.updateThinking(updatedContent);
            // Verify the content was updated
            const thinkingItem = part.domNode.querySelector('.chat-thinking-item');
            assert.ok(thinkingItem, 'Should have thinking item');
        });
        test('should track multiple title extractions', () => {
            const content = createThinkingPart('**First title**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Expand first
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // Update with new title
            part.updateThinking(createThinkingPart('**Second title**', content.id));
            part.updateThinking(createThinkingPart('**Third title**', content.id));
            // The part should track these titles for finalization
            assert.ok(part.domNode, 'Part should still be valid');
        });
    });
    suite('Tool invocation appending', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
        });
        test('appendItem should use lazy rendering when collapsed', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            let factoryCalled = false;
            const factory = () => {
                factoryCalled = true;
                return {
                    domNode: $('div.test-tool-item'),
                    disposable: undefined
                };
            };
            // Append item while collapsed
            part.appendItem(factory, 'test-tool-id');
            // Factory should NOT be called yet due to lazy rendering
            assert.strictEqual(factoryCalled, false, 'Factory should not be called when collapsed (lazy rendering)');
        });
        test('appendItem should render immediately when expanded', () => {
            const content = createThinkingPart('**Working**\nSome detailed analysis of the problem');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Expand first
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            let factoryCalled = false;
            const factory = () => {
                factoryCalled = true;
                const div = $('div.test-tool-item');
                div.textContent = 'Test tool content';
                return { domNode: div };
            };
            // Append item while expanded
            part.appendItem(factory, 'test-tool-id');
            // Factory should be called immediately when expanded
            assert.strictEqual(factoryCalled, true, 'Factory should be called immediately when expanded');
        });
        test('lazy items should materialize when first expanded', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            let factoryCalled = false;
            const factory = () => {
                factoryCalled = true;
                const div = $('div.test-tool-item');
                div.textContent = 'Lazy content';
                return { domNode: div };
            };
            // Append item while collapsed
            part.appendItem(factory, 'test-tool-id');
            assert.strictEqual(factoryCalled, false, 'Factory should not be called yet');
            // Now expand
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // Factory should now be called
            assert.strictEqual(factoryCalled, true, 'Factory should be called after expanding');
        });
        test('removeLazyItem should remove pending lazy items', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            let factoryCalled = false;
            const factory = () => {
                factoryCalled = true;
                return { domNode: $('div.test-tool-item') };
            };
            // Append and then remove
            part.appendItem(factory, 'test-tool-to-remove');
            const removed = part.removeLazyItem('test-tool-to-remove');
            assert.strictEqual(removed, true, 'Should successfully remove the lazy item');
            assert.strictEqual(factoryCalled, false, 'Factory should never have been called');
        });
        test('lazy items should preserve append order when mixing tool and markdown items', () => {
            // This test verifies that when tool invocations and markdown items are appended
            // in a specific order while collapsed, the DOM order matches the append order
            // when expanded. This catches the bug where markdown items render before
            // tool items because markdown isn't lazy.
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const appendOrder = [];
            // Append in order: tool1, markdown, tool2
            // Tool 1
            part.appendItem(() => {
                appendOrder.push('tool1');
                const div = $('div.test-item');
                div.setAttribute('data-order', 'tool1');
                div.textContent = 'Tool 1';
                return { domNode: div };
            }, 'tool-1');
            // Markdown content (simulated - no toolInvocationId means it's markdown-like)
            const markdownItem = {
                kind: 'markdownContent',
                content: { value: 'test markdown' }
            };
            part.appendItem(() => {
                appendOrder.push('markdown');
                const div = $('div.test-item');
                div.setAttribute('data-order', 'markdown');
                div.textContent = 'Markdown content';
                return { domNode: div };
            }, undefined, markdownItem);
            // Tool 2
            part.appendItem(() => {
                appendOrder.push('tool2');
                const div = $('div.test-item');
                div.setAttribute('data-order', 'tool2');
                div.textContent = 'Tool 2';
                return { domNode: div };
            }, 'tool-2');
            // Nothing should have rendered yet
            assert.strictEqual(appendOrder.length, 0, 'No items should be rendered while collapsed');
            // Now expand to trigger lazy rendering
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // All items should now be rendered
            assert.strictEqual(appendOrder.length, 3, 'All 3 items should be rendered after expanding');
            // Verify the render order matches append order
            assert.deepStrictEqual(appendOrder, ['tool1', 'markdown', 'tool2'], 'Items should render in the same order they were appended (tool1, markdown, tool2)');
            // Also verify the DOM order
            const wrapper = part.domNode.querySelector('.chat-used-context-list');
            const toolWrappers = wrapper?.querySelectorAll('.chat-thinking-tool-wrapper');
            assert.ok(toolWrappers, 'Should have tool wrappers');
            assert.strictEqual(toolWrappers?.length, 3, 'Should have 3 tool wrappers');
            const domOrder = Array.from(toolWrappers).map(el => {
                const testItem = el.querySelector('.test-item');
                return testItem?.getAttribute('data-order');
            });
            assert.deepStrictEqual(domOrder, ['tool1', 'markdown', 'tool2'], 'DOM order should match append order (tool1, markdown, tool2)');
        });
        test('setupThinkingContainer should preserve order with lazy tool items', () => {
            // This test reproduces the bug where markdown parts added via setupThinkingContainer
            // render before tool parts because setupThinkingContainer doesn't use lazy rendering.
            // Expected behavior: tool1, thinking2, tool2 in DOM order
            // Bug behavior: thinking2 renders before tool1 because its not lazy
            const initialContent = createThinkingPart('**Initial thinking**', 'thinking-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, initialContent, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Append tool1 while collapsed (lazy)
            let tool1Rendered = false;
            part.appendItem(() => {
                tool1Rendered = true;
                const div = $('div.test-item');
                div.setAttribute('data-test-id', 'tool1');
                div.textContent = 'Tool 1';
                return { domNode: div };
            }, 'tool-1');
            // Now setupThinkingContainer is called for a new thinking section
            // This simulates what happens when a new thinking part arrives during streaming
            const newThinkingContent = createThinkingPart('**Second thinking section**', 'thinking-2');
            part.setupThinkingContainer(newThinkingContent);
            // Append tool2 while collapsed (lazy)
            let tool2Rendered = false;
            part.appendItem(() => {
                tool2Rendered = true;
                const div = $('div.test-item');
                div.setAttribute('data-test-id', 'tool2');
                div.textContent = 'Tool 2';
                return { domNode: div };
            }, 'tool-2');
            // Tools should not have rendered yet
            assert.strictEqual(tool1Rendered, false, 'Tool 1 should not render while collapsed');
            assert.strictEqual(tool2Rendered, false, 'Tool 2 should not render while collapsed');
            // Now expand
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // Everything should render now
            assert.strictEqual(tool1Rendered, true, 'Tool 1 should render after expand');
            assert.strictEqual(tool2Rendered, true, 'Tool 2 should render after expand');
            // Get all rendered items and check their order
            const wrapper = part.domNode.querySelector('.chat-used-context-list');
            assert.ok(wrapper, 'Should have wrapper');
            // The children should be in order: initial-thinking, tool1-wrapper, thinking2, tool2-wrapper
            // Get all direct children to check order
            const children = Array.from(wrapper.children);
            // Find indices of our items
            const tool1Index = children.findIndex(el => el.classList.contains('chat-thinking-tool-wrapper') &&
                el.querySelector('[data-test-id="tool1"]'));
            const tool2Index = children.findIndex(el => el.classList.contains('chat-thinking-tool-wrapper') &&
                el.querySelector('[data-test-id="tool2"]'));
            // Find thinking containers (they have class chat-thinking-item)
            const thinkingItems = children.filter(el => el.classList.contains('chat-thinking-item'));
            // We should have 2 thinking items (initial and the one from setupThinkingContainer)
            // and 2 tool wrappers
            assert.ok(thinkingItems.length >= 1, 'Should have at least one thinking item');
            assert.ok(tool1Index >= 0, 'Should find tool1');
            assert.ok(tool2Index >= 0, 'Should find tool2');
            // The key assertion: tool1 should come before tool2 in DOM order
            // and any thinking content between them should also be in order
            assert.ok(tool1Index < tool2Index, `Tool1 (index ${tool1Index}) should come before Tool2 (index ${tool2Index}) in DOM order`);
        });
        test('markdown via updateThinking should preserve order with lazy tool items (BUG: markdown renders before tools)', () => {
            // This test exposes the lazy rendering bug where markdown content from updateThinking/
            // setupThinkingContainer gets rendered immediately and placed in DOM before tool items.
            //
            // The bug flow:
            // 1. Tool1 arrives → appendItem() → stored in lazyItems (not rendered yet)
            // 2. Thinking/markdown arrives → setupThinkingContainer() → textContainer created,
            //    updateThinking() → renderMarkdown() renders IMMEDIATELY into textContainer
            // 3. Tool2 arrives → appendItem() → stored in lazyItems (not rendered yet)
            // 4. User expands → initContent() creates wrapper, adds textContainer FIRST,
            //    then materializes lazyItems (tools)
            //
            // Result: DOM order is [markdown, tool1, tool2] instead of [tool1, markdown, tool2]
            const initialContent = createThinkingPart('', 'thinking-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, initialContent, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Step 1: Tool1 arrives while collapsed - should be lazy
            part.appendItem(() => {
                const div = $('div.test-item');
                div.setAttribute('data-test-id', 'tool1');
                div.setAttribute('data-order', '1');
                div.textContent = 'Tool 1';
                return { domNode: div };
            }, 'tool-1');
            // Step 2: New thinking section arrives - this uses setupThinkingContainer + updateThinking
            // In the bug, this creates textContainer and renders markdown immediately
            const thinkingContent = createThinkingPart('**Analyzing the codebase**', 'thinking-2');
            part.setupThinkingContainer(thinkingContent);
            // Step 3: Tool2 arrives while collapsed - should be lazy
            part.appendItem(() => {
                const div = $('div.test-item');
                div.setAttribute('data-test-id', 'tool2');
                div.setAttribute('data-order', '3');
                div.textContent = 'Tool 2';
                return { domNode: div };
            }, 'tool-2');
            // Now expand to trigger lazy rendering
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // Get the wrapper and check DOM order
            const wrapper = part.domNode.querySelector('.chat-used-context-list');
            assert.ok(wrapper, 'Should have wrapper after expanding');
            const children = Array.from(wrapper.children);
            // Find indices
            const tool1Index = children.findIndex(el => el.querySelector('[data-test-id="tool1"]'));
            const tool2Index = children.findIndex(el => el.querySelector('[data-test-id="tool2"]'));
            const markdownIndex = children.findIndex(el => el.classList.contains('chat-thinking-item') && el.classList.contains('markdown-content'));
            assert.ok(tool1Index >= 0, `Should find tool1 in DOM (found at index ${tool1Index})`);
            assert.ok(tool2Index >= 0, `Should find tool2 in DOM (found at index ${tool2Index})`);
            assert.ok(markdownIndex >= 0, `Should find markdown in DOM (found at index ${markdownIndex})`);
            // The key assertion: order should match arrival order (tool1, markdown, tool2)
            // BUG: Currently markdown is always first because it's not lazy
            assert.ok(tool1Index < markdownIndex, `BUG: Tool1 (index ${tool1Index}) should come BEFORE markdown (index ${markdownIndex}) ` +
                `because tool1 was appended first. Current DOM order indicates markdown is eagerly ` +
                `placed first regardless of arrival order.`);
            assert.ok(markdownIndex < tool2Index, `Markdown (index ${markdownIndex}) should come before Tool2 (index ${tool2Index})`);
        });
        test('lazy thinking items should show updated content after streaming updates', () => {
            // This test exposes the bug where streaming updates to thinking content are lost
            // when the thinking part is collapsed.
            //
            // Bug flow:
            // 1. setupThinkingContainer(content1) creates lazy item with content1
            // 2. updateThinking(content2) is called with updated streaming content
            //    - this.content is updated to content2
            //    - this.currentThinkingValue is updated
            //    - but the lazy item still stores content1
            // 3. User expands:
            //    - initContent creates a NEW textContainer with currentThinkingValue (latest)
            //    - materializeLazyItem appends ANOTHER container from lazy item with stale content
            //
            // Result: Duplicate thinking containers, one with correct content, one with stale
            const initialContent = createThinkingPart('', 'thinking-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, initialContent, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Step 1: New thinking section arrives while collapsed
            const thinkingContent1 = createThinkingPart('**Starting analysis**', 'thinking-2');
            part.setupThinkingContainer(thinkingContent1);
            // Step 2: Streaming continues - more content arrives via updateThinking
            const thinkingContent2 = createThinkingPart('**Starting analysis** Looking at the code structure...', 'thinking-2');
            part.updateThinking(thinkingContent2);
            // Step 3: Even more streaming content
            const thinkingContent3 = createThinkingPart('**Starting analysis** Looking at the code structure... Found the issue in the parser module.', 'thinking-2');
            part.updateThinking(thinkingContent3);
            // Now expand to trigger lazy rendering
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // Get the rendered content
            const wrapper = part.domNode.querySelector('.chat-used-context-list');
            assert.ok(wrapper, 'Should have wrapper after expanding');
            // Get ALL thinking items - the bug creates duplicate containers
            const thinkingItems = wrapper.querySelectorAll('.chat-thinking-item.markdown-content');
            // BUG: There should only be ONE thinking item, but the bug causes TWO:
            // 1. One from initContent with correct current content
            // 2. One from materializeLazyItem with stale content
            assert.strictEqual(thinkingItems.length, 1, `BUG: Should have exactly 1 thinking item, but got ${thinkingItems.length}. ` +
                `materializeLazyItem creates a duplicate container from the lazy item. ` +
                `Items: ${Array.from(thinkingItems).map(i => `"${i.textContent}"`).join(', ')}`);
            // Also verify the single item has the latest content
            if (thinkingItems.length === 1) {
                const renderedText = thinkingItems[0].textContent || '';
                assert.ok(renderedText.includes('Found the issue in the parser module'), `Content should show latest streaming update. Got: "${renderedText}"`);
            }
        });
        test('lazy thinking items should work without streaming updates after setupThinkingContainer', () => {
            // Edge case: setupThinkingContainer is called but no subsequent updateThinking arrives
            // In this case, the lazy item's content should be used when materializing
            const initialContent = createThinkingPart('', 'thinking-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, initialContent, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Only call setupThinkingContainer, no subsequent updateThinking
            const thinkingContent = createThinkingPart('**Analyzing files**', 'thinking-2');
            part.setupThinkingContainer(thinkingContent);
            // Expand to trigger lazy rendering
            const button = part.domNode.querySelector('.monaco-button');
            button?.click();
            // Get the rendered content
            const wrapper = part.domNode.querySelector('.chat-used-context-list');
            assert.ok(wrapper, 'Should have wrapper after expanding');
            const thinkingItems = wrapper.querySelectorAll('.chat-thinking-item.markdown-content');
            assert.strictEqual(thinkingItems.length, 1, 'Should have exactly 1 thinking item');
            // The content should be the one from setupThinkingContainer
            const renderedText = thinkingItems[0].textContent || '';
            assert.ok(renderedText.includes('Analyzing files'), `Content should show setupThinkingContainer content. Got: "${renderedText}"`);
        });
    });
    suite('State management', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
        });
        test('markAsInactive should update isActive state', () => {
            const content = createThinkingPart('**Active thinking**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            assert.strictEqual(part.getIsActive(), true, 'Should start as active');
            part.markAsInactive();
            assert.strictEqual(part.getIsActive(), false, 'Should be inactive after markAsInactive');
        });
        test('dispose should set isActive to false', () => {
            const content = createThinkingPart('**Active thinking**');
            const context = createMockRenderContext(false);
            const part = instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false);
            assert.strictEqual(part.getIsActive(), true, 'Should start as active');
            part.dispose();
            assert.strictEqual(part.getIsActive(), false, 'Should be inactive after dispose');
        });
        test('collapseContent should collapse the part', () => {
            const content = createThinkingPart('**Content**\nSome detailed reasoning that differs from the title');
            const context = createMockRenderContext(false);
            // Use CollapsedPreview to start expanded
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.CollapsedPreview);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Should be expanded initially
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false);
            part.collapseContent();
            assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true, 'Should be collapsed after collapseContent');
        });
        test('finalizeTitleIfDefault should update button icon to check', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            part.finalizeTitleIfDefault();
            // The button should now show a check icon
            const iconElement = part.domNode.querySelector('.codicon-check');
            assert.ok(iconElement, 'Should have check icon after finalization');
        });
    });
    suite('hasSameContent', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
        });
        test('should return true for tool invocations', () => {
            const content = createThinkingPart('**Working**', 'id-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            const toolInvocation = {
                kind: 'toolInvocation',
                toolId: 'test-tool',
                invocationMessage: 'Testing',
                resultDetails: [],
                isConfirmed: undefined,
                pastTenseMessage: undefined,
                isComplete: true,
                isCanceled: false
            };
            const result = part.hasSameContent(toolInvocation, [], context.element);
            assert.strictEqual(result, true, 'Should accept tool invocations as same content');
        });
        test('should return true for markdown content', () => {
            const content = createThinkingPart('**Working**', 'id-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            const markdownContent = {
                kind: 'markdownContent',
                content: { value: 'test' }
            };
            const result = part.hasSameContent(markdownContent, [], context.element);
            assert.strictEqual(result, true, 'Should accept markdown content as same content');
        });
        test('should return false for different thinking part with same id', () => {
            const content = createThinkingPart('**Working**', 'id-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            const otherThinking = createThinkingPart('**Different**', 'id-1');
            // When the id is the same, hasSameContent returns true (other.id !== this.id is false)
            const result = part.hasSameContent(otherThinking, [], context.element);
            assert.strictEqual(result, false, 'Should return false for thinking part with same id');
        });
        test('should return true for thinking part with different id', () => {
            const content = createThinkingPart('**Working**', 'id-1');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            const otherThinking = createThinkingPart('**Different**', 'id-2');
            const result = part.hasSameContent(otherThinking, [], context.element);
            assert.strictEqual(result, true, 'Should return true for thinking part with different id');
        });
    });
    suite('DOM structure', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
        });
        test('should have proper aria-expanded attribute', () => {
            const content = createThinkingPart('**Content**\nSome detailed reasoning that differs from the title');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const button = part.domNode.querySelector('.monaco-button');
            assert.ok(button, 'Button should exist');
            assert.strictEqual(button.getAttribute('aria-expanded'), 'false', 'Should have aria-expanded="false" when collapsed');
            // Expand
            button.click();
            assert.strictEqual(button.getAttribute('aria-expanded'), 'true', 'Should have aria-expanded="true" when expanded');
        });
        test('should show loading spinner while streaming', () => {
            const content = createThinkingPart('**Streaming content**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false // not streaming completed
            ));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Should have circle-filled icon (not loading spinner) while streaming
            const circleIcon = part.domNode.querySelector('.codicon-circle-filled');
            assert.ok(circleIcon, 'Should have circle-filled icon while streaming');
        });
        function createMockStreamingToolInvocation(toolId, invocationMessage, toolCallId) {
            return {
                kind: 'toolInvocation',
                toolId,
                toolCallId,
                invocationMessage,
                originMessage: undefined,
                pastTenseMessage: undefined,
                presentation: undefined,
                source: ToolDataSource.Internal,
                isAttachedToThinking: false,
                generatedTitle: undefined,
                state: observableValue('state', {
                    type: 0 /* IChatToolInvocation.StateKind.Streaming */,
                    partialInput: observableValue('partialInput', undefined),
                    streamingMessage: observableValue('streamingMessage', undefined),
                }),
                toJSON: () => ({}),
            };
        }
        function createMockExecutingToolInvocation(toolId, invocationMessage, toolCallId) {
            return {
                kind: 'toolInvocation',
                toolId,
                toolCallId,
                invocationMessage,
                originMessage: undefined,
                pastTenseMessage: undefined,
                presentation: undefined,
                source: ToolDataSource.Internal,
                isAttachedToThinking: false,
                generatedTitle: undefined,
                state: observableValue('state', {
                    type: 2 /* IChatToolInvocation.StateKind.Executing */,
                    confirmed: { type: 0 },
                    progress: observableValue('progress', { progress: 0 }),
                    parameters: {},
                    confirmationMessages: undefined,
                }),
                toJSON: () => ({}),
            };
        }
        function createMockSerializedImageToolInvocation(toolId, invocationMessage, toolCallId) {
            return {
                kind: 'toolInvocationSerialized',
                toolId,
                toolCallId,
                invocationMessage,
                originMessage: undefined,
                pastTenseMessage: undefined,
                presentation: undefined,
                resultDetails: {
                    output: {
                        type: 'data',
                        mimeType: 'image/png',
                        base64Data: 'AQID'
                    }
                },
                isConfirmed: { type: 0 },
                isComplete: true,
                source: ToolDataSource.Internal,
                generatedTitle: undefined,
                isAttachedToThinking: false,
            };
        }
        test('should show "Editing files" for streaming edit tools instead of generic display name', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const streamingReplaceTool = createMockStreamingToolInvocation('copilot_replaceString', 'Replace String in File', 'call-1');
            part.appendItem(() => {
                const div = $('div.test-item');
                div.textContent = 'Replace tool';
                return { domNode: div };
            }, streamingReplaceTool.toolId, streamingReplaceTool);
            // The title should show "Editing files" instead of "Replace String in File"
            const button = part.domNode.querySelector('.chat-used-context-label .monaco-button');
            assert.ok(button, 'Should have collapse button');
            const labelText = button.querySelector('.icon-label')?.textContent ?? button.textContent ?? '';
            assert.ok(labelText.includes('Editing files'), `Title should contain "Editing files" but got "${labelText}"`);
        });
        test('should show original message for non-edit streaming tools', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const streamingReadTool = createMockStreamingToolInvocation('copilot_readFile', 'Reading file.ts', 'call-2');
            part.appendItem(() => {
                const div = $('div.test-item');
                div.textContent = 'Read tool';
                return { domNode: div };
            }, streamingReadTool.toolId, streamingReadTool);
            const button = part.domNode.querySelector('.chat-used-context-label .monaco-button');
            assert.ok(button, 'Should have collapse button');
            const labelText = button.querySelector('.icon-label')?.textContent ?? button.textContent ?? '';
            assert.ok(labelText.includes('Reading file.ts'), `Title should contain "Reading file.ts" but got "${labelText}"`);
        });
        test('should show original message for non-streaming edit tools', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            // Non-streaming (executing) edit tool should show its invocation message
            const executingReplaceTool = createMockExecutingToolInvocation('copilot_replaceString', 'Replacing 5 lines in file.ts', 'call-3');
            part.appendItem(() => {
                const div = $('div.test-item');
                div.textContent = 'Replace tool';
                return { domNode: div };
            }, executingReplaceTool.toolId, executingReplaceTool);
            const button = part.domNode.querySelector('.chat-used-context-label .monaco-button');
            assert.ok(button, 'Should have collapse button');
            const labelText = button.querySelector('.icon-label')?.textContent ?? button.textContent ?? '';
            assert.ok(labelText.includes('Replacing 5 lines in file.ts'), `Title should contain "Replacing 5 lines in file.ts" but got "${labelText}"`);
        });
        test('should keep original message for create_file tool even when streaming', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const streamingCreateTool = createMockStreamingToolInvocation('copilot_createFile', 'Creating newFile.ts', 'call-4');
            part.appendItem(() => {
                const div = $('div.test-item');
                div.textContent = 'Create tool';
                return { domNode: div };
            }, streamingCreateTool.toolId, streamingCreateTool);
            const button = part.domNode.querySelector('.chat-used-context-label .monaco-button');
            assert.ok(button, 'Should have collapse button');
            const labelText = button.querySelector('.icon-label')?.textContent ?? button.textContent ?? '';
            assert.ok(labelText.includes('Creating newFile.ts'), `Title should contain "Creating newFile.ts" but got "${labelText}"`);
        });
        test('should show external resources for serialized image tools when initially collapsed and hide them when expanded', () => {
            const content = createThinkingPart('**Working**');
            const context = createMockRenderContext(false);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, false));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const serializedImageTool = createMockSerializedImageToolInvocation('chat_screenshot', 'Captured screenshot', 'image-call-1');
            part.appendItem(() => {
                const div = $('div.test-item');
                div.textContent = 'Image tool';
                return { domNode: div };
            }, serializedImageTool.toolId, serializedImageTool);
            const externalResources = part.domNode.querySelector('.chat-thinking-external-resources');
            assert.ok(externalResources, 'Should render external resources container');
            assert.notStrictEqual(externalResources.style.display, 'none', 'Should show external resources while initially collapsed');
            const button = part.domNode.querySelector('.monaco-button');
            assert.ok(button, 'Should have expand button');
            button.click();
            assert.strictEqual(externalResources.style.display, 'none', 'Should hide external resources when expanded');
            button.click();
            assert.notStrictEqual(externalResources.style.display, 'none', 'Should show external resources again after collapsing');
        });
    });
    suite('Diff aggregation in thinking header', () => {
        setup(() => {
            mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
        });
        test('should show diff stats in finalized title when onDidChangeDiff fires', () => {
            const content = createThinkingPart('**Editing files**');
            const context = createMockRenderContext(true);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const diffEmitter = store.add(new Emitter());
            part.appendItem(() => ({ domNode: $('div.test-edit-pill') }), 'edit-part-1', undefined, undefined, diffEmitter.event);
            part.finalizeTitleIfDefault();
            // Fire diff event
            diffEmitter.fire({ added: 10, removed: 3 });
            const addedEl = part.domNode.querySelector('.label-added');
            const removedEl = part.domNode.querySelector('.label-removed');
            assert.ok(addedEl, 'Should render +N element');
            assert.ok(removedEl, 'Should render -N element');
            assert.strictEqual(addedEl?.textContent, '+10');
            assert.strictEqual(removedEl?.textContent, '-3');
        });
        test('should aggregate diffs from multiple edit parts', () => {
            const content = createThinkingPart('**Editing files**');
            const context = createMockRenderContext(true);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const diffEmitter1 = store.add(new Emitter());
            const diffEmitter2 = store.add(new Emitter());
            part.appendItem(() => ({ domNode: $('div.test-edit-pill-1') }), 'edit-part-1', undefined, undefined, diffEmitter1.event);
            part.appendItem(() => ({ domNode: $('div.test-edit-pill-2') }), 'edit-part-2', undefined, undefined, diffEmitter2.event);
            part.finalizeTitleIfDefault();
            diffEmitter1.fire({ added: 5, removed: 2 });
            diffEmitter2.fire({ added: 8, removed: 1 });
            const addedEl = part.domNode.querySelector('.label-added');
            const removedEl = part.domNode.querySelector('.label-removed');
            assert.strictEqual(addedEl?.textContent, '+13');
            assert.strictEqual(removedEl?.textContent, '-3');
        });
        test('should not show diff stats when diff parts exist but have no changes', () => {
            const content = createThinkingPart('**Editing files**');
            const context = createMockRenderContext(true);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const diffEmitter = store.add(new Emitter());
            part.appendItem(() => ({ domNode: $('div.test-edit-pill') }), 'edit-part-1', undefined, undefined, diffEmitter.event);
            part.finalizeTitleIfDefault();
            diffEmitter.fire({ added: 0, removed: 0 });
            const addedEl = part.domNode.querySelector('.label-added');
            const removedEl = part.domNode.querySelector('.label-removed');
            assert.strictEqual(addedEl, null);
            assert.strictEqual(removedEl, null);
        });
        test('should include diff stats in aria-label', () => {
            const content = createThinkingPart('**Editing files**');
            const context = createMockRenderContext(true);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            const diffEmitter = store.add(new Emitter());
            part.appendItem(() => ({ domNode: $('div.test-edit-pill') }), 'edit-part-1', undefined, undefined, diffEmitter.event);
            part.finalizeTitleIfDefault();
            diffEmitter.fire({ added: 7, removed: 2 });
            const button = part.domNode.querySelector('.monaco-button');
            assert.ok(button?.ariaLabel?.includes('7'), 'aria-label should include added count');
            assert.ok(button?.ariaLabel?.includes('2'), 'aria-label should include removed count');
        });
        test('should not show diff stats when no diff events fired', () => {
            const content = createThinkingPart('**Analyzing code**');
            const context = createMockRenderContext(true);
            const part = store.add(instantiationService.createInstance(ChatThinkingContentPart, content, context, mockMarkdownRenderer, true));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode.remove()));
            part.finalizeTitleIfDefault();
            const diffContainer = part.domNode.querySelector('.chat-thinking-title-diff');
            assert.strictEqual(diffContainer, null, 'Should not render diff container when no diffs exist');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRoaW5raW5nQ29udGVudFBhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUtqSCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUl0SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLHNCQUFz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