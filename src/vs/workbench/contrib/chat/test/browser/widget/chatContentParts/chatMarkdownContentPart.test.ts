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
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IMarkdownRenderer, IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatMarkdownContentPart } from '../../../../browser/widget/chatContentParts/chatMarkdownContentPart.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { CodeBlockPart, ICodeBlockData } from '../../../../browser/widget/chatContentParts/codeBlockPart.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
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

	function createMarkdownPart(markdownText: string, context?: IChatContentPartRenderContext): ChatMarkdownContentPart {
		const ctx = context ?? createRenderContext();
		return store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString(markdownText) },
			ctx,
			editorPool,
			false, // fillInIncompleteTokens
			ctx.codeBlockStartIndex,
			renderer,
			undefined, // markdownRenderOptions
			500, // currentWidth
			{}, // rendererOptions
		));
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, disposables);
		renderedCodeBlocks.length = 0;

		// Seed configuration values needed by ChatEditorOptions
		const configService = instantiationService.get(IConfigurationService) as import('../../../../../../../platform/configuration/test/common/testConfigurationService.js').TestConfigurationService;
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
});
