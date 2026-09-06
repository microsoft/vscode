/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// Import to register the inline completions contribution
import { constObservable, IObservableWithChange } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ComponentFixtureContext, createEditorServices, defineThemedFixtureGroup, defineComponentFixture, createTextModel } from '../../fixtureUtils.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorWidgetOptions, CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions } from '../../../../../../editor/common/config/editorOptions.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { InlineCompletionsController } from '../../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import '../../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js';
import { InlineCompletionsSource, InlineCompletionsState } from '../../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js';
import { InlineEditItem } from '../../../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js';
import { TextModelValueReference } from '../../../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js';


// ============================================================================
// Inline Edit Fixture
// ============================================================================

interface InlineEditOptions extends ComponentFixtureContext {
	code: string;
	cursorLine: number;
	range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
	newText: string;
	width?: string;
	height?: string;
	editorOptions?: IEditorOptions;
}

function renderInlineEdit(options: InlineEditOptions): void {
	const { container, disposableStore, theme } = options;
	container.style.width = options.width ?? '500px';
	container.style.height = options.height ?? '170px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		options.code,
		URI.parse('inmemory://inline-edit.ts'),
		'typescript'
	));

	// Mock the InlineCompletionsSource to provide our test completion
	instantiationService.stubInstance(InlineCompletionsSource, {
		cancelUpdate: () => { },
		clear: () => { },
		clearOperationOnTextModelChange: constObservable(undefined) as IObservableWithChange<undefined, void>,
		clearSuggestWidgetInlineCompletions: () => { },
		dispose: () => { },
		fetch: async () => true,
		inlineCompletions: constObservable(disposableStore.add(new InlineCompletionsState([
			InlineEditItem.createForTest(
				TextModelValueReference.snapshot(textModel),
				new Range(
					options.range.startLineNumber,
					options.range.startColumn,
					options.range.endLineNumber,
					options.range.endColumn
				),
				options.newText
			)
		], undefined))),
		loading: constObservable(false),
		seedInlineCompletionsWithSuggestWidget: () => { },
		seedWithCompletion: () => { },
		suggestWidgetInlineCompletions: constObservable(disposableStore.add(InlineCompletionsState.createEmpty())),
	});

	const editorWidgetOptions: ICodeEditorWidgetOptions = {
		contributions: EditorExtensionsRegistry.getEditorContributions()
	};

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			minimap: { enabled: false },
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			fontSize: 14,
			cursorBlinking: 'solid',
			...options.editorOptions,
		},
		editorWidgetOptions
	));

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

export default defineThemedFixtureGroup({ path: 'editor/inlineCompletions/' }, {
	// Side-by-side view: Narrow editor with multi-line replacement
	SideBySideViewSmall: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderInlineEdit({
			...context,
			code: `function calculate(a, b) {
	const sum = a + b;
	return sum;
}`,
			cursorLine: 2,
			range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 100 },
			newText: '\tconst result = a * b + a + b;\n\tconsole.log(result);\n\treturn result;',
		}),
	}),

	// Side-by-side view: Wide editor with multi-line replacement
	SideBySideViewWide: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderInlineEdit({
			...context,
			code: `function calculate(a, b) {
	const sum = a + b;
	return sum;
}`,
			cursorLine: 2,
			range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 100 },
			newText: '\tconst result = a * b + a + b;\n\tconsole.log(result);\n\treturn result;',
			width: '800px',
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

	// Deletion view: Removing code
	DeletionView: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderInlineEdit({
			...context,
			code: `function process(data: string[]) {
	console.log("processing:", data);
	const result = data.map(d => d.trim());
	return result;
}`,
			cursorLine: 2,
			range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
			newText: '',
			height: '200px',
		}),
	}),

	// Line replacement view: Single-line with multiple changes
	LineReplacementView: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderInlineEdit({
			...context,
			code: `function calculate(width: number, height: number): number {
	const area = width * height;
	return area;
}`,
			cursorLine: 2,
			range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
			newText: '\tconst volume = width * height * depth;',
			height: '200px',
		}),
	}),
});
