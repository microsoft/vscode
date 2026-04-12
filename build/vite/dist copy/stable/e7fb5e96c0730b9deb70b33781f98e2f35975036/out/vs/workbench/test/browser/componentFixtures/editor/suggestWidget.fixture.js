/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { ISuggestMemoryService } from '../../../../../editor/contrib/suggest/browser/suggestMemory.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { CompletionModel, LineContext } from '../../../../../editor/contrib/suggest/browser/completionModel.js';
import { CompletionItem } from '../../../../../editor/contrib/suggest/browser/suggest.js';
import { WordDistance } from '../../../../../editor/contrib/suggest/browser/wordDistance.js';
import { FuzzyScoreOptions } from '../../../../../base/common/filters.js';
// CSS imports for the suggest widget
import '../../../../../editor/contrib/suggest/browser/media/suggest.css';
import '../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
function renderSuggestWidget(options) {
    const { container, disposableStore, theme } = options;
    container.style.width = options.width ?? '500px';
    container.style.height = options.height ?? '300px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: theme,
        additionalServices: (reg) => {
            reg.defineInstance(ISuggestMemoryService, new class extends mock() {
                memorize() { }
                select() { return 0; }
            });
            reg.defineInstance(IMenuService, new class extends mock() {
                createMenu() {
                    return { onDidChange: new Emitter().event, getActions: () => [], dispose: () => { } };
                }
            });
        },
    });
    const textModel = disposableStore.add(createTextModel(instantiationService, options.code, URI.parse('inmemory://suggest-fixture.ts'), 'typescript'));
    const editorWidgetOptions = {
        contributions: EditorExtensionsRegistry.getEditorContributions()
    };
    const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 14,
        cursorBlinking: 'solid',
        suggest: {
            showIcons: true,
            showStatusBar: true,
        },
        ...options.editorOptions,
    }, editorWidgetOptions));
    editor.setModel(textModel);
    const position = { lineNumber: options.cursorLine, column: options.cursorColumn };
    editor.setPosition(position);
    editor.focus();
    const controller = SuggestController.get(editor);
    const widget = controller.widget.value;
    const completionList = options.completions;
    const provider = { _debugDisplayName: 'suggestFixture', provideCompletionItems: () => completionList };
    const items = completionList.suggestions.map(s => new CompletionItem(position, s, completionList, provider));
    const lineContent = textModel.getLineContent(position.lineNumber);
    const leadingLineContent = lineContent.substring(0, position.column - 1);
    const completionModel = new CompletionModel(items, position.column, new LineContext(leadingLineContent, 0), WordDistance.None, editor.getOption(134 /* EditorOption.suggest */), 'inline', FuzzyScoreOptions.default, undefined);
    widget.showSuggestions(completionModel, 0, false, false, false);
}
const typescriptCompletions = {
    suggestions: [
        { label: 'addEventListener', kind: 0 /* CompletionItemKind.Method */, insertText: 'addEventListener', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) addEventListener(type: string, listener: EventListener): void' },
        { label: 'appendChild', kind: 0 /* CompletionItemKind.Method */, insertText: 'appendChild', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) appendChild(node: Node): Node' },
        { label: 'attributes', kind: 9 /* CompletionItemKind.Property */, insertText: 'attributes', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
        { label: 'blur', kind: 0 /* CompletionItemKind.Method */, insertText: 'blur', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) blur(): void' },
        { label: 'childElementCount', kind: 9 /* CompletionItemKind.Property */, insertText: 'childElementCount', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
        { label: 'children', kind: 9 /* CompletionItemKind.Property */, insertText: 'children', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
        { label: 'classList', kind: 9 /* CompletionItemKind.Property */, insertText: 'classList', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
        { label: 'className', kind: 9 /* CompletionItemKind.Property */, insertText: 'className', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
        { label: 'click', kind: 0 /* CompletionItemKind.Method */, insertText: 'click', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) click(): void' },
        { label: 'cloneNode', kind: 0 /* CompletionItemKind.Method */, insertText: 'cloneNode', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) cloneNode(deep?: boolean): Node' },
        { label: 'closest', kind: 0 /* CompletionItemKind.Method */, insertText: 'closest', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) closest(selectors: string): Element | null' },
        { label: 'contains', kind: 0 /* CompletionItemKind.Method */, insertText: 'contains', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) contains(other: Node | null): boolean' },
    ],
};
const mixedKindCompletions = {
    suggestions: [
        { label: 'MyClass', kind: 5 /* CompletionItemKind.Class */, insertText: 'MyClass', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'class MyClass' },
        { label: 'myFunction', kind: 1 /* CompletionItemKind.Function */, insertText: 'myFunction', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'function myFunction(): void' },
        { label: 'myVariable', kind: 4 /* CompletionItemKind.Variable */, insertText: 'myVariable', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'const myVariable: string' },
        { label: 'IMyInterface', kind: 7 /* CompletionItemKind.Interface */, insertText: 'IMyInterface', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'interface IMyInterface' },
        { label: 'MyEnum', kind: 15 /* CompletionItemKind.Enum */, insertText: 'MyEnum', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'enum MyEnum' },
        { label: 'MY_CONSTANT', kind: 14 /* CompletionItemKind.Constant */, insertText: 'MY_CONSTANT', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'const MY_CONSTANT = 42' },
        { label: 'myKeyword', kind: 17 /* CompletionItemKind.Keyword */, insertText: 'myKeyword', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } },
        { label: 'mySnippet', kind: 28 /* CompletionItemKind.Snippet */, insertText: 'mySnippet', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'snippet' },
    ],
};
export default defineThemedFixtureGroup({ path: 'editor/' }, {
    MethodCompletions: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderSuggestWidget({
            ...context,
            code: `const element = document.getElementById('app');
if (element) {
	element.
}`,
            cursorLine: 3,
            cursorColumn: 10,
            completions: typescriptCompletions,
        }),
    }),
    MixedKinds: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderSuggestWidget({
            ...context,
            code: '',
            cursorLine: 1,
            cursorColumn: 1,
            completions: mixedKindCompletions,
        }),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdFdpZGdldC5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9lZGl0b3Ivc3VnZ2VzdFdpZGdldC5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQTJCLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3RKLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBNEIsTUFBTSxxRUFBcUUsQ0FBQztBQUdqSSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUN2RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUN2RyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFvQixZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNoSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTFFLHFDQUFxQztBQUNyQyxPQUFPLGlFQUFpRSxDQUFDO0FBQ3pFLE9BQU8sa0VBQWtF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