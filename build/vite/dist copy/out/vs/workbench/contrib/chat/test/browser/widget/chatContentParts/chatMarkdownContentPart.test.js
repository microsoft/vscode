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
import { IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatMarkdownContentPart } from '../../../../browser/widget/chatContentParts/chatMarkdownContentPart.js';
import { IAiEditTelemetryService } from '../../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IViewDescriptorService } from '../../../../../../common/views.js';
suite('ChatMarkdownContentPart', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let disposables;
    let instantiationService;
    let editorPool;
    let renderer;
    /** Data captured from each CodeBlockPart.render() call */
    const renderedCodeBlocks = [];
    function createMockEditorPool() {
        return {
            get() {
                const element = mainWindow.document.createElement('div');
                const mockPart = {
                    element,
                    get uri() { return undefined; },
                    render(data, _width) {
                        renderedCodeBlocks.push(data);
                    },
                    layout() { },
                    focus() { },
                    reset() { },
                    onDidRemount() { },
                };
                return {
                    object: mockPart,
                    isStale: () => false,
                    dispose: () => { },
                };
            },
            inUse: () => [],
            dispose: () => { },
        };
    }
    function createRenderContext(isComplete = true) {
        const mockElement = {
            isComplete,
            isCompleteAddedRequest: false,
            id: 'test-response-id',
            sessionResource: URI.parse('chat-session://test/session1'),
            setVote: () => { },
            contentReferences: [],
            get model() { return {}; },
        };
        const markdownContent = { kind: 'markdownContent', content: new MarkdownString('') };
        return {
            element: mockElement,
            inlineTextModels: undefined,
            elementIndex: 0,
            container: mainWindow.document.createElement('div'),
            content: [markdownContent],
            contentIndex: 0,
            editorPool,
            codeBlockStartIndex: 0,
            treeStartIndex: 0,
            diffEditorPool: {},
            currentWidth: observableValue('currentWidth', 500),
            onDidChangeVisibility: Event.None,
        };
    }
    function createMarkdownPart(markdownText, context) {
        const ctx = context ?? createRenderContext();
        return store.add(instantiationService.createInstance(ChatMarkdownContentPart, { kind: 'markdownContent', content: new MarkdownString(markdownText) }, ctx, editorPool, false, // fillInIncompleteTokens
        ctx.codeBlockStartIndex, renderer, undefined, // markdownRenderOptions
        500, // currentWidth
        {}));
    }
    setup(() => {
        disposables = store.add(new DisposableStore());
        instantiationService = workbenchInstantiationService(undefined, disposables);
        renderedCodeBlocks.length = 0;
        // Seed configuration values needed by ChatEditorOptions
        const configService = instantiationService.get(IConfigurationService);
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
            createSuggestionId: () => undefined,
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
        const part = createMarkdownPart('Some text\n```python\nprint("a")\n```\nMore text\n```typescript\nconst x = 1;\n```');
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
        const part = store.add(instantiationService.createInstance(ChatMarkdownContentPart, { kind: 'markdownContent', content: new MarkdownString('```js\ncode\n```') }, ctx, editorPool, false, 5, // codeBlockStartIndex
        renderer, undefined, 500, {}));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hcmtkb3duQ29udGVudFBhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQXFCLHdCQUF3QixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDakksT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFeEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFJakgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMEZBQTBGLENBQUM7QUFDbkksT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sbUNBQW1DLENB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