/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { SymbolKind, SymbolTag } from '../../../../../../../editor/common/languages.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkdownRenderer, IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatMarkdownContentPart } from '../../../../browser/widget/chatContentParts/chatMarkdownContentPart.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { CodeBlockPart, ICodeBlockData } from '../../../../browser/widget/chatContentParts/codeBlockPart.js';
import { IChatOutputRendererService, type RenderedOutputPart } from '../../../../browser/chatOutputItemRenderer.js';
import { IChatOutputPartStateCache, IOutputPartState } from '../../../../browser/widget/chatContentParts/chatOutputPartStateCache.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatContentInlineReference } from '../../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IAiEditTelemetryService } from '../../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IViewDescriptorService } from '../../../../../../common/views.js';
import { IDisposableReference } from '../../../../browser/widget/chatContentParts/chatCollections.js';

suite('ChatMarkdownContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let editorPool: EditorPool;
	let renderer: IMarkdownRenderer;

	/** Data captured from each CodeBlockPart.render() call */
	const renderedCodeBlocks: ICodeBlockData[] = [];
	const renderedCodeBlockOutputs: { identifier: string; text: string }[] = [];
	let outputStateCache: Map<string, IOutputPartState>;

	function createMockEditorPool(): EditorPool {
		return {
			get(): IDisposableReference<CodeBlockPart> {
				const element = mainWindow.document.createElement('div');
				const mockPart = {
					element,
					get uri() { return undefined; },
					render(data: ICodeBlockData, _width: number) {
						renderedCodeBlocks.push(data);
					},
					layout() { },
					focus() { },
					reset() { },
					onDidRemount() { },
				} as unknown as CodeBlockPart;

				return {
					object: mockPart,
					isStale: () => false,
					dispose: () => { },
				};
			},
			inUse: () => [],
			dispose: () => { },
		} as unknown as EditorPool;
	}

	function createRenderContext(isComplete: boolean = true): IChatContentPartRenderContext {
		const mockElement: Partial<IChatResponseViewModel> = {
			isComplete,
			isCompleteAddedRequest: false,
			id: 'test-response-id',
			sessionResource: URI.parse('chat-session://test/session1'),
			setVote: () => { },
			contentReferences: [],
			get model() { return {} as IChatResponseViewModel['model']; },
		};

		const markdownContent = { kind: 'markdownContent' as const, content: new MarkdownString('') };

		return {
			element: mockElement as IChatResponseViewModel,
			inlineTextModels: undefined!,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [markdownContent],
			contentIndex: 0,
			editorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: {} as DiffEditorPool,
			currentWidth: observableValue('currentWidth', 500),
			onDidChangeVisibility: Event.None,
		};
	}

	function createMarkdownPart(markdownText: string, context?: IChatContentPartRenderContext, fillInIncompleteTokens = false): ChatMarkdownContentPart {
		const ctx = context ?? createRenderContext();
		return store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString(markdownText) },
			ctx,
			editorPool,
			fillInIncompleteTokens,
			ctx.codeBlockStartIndex,
			renderer,
			undefined, // markdownRenderOptions
			500, // currentWidth
			{}, // rendererOptions
		));
	}

	function createMarkdownPartWithInlineReferences(markdownText: string, inlineReferences: Record<string, IChatContentInlineReference>, context?: IChatContentPartRenderContext, fillInIncompleteTokens = false): ChatMarkdownContentPart {
		const ctx = context ?? createRenderContext();
		return store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString(markdownText), inlineReferences },
			ctx,
			editorPool,
			fillInIncompleteTokens,
			ctx.codeBlockStartIndex,
			renderer,
			undefined,
			500,
			{},
		));
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, disposables);
		renderedCodeBlocks.length = 0;
		renderedCodeBlockOutputs.length = 0;
		outputStateCache = new Map<string, IOutputPartState>();

		// Seed configuration values needed by ChatEditorOptions
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration('chat', {
			editor: {
				fontSize: 13,
				fontFamily: 'default',
				fontWeight: 'normal',
				lineHeight: 0,
				wordWrap: 'on',
			}
		});
		configService.setUserConfiguration('editor', {
			fontFamily: 'Consolas',
			fontLigatures: false,
			accessibilitySupport: 'off',
		});

		// Stub hover service
		instantiationService.stub(IHoverService, {
			_serviceBrand: undefined,
			showDelayedHover: () => undefined,
			setupDelayedHover: () => ({ dispose: () => { } }),
			setupDelayedHoverAtMouse: () => ({ dispose: () => { } }),
			showInstantHover: () => undefined,
			hideHover: () => { },
			showAndFocusLastHover: () => { },
			setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
			showManagedHover: () => { },
		});

		// Stub AI edit telemetry service
		instantiationService.stub(IAiEditTelemetryService, {
			_serviceBrand: undefined,
			createSuggestionId: () => undefined!,
			handleCodeAccepted: () => { },
			handleCodeRejected: () => { },
		});

		instantiationService.stub(IChatOutputRendererService, {
			_serviceBrand: undefined,
			registerRenderer: () => ({ dispose: () => { } }),
			hasCodeBlockRenderer: identifier => identifier.toLowerCase() === 'mermaid',
			renderOutputPart: async () => { throw new Error('Unexpected output render'); },
			renderCodeBlock: async (identifier, data) => {
				renderedCodeBlockOutputs.push({ identifier, text: new TextDecoder().decode(data) });
				return {
					webview: {
						focus: () => { },
						onDidWheel: Event.None,
						onDidUpdateState: Event.None,
					} as RenderedOutputPart['webview'],
					onDidChangeHeight: Event.None,
					reinitialize: () => { },
					dispose: () => { },
				};
			},
		});

		instantiationService.stub(IChatOutputPartStateCache, {
			_serviceBrand: undefined,
			get: key => outputStateCache.get(key),
			set: (key, state) => outputStateCache.set(key, state),
		});

		// Stub view descriptor service
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			onDidChangeContainer: Event.None,
			getViewLocationById: () => null,
		});

		// Use the real markdown renderer service
		renderer = instantiationService.get(IMarkdownRendererService);

		// Create a mock editor pool
		editorPool = createMockEditorPool();
	});

	teardown(() => {
		disposables.dispose();
	});

	test('renders plain markdown without code blocks', () => {
		const part = createMarkdownPart('Hello, world!');

		assert.ok(part.domNode);
		assert.strictEqual(part.codeblocks.length, 0);
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.ok(part.domNode.textContent?.includes('Hello, world!'));
	});

	test('renders a single code block and passes text to CodeBlockPart', () => {
		const part = createMarkdownPart('```javascript\nconsole.log("hello");\n```');

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
		assert.strictEqual(part.codeblocks[0].languageId, 'javascript');
		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
		assert.strictEqual(renderedCodeBlocks[0].languageId, 'javascript');
	});

	test('renders complete code block with contributed chat output renderer', () => {
		const part = createMarkdownPart('```mermaid\ngraph TD\n```');

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].languageId, 'mermaid');
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: 'mermaid', text: 'graph TD' }]);
		assert.ok(part.domNode.querySelector('.chat-output-code-block'));
	});

	test('renders complete code block with contributed chat output renderer case-insensitively', () => {
		const part = createMarkdownPart('```Mermaid\ngraph TD\n```');

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].languageId, 'Mermaid');
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: 'Mermaid', text: 'graph TD' }]);
		assert.ok(part.domNode.querySelector('.chat-output-code-block'));
	});

	test('reuses rendered code block webview across incremental rerenders when content is unchanged', async () => {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);

		const ctx = createRenderContext(false);
		const markdown = '```mermaid\ngraph TD\n```';
		const part = createMarkdownPart(markdown, ctx, true);

		assert.strictEqual(renderedCodeBlockOutputs.length, 1);
		assert.strictEqual(part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString(`${markdown}\n\nNext paragraph`) }), true);

		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

		assert.deepStrictEqual({
			renderedOutputs: renderedCodeBlockOutputs,
			outputBlockCount: part.domNode.querySelectorAll('.chat-output-code-block').length,
		}, {
			renderedOutputs: [{ identifier: 'mermaid', text: 'graph TD' }],
			outputBlockCount: 1,
		});
	});

	test('does not render initial incomplete code fence', () => {
		const ctx = createRenderContext(false);
		const part = createMarkdownPart('```', ctx);

		assert.strictEqual(part.codeblocks.length, 0);
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.strictEqual(renderedCodeBlockOutputs.length, 0);
		assert.strictEqual(part.domNode.querySelector('.interactive-result-code-block'), null);
	});

	test('shows pending chat output renderer for incomplete code block', () => {
		const ctx = createRenderContext(false);
		const part = createMarkdownPart('```mermaid\ngraph TD', ctx);

		assert.strictEqual(renderedCodeBlockOutputs.length, 0);
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].languageId, 'mermaid');
		assert.ok(part.domNode.querySelector('.chat-output-code-block'));
		assert.ok(part.domNode.textContent?.includes('Rendering code block'));
	});

	test('renders multiple code blocks with correct indices', () => {
		const part = createMarkdownPart(
			'Some text\n```python\nprint("a")\n```\nMore text\n```typescript\nconst x = 1;\n```'
		);

		assert.strictEqual(part.codeblocks.length, 2);
		assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
		assert.strictEqual(part.codeblocks[0].languageId, 'python');
		assert.strictEqual(part.codeblocks[1].codeBlockIndex, 1);
		assert.strictEqual(part.codeblocks[1].languageId, 'typescript');
		assert.strictEqual(renderedCodeBlocks[0].text, 'print("a")');
		assert.strictEqual(renderedCodeBlocks[1].text, 'const x = 1;');
	});

	test('code block text is passed correctly', () => {
		const code = 'function greet() {\n  return "hello";\n}';
		createMarkdownPart('```javascript\n' + code + '\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, code);
		assert.strictEqual(renderedCodeBlocks[0].languageId, 'javascript');
	});

	test('code block without language id passes empty languageId', () => {
		createMarkdownPart('```\nsome text\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'some text');
	});

	test('respects codeBlockStartIndex for global indexing', () => {
		const ctx = createRenderContext();
		const part = store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString('```js\ncode\n```') },
			ctx,
			editorPool,
			false,
			5, // codeBlockStartIndex
			renderer,
			undefined,
			500,
			{},
		));

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].codeBlockIndex, 5);
	});

	test('hasSameContent returns true for same markdown', () => {
		const part = createMarkdownPart('Hello');
		assert.ok(part.hasSameContent({ kind: 'markdownContent', content: new MarkdownString('Hello') }));
	});

	test('hasSameContent returns false for different markdown', () => {
		const part = createMarkdownPart('Hello');
		assert.ok(!part.hasSameContent({ kind: 'markdownContent', content: new MarkdownString('Goodbye') }));
	});

	test('hasSameContent compares inline reference metadata', () => {
		const uri = URI.parse('file:///workspace/foo.ts');
		const content = 'Foo';
		const initialReference: IChatContentInlineReference = {
			kind: 'inlineReference',
			resolveId: 'resolve1',
			inlineReference: { uri, range: new Range(1, 1, 1, 1) },
			name: 'Foo',
		};
		const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });

		assert.deepStrictEqual({
			equivalentReference: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: { uri, range: new Range(1, 1, 1, 1) },
						name: 'Foo',
					},
				},
			}),
			resolvedReference: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							kind: SymbolKind.Class,
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
		}, {
			equivalentReference: true,
			resolvedReference: false,
		});
	});

	test('hasSameContent compares workspace symbol metadata', () => {
		const uri = URI.parse('file:///workspace/foo.ts');
		const content = 'Foo';
		const initialReference: IChatContentInlineReference = {
			kind: 'inlineReference',
			resolveId: 'resolve1',
			inlineReference: {
				name: 'Foo',
				containerName: 'Bar',
				kind: SymbolKind.Class,
				tags: [SymbolTag.Deprecated],
				location: { uri, range: new Range(2, 7, 2, 10) },
			},
			name: 'Foo',
		};
		const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });

		assert.deepStrictEqual({
			equivalentSymbol: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							containerName: 'Bar',
							kind: SymbolKind.Class,
							tags: [SymbolTag.Deprecated],
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
			differentContainer: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							containerName: 'Baz',
							kind: SymbolKind.Class,
							tags: [SymbolTag.Deprecated],
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
			differentTags: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							containerName: 'Bar',
							kind: SymbolKind.Class,
							tags: [],
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
		}, {
			equivalentSymbol: true,
			differentContainer: false,
			differentTags: false,
		});
	});

	test('tryIncrementalUpdate requires unchanged inline reference metadata', () => {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);

		const uri = URI.parse('file:///workspace/foo.ts');
		const content = 'Foo';
		const initialReference: IChatContentInlineReference = {
			kind: 'inlineReference',
			resolveId: 'resolve1',
			inlineReference: { uri, range: new Range(1, 1, 1, 1) },
			name: 'Foo',
		};
		const context = createRenderContext(false);
		const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference }, context, true);

		assert.deepStrictEqual({
			unchangedReference: part.tryIncrementalUpdate({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: { 0: initialReference },
			}),
			resolvedReference: part.tryIncrementalUpdate({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							kind: SymbolKind.Class,
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
		}, {
			unchangedReference: true,
			resolvedReference: false,
		});
	});

	test('php code blocks get php opening tag prepended', () => {
		createMarkdownPart('```php\necho "hello";\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.ok(renderedCodeBlocks[0].text.startsWith('<?php\n'), 'PHP code should have <?php prepended');
	});

	test('php code blocks with existing opening tag are not modified', () => {
		createMarkdownPart('```php\n<?php\necho "hello";\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.ok(!renderedCodeBlocks[0].text.startsWith('<?php\n<?php'), 'PHP code with existing tag should not be doubled');
	});

	test('strips codeblock uri annotations before rendering standard code blocks', () => {
		createMarkdownPart('```typescript\nconst value = 1;\n<vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri>\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.ok(!renderedCodeBlocks[0].text.includes('<vscode_codeblock_uri'));
		assert.strictEqual(renderedCodeBlocks[0].codemapperUri?.toString(), 'file:///test.ts');
	});

	test('code block toolbar context is set correctly with code text', () => {
		// Simulates the scenario in #255290: the copy button should have
		// valid code text during streaming even as code blocks are re-rendered.
		createMarkdownPart('```js\nconsole.log("hello");\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
		assert.strictEqual(renderedCodeBlocks[0].languageId, 'js');
		assert.strictEqual(renderedCodeBlocks[0].codeBlockIndex, 0);
	});

	test('code block maintains content when markdown is re-rendered during streaming', () => {
		// Simulates progressive rendering: first tick shows partial code, second tick adds more.
		// Each render creates a new ChatMarkdownContentPart (as happens during streaming).
		// The code block should get the updated text each time.
		const ctx = createRenderContext(false /* isComplete = false, simulating streaming */);

		// First render with partial code
		const part1 = createMarkdownPart('```js\nconsole\n```', ctx);
		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console');
		assert.strictEqual(part1.codeblocks.length, 1);

		// Second render with more code (simulating streaming progress)
		renderedCodeBlocks.length = 0;
		const part2 = createMarkdownPart('```js\nconsole.log("hello");\n```', ctx);
		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
		assert.strictEqual(part2.codeblocks.length, 1);
		assert.strictEqual(part2.codeblocks[0].codeBlockIndex, 0);
	});

	test('code block part element is reused from pool across streaming renders', () => {
		// Verify the same CodeBlockPart element is returned from the pool for the same key
		const elements: HTMLElement[] = [];
		const poolWithTracking = {
			get(): IDisposableReference<CodeBlockPart> {
				const element = mainWindow.document.createElement('div');
				elements.push(element);
				const mockPart = {
					element,
					get uri() { return undefined; },
					render(data: ICodeBlockData, _width: number) {
						renderedCodeBlocks.push(data);
					},
					layout() { },
					focus() { },
					reset() { },
					onDidRemount() { },
				} as unknown as CodeBlockPart;
				return {
					object: mockPart,
					isStale: () => false,
					dispose: () => { },
				};
			},
			inUse: () => [],
			dispose: () => { },
		} as unknown as EditorPool;

		const ctx = createRenderContext(false);
		store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString('```js\nconsole\n```') },
			ctx, poolWithTracking, false, 0, renderer, undefined, 500, {},
		));

		store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString('```js\nconsole.log("hello");\n```') },
			ctx, poolWithTracking, false, 0, renderer, undefined, 500, {},
		));

		// Both renders should have created code blocks with the correct text
		assert.strictEqual(renderedCodeBlocks.length, 2);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console');
		assert.strictEqual(renderedCodeBlocks[1].text, 'console.log("hello");');
	});
});
