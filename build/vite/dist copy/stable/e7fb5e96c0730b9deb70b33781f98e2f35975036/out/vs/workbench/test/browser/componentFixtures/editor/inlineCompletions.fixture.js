/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Import to register the inline completions contribution
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createEditorServices, defineThemedFixtureGroup, defineComponentFixture, createTextModel } from '../fixtureUtils.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { InlineCompletionsController } from '../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import '../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js';
import { InlineCompletionsSource, InlineCompletionsState } from '../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js';
import { InlineEditItem } from '../../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js';
import { TextModelValueReference } from '../../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js';
function renderInlineEdit(options) {
    const { container, disposableStore, theme } = options;
    container.style.width = options.width ?? '500px';
    container.style.height = options.height ?? '170px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
    const textModel = disposableStore.add(createTextModel(instantiationService, options.code, URI.parse('inmemory://inline-edit.ts'), 'typescript'));
    // Mock the InlineCompletionsSource to provide our test completion
    instantiationService.stubInstance(InlineCompletionsSource, {
        cancelUpdate: () => { },
        clear: () => { },
        clearOperationOnTextModelChange: constObservable(undefined),
        clearSuggestWidgetInlineCompletions: () => { },
        dispose: () => { },
        fetch: async () => true,
        inlineCompletions: constObservable(new InlineCompletionsState([
            InlineEditItem.createForTest(TextModelValueReference.snapshot(textModel), new Range(options.range.startLineNumber, options.range.startColumn, options.range.endLineNumber, options.range.endColumn), options.newText)
        ], undefined)),
        loading: constObservable(false),
        seedInlineCompletionsWithSuggestWidget: () => { },
        seedWithCompletion: () => { },
        suggestWidgetInlineCompletions: constObservable(InlineCompletionsState.createEmpty()),
    });
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
        ...options.editorOptions,
    }, editorWidgetOptions));
    editor.setModel(textModel);
    editor.setPosition({ lineNumber: options.cursorLine, column: 1 });
    editor.focus();
    // Trigger inline completions
    const controller = InlineCompletionsController.get(editor);
    controller?.model?.get();
}
// ============================================================================
// Fixtures
// ============================================================================
export default defineThemedFixtureGroup({ path: 'editor/' }, {
    // Side-by-side view: Multi-line replacement
    SideBySideView: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderInlineEdit({
            ...context,
            code: `function greet(name) {
	console.log("Hello, " + name);
}`,
            cursorLine: 2,
            range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
            newText: '\tconsole.log(`Hello, ${name}!`);',
        }),
    }),
    // Word replacement view: Single word change
    WordReplacementView: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderInlineEdit({
            ...context,
            code: `class BufferData {
	append(data: number[]) {
		this.data.push(data);
	}
}`,
            cursorLine: 2,
            range: { startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 8 },
            newText: 'push',
            height: '200px',
        }),
    }),
    // Insertion view: Insert new content
    InsertionView: defineComponentFixture({
        labels: { kind: 'screenshot', flaky: true },
        render: (context) => renderInlineEdit({
            ...context,
            code: `class BufferData {
	append(data: number[]) {} // appends data
}`,
            cursorLine: 2,
            range: { startLineNumber: 2, startColumn: 26, endLineNumber: 2, endColumn: 26 },
            newText: `
		console.log(data);
	`,
            height: '200px',
            editorOptions: {
                inlineSuggest: {
                    edits: { allowCodeShifting: 'always' }
                }
            }
        }),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnMuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZWRpdG9yL2lubGluZUNvbXBsZXRpb25zLmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcseURBQXlEO0FBQ3pELE9BQU8sRUFBRSxlQUFlLEVBQXlCLE1BQU0sMENBQTBDLENBQUM7QUFDbEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBMkIsb0JBQW9CLEVBQUUsd0JBQXdCLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDdEosT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0YsT0FBTyxFQUE0QixnQkFBZ0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRWpJLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtR0FBbUcsQ0FBQztBQUNoSixPQUFPLDJGQUEyRixDQUFDO0FBQ25HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDBGQUEwRixDQUFDO0FBQzNKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1RkFBdUYsQ0FBQztBQUN2SCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwRkFBMEYsQ0FBQztBQWlCbkksU0FBUyxnQkFBZ0IsQ0FBQyxPQUEwQjtJQUNuRCxNQUFNLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFDdEQsU0FBUyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFD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