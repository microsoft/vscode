/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption, IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { ISuggestMemoryService } from '../../../../editor/contrib/suggest/browser/suggestMemory.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IMenuChangeEvent, IMenuService } from '../../../../platform/actions/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { CompletionModel, LineContext } from '../../../../editor/contrib/suggest/browser/completionModel.js';
import { CompletionItem } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { WordDistance } from '../../../../editor/contrib/suggest/browser/wordDistance.js';
import { FuzzyScoreOptions } from '../../../../base/common/filters.js';

// CSS imports for the suggest widget
import '../../../../editor/contrib/suggest/browser/media/suggest.css';
import '../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';
import '../../../../base/browser/ui/codicons/codiconStyles.js';

interface SuggestFixtureOptions extends ComponentFixtureContext {
	code: string;
	cursorLine: number;
	cursorColumn: number;
	completions: CompletionList;
	width?: string;
	height?: string;
	editorOptions?: IEditorOptions;
}

async function renderSuggestWidget(options: SuggestFixtureOptions): Promise<void> {
	const { container, disposableStore, theme } = options;
	container.style.width = options.width ?? '500px';
	container.style.height = options.height ?? '300px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			reg.defineInstance(ISuggestMemoryService, new class extends mock<ISuggestMemoryService>() {
				override memorize(): void { }
				override select(): number { return 0; }
			});
			reg.defineInstance(IMenuService, new class extends mock<IMenuService>() {
				override createMenu() {
					return { onDidChange: new Emitter<IMenuChangeEvent>().event, getActions: () => [], dispose: () => { } };
				}
			});
		},
	});

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		options.code,
		URI.parse('inmemory://suggest-fixture.ts'),
		'typescript'
	));

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
			suggest: {
				showIcons: true,
				showStatusBar: true,
			},
			...options.editorOptions,
		},
		editorWidgetOptions
	));

	editor.setModel(textModel);
	const position = { lineNumber: options.cursorLine, column: options.cursorColumn };
	editor.setPosition(position);
	editor.focus();

	const controller = SuggestController.get(editor)!;
	const widget = controller.widget.value;

	const completionList = options.completions;
	const provider = { _debugDisplayName: 'suggestFixture', provideCompletionItems: () => completionList };
	const items = completionList.suggestions.map(s => new CompletionItem(position, s, completionList, provider));

	const lineContent = textModel.getLineContent(position.lineNumber);
	const leadingLineContent = lineContent.substring(0, position.column - 1);

	const completionModel = new CompletionModel(
		items,
		position.column,
		new LineContext(leadingLineContent, 0),
		WordDistance.None,
		editor.getOption(EditorOption.suggest),
		'inline',
		FuzzyScoreOptions.default,
		undefined
	);

	widget.showSuggestions(completionModel, 0, false, false, false);
}

const typescriptCompletions: CompletionList = {
	suggestions: [
		{ label: 'addEventListener', kind: CompletionItemKind.Method, insertText: 'addEventListener', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) addEventListener(type: string, listener: EventListener): void' },
		{ label: 'appendChild', kind: CompletionItemKind.Method, insertText: 'appendChild', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) appendChild(node: Node): Node' },
		{ label: 'attributes', kind: CompletionItemKind.Property, insertText: 'attributes', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
		{ label: 'blur', kind: CompletionItemKind.Method, insertText: 'blur', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) blur(): void' },
		{ label: 'childElementCount', kind: CompletionItemKind.Property, insertText: 'childElementCount', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
		{ label: 'children', kind: CompletionItemKind.Property, insertText: 'children', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
		{ label: 'classList', kind: CompletionItemKind.Property, insertText: 'classList', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
		{ label: 'className', kind: CompletionItemKind.Property, insertText: 'className', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 } },
		{ label: 'click', kind: CompletionItemKind.Method, insertText: 'click', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) click(): void' },
		{ label: 'cloneNode', kind: CompletionItemKind.Method, insertText: 'cloneNode', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) cloneNode(deep?: boolean): Node' },
		{ label: 'closest', kind: CompletionItemKind.Method, insertText: 'closest', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) closest(selectors: string): Element | null' },
		{ label: 'contains', kind: CompletionItemKind.Method, insertText: 'contains', range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 10 }, detail: '(method) contains(other: Node | null): boolean' },
	],
};

const mixedKindCompletions: CompletionList = {
	suggestions: [
		{ label: 'MyClass', kind: CompletionItemKind.Class, insertText: 'MyClass', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'class MyClass' },
		{ label: 'myFunction', kind: CompletionItemKind.Function, insertText: 'myFunction', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'function myFunction(): void' },
		{ label: 'myVariable', kind: CompletionItemKind.Variable, insertText: 'myVariable', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'const myVariable: string' },
		{ label: 'IMyInterface', kind: CompletionItemKind.Interface, insertText: 'IMyInterface', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'interface IMyInterface' },
		{ label: 'MyEnum', kind: CompletionItemKind.Enum, insertText: 'MyEnum', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'enum MyEnum' },
		{ label: 'MY_CONSTANT', kind: CompletionItemKind.Constant, insertText: 'MY_CONSTANT', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'const MY_CONSTANT = 42' },
		{ label: 'myKeyword', kind: CompletionItemKind.Keyword, insertText: 'myKeyword', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } },
		{ label: 'mySnippet', kind: CompletionItemKind.Snippet, insertText: 'mySnippet', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, detail: 'snippet' },
	],
};

export default defineThemedFixtureGroup({
	MethodCompletions: defineComponentFixture({
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
		render: (context) => renderSuggestWidget({
			...context,
			code: '',
			cursorLine: 1,
			cursorColumn: 1,
			completions: mixedKindCompletions,
		}),
	}),
});
