/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatThinkingContentPart } from '../../../../browser/widget/chatContentParts/chatThinkingContentPart.js';
import { IChatMarkdownContent, IChatThinkingPart } from '../../../../common/chatService/chatService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatRendererContent, IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { ThinkingDisplayMode } from '../../../../common/constants.js';
import { CodeBlockModelCollection } from '../../../../common/widget/codeBlockModelCollection.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { ILanguageModelsService } from '../../../../common/languageModels.js';
import { URI } from '../../../../../../../base/common/uri.js';

suite('ChatThinkingContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockConfigurationService: TestConfigurationService;
	let mockMarkdownRenderer: IMarkdownRenderer;
	let mockAnchorService: IChatMarkdownAnchorService;
	let mockHoverService: IHoverService;
	let mockLanguageModelsService: ILanguageModelsService;

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
			editorPool: {} as EditorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: {} as DiffEditorPool,
			codeBlockModelCollection: {} as CodeBlockModelCollection,
			currentWidth: observableValue('currentWidth', 500),
			onDidChangeVisibility: Event.None
		};
	}

	function createThinkingPart(value?: string, id?: string): IChatThinkingPart {
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
			render: (_markdown: IMarkdownString, options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown => {
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
		} as unknown as IHoverService;
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
		} as unknown as ILanguageModelsService;
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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true, 'Should be collapsed by default');
		});

		test('should have chat-thinking-box class', () => {
			const content = createThinkingPart('**Processing**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			assert.ok(part.domNode.classList.contains('chat-thinking-box'), 'Should have chat-thinking-box class');
		});

		test('should extract title from bold markdown', () => {
			const content = createThinkingPart('**Reading configuration files**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			const button = part.domNode.querySelector('.chat-used-context-label .monaco-button');
			assert.ok(button, 'Should have collapse button');
			// The title should contain the extracted text
			const labelElement = button.querySelector('.icon-label');
			assert.ok(labelElement?.textContent?.includes('Reading configuration files') || button.textContent?.includes('Reading configuration files'),
				'Title should contain extracted text');
		});

		test('lazy rendering - should not render content until expanded', () => {
			const content = createThinkingPart('**Initial thinking content**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// In collapsed mode, content wrapper should not be initialized
			const contentList = part.domNode.querySelector('.chat-used-context-list');
			assert.strictEqual(contentList, null, 'Content should not be rendered when collapsed');
		});

		test('lazy rendering - should render content when expanded', () => {
			const content = createThinkingPart('**Thinking content to render**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// Click the button to expand
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
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
			const content = createThinkingPart('**Analyzing**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// In CollapsedPreview mode, should be expanded while streaming
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should be expanded during streaming in CollapsedPreview mode');
		});

		test('should be collapsed when complete', () => {
			const content = createThinkingPart('**Completed task**');
			const context = createMockRenderContext(true); // isComplete = true

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				true // streamingCompleted
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// When complete, should be collapsed
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true,
				'Should be collapsed when complete');
		});

		test('should be collapsed when streamingCompleted is true even if element.isComplete is false (look-ahead completion)', () => {
			// This tests the scenario where we know the thinking part is complete
			// based on look-ahead (subsequent non-pinnable parts exist), but the
			// overall response is still in progress
			const content = createThinkingPart('**Finished analyzing**');
			const context = createMockRenderContext(false); // element.isComplete = false

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				true // streamingCompleted = true (look-ahead detected this thinking is done)
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// Even though element.isComplete is false, this thinking part should be
			// collapsed because streamingCompleted is true (determined by look-ahead)
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true,
				'Should be collapsed when streamingCompleted is true, even if element.isComplete is false');
		});

		test('should use lazy rendering when streamingCompleted is true even if element.isComplete is false', () => {
			// Verify lazy rendering is triggered when streamingCompleted=true and element.isComplete=false
			const content = createThinkingPart('**Looking ahead completed**');
			const context = createMockRenderContext(false); // element.isComplete = false

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				true // streamingCompleted = true
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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			assert.ok(part.domNode.classList.contains('chat-thinking-fixed-mode'),
				'Should have fixed mode class');
		});

		test('should init content early (eager rendering)', () => {
			const content = createThinkingPart('**Fixed scrolling content**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// First expand to render content
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// Expand first
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

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
			const content = createThinkingPart('**Working**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// Expand first
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

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
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
			button?.click();

			// Factory should now be called
			assert.strictEqual(factoryCalled, true, 'Factory should be called after expanding');
		});

		test('removeLazyItem should remove pending lazy items', () => {
			const content = createThinkingPart('**Working**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			const appendOrder: string[] = [];

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
			const markdownItem: IChatMarkdownContent = {
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
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
			button?.click();

			// All items should now be rendered
			assert.strictEqual(appendOrder.length, 3, 'All 3 items should be rendered after expanding');

			// Verify the render order matches append order
			assert.deepStrictEqual(appendOrder, ['tool1', 'markdown', 'tool2'],
				'Items should render in the same order they were appended (tool1, markdown, tool2)');

			// Also verify the DOM order
			const wrapper = part.domNode.querySelector('.chat-used-context-list');
			const toolWrappers = wrapper?.querySelectorAll('.chat-thinking-tool-wrapper');
			assert.ok(toolWrappers, 'Should have tool wrappers');
			assert.strictEqual(toolWrappers?.length, 3, 'Should have 3 tool wrappers');

			const domOrder = Array.from(toolWrappers!).map(el => {
				const testItem = el.querySelector('.test-item');
				return testItem?.getAttribute('data-order');
			});

			assert.deepStrictEqual(domOrder, ['tool1', 'markdown', 'tool2'],
				'DOM order should match append order (tool1, markdown, tool2)');
		});

		test('setupThinkingContainer should preserve order with lazy tool items', () => {
			// This test reproduces the bug where markdown parts added via setupThinkingContainer
			// render before tool parts because setupThinkingContainer doesn't use lazy rendering.
			// Expected behavior: tool1, thinking2, tool2 in DOM order
			// Bug behavior: thinking2 renders before tool1 because its not lazy
			const initialContent = createThinkingPart('**Initial thinking**', 'thinking-1');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				initialContent,
				context,
				mockMarkdownRenderer,
				false
			));

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
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
			button?.click();

			// Everything should render now
			assert.strictEqual(tool1Rendered, true, 'Tool 1 should render after expand');
			assert.strictEqual(tool2Rendered, true, 'Tool 2 should render after expand');

			// Get all rendered items and check their order
			const wrapper = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapper, 'Should have wrapper');

			// The children should be in order: initial-thinking, tool1-wrapper, thinking2, tool2-wrapper
			// Get all direct children to check order
			const children = Array.from(wrapper!.children);

			// Find indices of our items
			const tool1Index = children.findIndex(el =>
				el.classList.contains('chat-thinking-tool-wrapper') &&
				el.querySelector('[data-test-id="tool1"]')
			);
			const tool2Index = children.findIndex(el =>
				el.classList.contains('chat-thinking-tool-wrapper') &&
				el.querySelector('[data-test-id="tool2"]')
			);

			// Find thinking containers (they have class chat-thinking-item)
			const thinkingItems = children.filter(el => el.classList.contains('chat-thinking-item'));

			// We should have 2 thinking items (initial and the one from setupThinkingContainer)
			// and 2 tool wrappers
			assert.ok(thinkingItems.length >= 1, 'Should have at least one thinking item');
			assert.ok(tool1Index >= 0, 'Should find tool1');
			assert.ok(tool2Index >= 0, 'Should find tool2');

			// The key assertion: tool1 should come before tool2 in DOM order
			// and any thinking content between them should also be in order
			assert.ok(tool1Index < tool2Index,
				`Tool1 (index ${tool1Index}) should come before Tool2 (index ${tool2Index}) in DOM order`);
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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				initialContent,
				context,
				mockMarkdownRenderer,
				false
			));

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
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
			button?.click();

			// Get the wrapper and check DOM order
			const wrapper = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapper, 'Should have wrapper after expanding');

			const children = Array.from(wrapper!.children);

			// Find indices
			const tool1Index = children.findIndex(el =>
				el.querySelector('[data-test-id="tool1"]')
			);
			const tool2Index = children.findIndex(el =>
				el.querySelector('[data-test-id="tool2"]')
			);
			const markdownIndex = children.findIndex(el =>
				el.classList.contains('chat-thinking-item') && el.classList.contains('markdown-content')
			);

			assert.ok(tool1Index >= 0, `Should find tool1 in DOM (found at index ${tool1Index})`);
			assert.ok(tool2Index >= 0, `Should find tool2 in DOM (found at index ${tool2Index})`);
			assert.ok(markdownIndex >= 0, `Should find markdown in DOM (found at index ${markdownIndex})`);

			// The key assertion: order should match arrival order (tool1, markdown, tool2)
			// BUG: Currently markdown is always first because it's not lazy
			assert.ok(tool1Index < markdownIndex,
				`BUG: Tool1 (index ${tool1Index}) should come BEFORE markdown (index ${markdownIndex}) ` +
				`because tool1 was appended first. Current DOM order indicates markdown is eagerly ` +
				`placed first regardless of arrival order.`);
			assert.ok(markdownIndex < tool2Index,
				`Markdown (index ${markdownIndex}) should come before Tool2 (index ${tool2Index})`);
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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				initialContent,
				context,
				mockMarkdownRenderer,
				false
			));

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
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
			button?.click();

			// Get the rendered content
			const wrapper = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapper, 'Should have wrapper after expanding');

			// Get ALL thinking items - the bug creates duplicate containers
			const thinkingItems = wrapper!.querySelectorAll('.chat-thinking-item.markdown-content');

			// BUG: There should only be ONE thinking item, but the bug causes TWO:
			// 1. One from initContent with correct current content
			// 2. One from materializeLazyItem with stale content
			assert.strictEqual(thinkingItems.length, 1,
				`BUG: Should have exactly 1 thinking item, but got ${thinkingItems.length}. ` +
				`materializeLazyItem creates a duplicate container from the lazy item. ` +
				`Items: ${Array.from(thinkingItems).map(i => `"${i.textContent}"`).join(', ')}`);

			// Also verify the single item has the latest content
			if (thinkingItems.length === 1) {
				const renderedText = thinkingItems[0].textContent || '';
				assert.ok(
					renderedText.includes('Found the issue in the parser module'),
					`Content should show latest streaming update. Got: "${renderedText}"`
				);
			}
		});

		test('lazy thinking items should work without streaming updates after setupThinkingContainer', () => {
			// Edge case: setupThinkingContainer is called but no subsequent updateThinking arrives
			// In this case, the lazy item's content should be used when materializing
			const initialContent = createThinkingPart('', 'thinking-1');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				initialContent,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// Only call setupThinkingContainer, no subsequent updateThinking
			const thinkingContent = createThinkingPart('**Analyzing files**', 'thinking-2');
			part.setupThinkingContainer(thinkingContent);

			// Expand to trigger lazy rendering
			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
			button?.click();

			// Get the rendered content
			const wrapper = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapper, 'Should have wrapper after expanding');

			const thinkingItems = wrapper!.querySelectorAll('.chat-thinking-item.markdown-content');
			assert.strictEqual(thinkingItems.length, 1, 'Should have exactly 1 thinking item');

			// The content should be the one from setupThinkingContainer
			const renderedText = thinkingItems[0].textContent || '';
			assert.ok(
				renderedText.includes('Analyzing files'),
				`Content should show setupThinkingContainer content. Got: "${renderedText}"`
			);
		});
	});

	suite('State management', () => {
		setup(() => {
			mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
		});

		test('markAsInactive should update isActive state', () => {
			const content = createThinkingPart('**Active thinking**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			assert.strictEqual(part.getIsActive(), true, 'Should start as active');

			part.markAsInactive();

			assert.strictEqual(part.getIsActive(), false, 'Should be inactive after markAsInactive');
		});

		test('collapseContent should collapse the part', () => {
			const content = createThinkingPart('**Content**');
			const context = createMockRenderContext(false);

			// Use CollapsedPreview to start expanded
			mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.CollapsedPreview);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// Should be expanded initially
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false);

			part.collapseContent();

			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), true,
				'Should be collapsed after collapseContent');
		});

		test('finalizeTitleIfDefault should update button icon to check', () => {
			const content = createThinkingPart('**Working**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

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

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			const toolInvocation = {
				kind: 'toolInvocation' as const,
				toolId: 'test-tool',
				invocationMessage: 'Testing',
				resultDetails: [],
				isConfirmed: undefined,
				pastTenseMessage: undefined,
				isComplete: true,
				isCanceled: false
			} as unknown as IChatRendererContent;

			const result = part.hasSameContent(toolInvocation, [], context.element);
			assert.strictEqual(result, true, 'Should accept tool invocations as same content');
		});

		test('should return true for markdown content', () => {
			const content = createThinkingPart('**Working**', 'id-1');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			const markdownContent = {
				kind: 'markdownContent' as const,
				content: { value: 'test' }
			} as unknown as IChatRendererContent;

			const result = part.hasSameContent(markdownContent, [], context.element);
			assert.strictEqual(result, true, 'Should accept markdown content as same content');
		});

		test('should return false for different thinking part with same id', () => {
			const content = createThinkingPart('**Working**', 'id-1');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			const otherThinking: IChatRendererContent = createThinkingPart('**Different**', 'id-1');

			// When the id is the same, hasSameContent returns true (other.id !== this.id is false)
			const result = part.hasSameContent(otherThinking, [], context.element);
			assert.strictEqual(result, false, 'Should return false for thinking part with same id');
		});

		test('should return true for thinking part with different id', () => {
			const content = createThinkingPart('**Working**', 'id-1');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			const otherThinking: IChatRendererContent = createThinkingPart('**Different**', 'id-2');

			const result = part.hasSameContent(otherThinking, [], context.element);
			assert.strictEqual(result, true, 'Should return true for thinking part with different id');
		});
	});

	suite('DOM structure', () => {
		setup(() => {
			mockConfigurationService.setUserConfiguration('chat.agent.thinkingStyle', ThinkingDisplayMode.Collapsed);
		});

		test('should have proper aria-expanded attribute', () => {
			const content = createThinkingPart('**Content**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			const button = part.domNode.querySelector('.monaco-button') as HTMLElement;
			assert.ok(button, 'Button should exist');
			assert.strictEqual(button.getAttribute('aria-expanded'), 'false', 'Should have aria-expanded="false" when collapsed');

			// Expand
			button.click();

			assert.strictEqual(button.getAttribute('aria-expanded'), 'true', 'Should have aria-expanded="true" when expanded');
		});

		test('should show loading spinner while streaming', () => {
			const content = createThinkingPart('**Streaming content**');
			const context = createMockRenderContext(false);

			const part = store.add(instantiationService.createInstance(
				ChatThinkingContentPart,
				content,
				context,
				mockMarkdownRenderer,
				false // not streaming completed
			));

			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));

			// Should have loading spinner icon
			const loadingIcon = part.domNode.querySelector('.codicon-loading');
			assert.ok(loadingIcon, 'Should have loading spinner while streaming');
		});
	});
});
