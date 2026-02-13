/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../src/vs/base/common/observable';
import { URI } from '../../../../src/vs/base/common/uri';
import { Range } from '../../../../src/vs/editor/common/core/range';
import { IEditorOptions } from '../../../../src/vs/editor/common/config/editorOptions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../src/vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { EditorExtensionsRegistry } from '../../../../src/vs/editor/browser/editorExtensions';
import { InlineCompletionsController } from '../../../../src/vs/editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController';
import { InlineCompletionsSource, InlineCompletionsState } from '../../../../src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource';
import { InlineEditItem } from '../../../../src/vs/editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem';
import { TextModelValueReference } from '../../../../src/vs/editor/contrib/inlineCompletions/browser/model/textModelValueReference';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils';

// Import to register the inline completions contribution
import '../../../../src/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution';


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

function renderInlineEdit(options: InlineEditOptions): HTMLElement {
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		clearOperationOnTextModelChange: constObservable(undefined) as any,
		clearSuggestWidgetInlineCompletions: () => { },
		dispose: () => { },
		fetch: async () => true,
		inlineCompletions: constObservable(new InlineCompletionsState([
			InlineEditItem.createForTest(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				TextModelValueReference.snapshot(textModel as any),
				new Range(
					options.range.startLineNumber,
					options.range.startColumn,
					options.range.endLineNumber,
					options.range.endColumn
				),
				options.newText
			)
		], undefined)),
		loading: constObservable(false),
		seedInlineCompletionsWithSuggestWidget: () => { },
		seedWithCompletion: () => { },
		suggestWidgetInlineCompletions: constObservable(InlineCompletionsState.createEmpty()),
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

	return container;
}


// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({
	// Side-by-side view: Multi-line replacement
	SideBySideView: defineComponentFixture({
		render: (context) => renderInlineEdit({
			...context,
			code: `function greet(name) {
    console.log("Hello, " + name);
}`,
			cursorLine: 2,
			range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
			newText: '    console.log(`Hello, ${name}!`);',
		}),
	}),

	// Word replacement view: Single word change
	WordReplacementView: defineComponentFixture({
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
