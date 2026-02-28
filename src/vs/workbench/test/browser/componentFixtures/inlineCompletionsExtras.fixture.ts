/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IObservableWithChange } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import '../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js';
import { InlineCompletionsSource, InlineCompletionsState } from '../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js';
import { InlineEditItem } from '../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js';
import { TextModelValueReference } from '../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js';
import { JumpToView } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/jumpToView.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';

import '../../../../editor/contrib/inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget.css';
import '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/view.css';
import '../../../../base/browser/ui/codicons/codiconStyles.js';

const SAMPLE_CODE = `function fibonacci(n: number): number {
	if (n <= 1) return n;
	return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(result);
`;

const LONG_DISTANCE_CODE = `import { readFile, writeFile } from 'fs';
import { join } from 'path';

interface Config {
	inputDir: string;
	outputDir: string;
	verbose: boolean;
}

function loadConfig(): Config {
	return {
		inputDir: './input',
		outputDir: './output',
		verbose: false,
	};
}

function processLine(line: string): string {
	return line.trim().toUpperCase();
}

function validateInput(data: string): boolean {
	return data.length > 0 && data.length < 10000;
}

async function processFile(config: Config, filename: string): Promise<void> {
	const inputPath = join(config.inputDir, filename);
	const data = await readFile(inputPath, 'utf8');
	if (!validateInput(data)) {
		throw new Error('Invalid input');
	}
	const lines = data.split('\\n');
	const processed = lines.map(processLine);
	const outputPath = join(config.outputDir, filename);
	await writeFile(outputPath, processed.join('\\n'));
	if (config.verbose) {
		console.log(\`Processed \${filename}\`);
	}
}

async function main() {
	const config = loadConfig();
	const files = ['a.txt', 'b.txt', 'c.txt'];
	for (const file of files) {
		await processFile(config, file);
	}
}

main();
`;

interface HintsToolbarOptions extends ComponentFixtureContext {
	simulateHover?: boolean;
}

const HINTS_CODE = `function greet(name: string): string {
	return "Hello, " + name
}

greet("World");
`;

async function renderHintsToolbar(options: HintsToolbarOptions): Promise<void> {
	const { container, disposableStore, theme } = options;
	container.style.width = '500px';
	container.style.height = '180px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			if (options.simulateHover) {
				reg.defineInstance(IUserInteractionService, new MockUserInteractionService(true, true));
			}
		},
	});

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		HINTS_CODE,
		URI.parse('inmemory://hints-toolbar.ts'),
		'typescript'
	));

	// Register an inline completion provider (not an inline edit) so the result is ghost text
	const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
	disposableStore.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, {
		provideInlineCompletions: () => ({
			items: [{
				insertText: ' + "!";',
				range: new Range(2, 28, 2, 28),
			}],
		}),
		disposeInlineCompletions: () => { },
	}));

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
			inlineSuggest: { showToolbar: 'always' },
		},
		{ contributions: EditorExtensionsRegistry.getEditorContributions() } satisfies ICodeEditorWidgetOptions
	));

	editor.setModel(textModel);
	editor.setPosition({ lineNumber: 2, column: 28 });
	editor.focus();

	const controller = InlineCompletionsController.get(editor);
	controller?.model?.get()?.triggerExplicitly();

	await new Promise(resolve => setTimeout(resolve, 100));
}

function renderJumpToHint({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '500px';
	container.style.height = '200px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://jump-to-hint.ts'),
		'typescript'
	));

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
		},
		{ contributions: [] } satisfies ICodeEditorWidgetOptions
	));

	editor.setModel(textModel);
	editor.setPosition({ lineNumber: 1, column: 1 });
	editor.focus();

	const editorObs = observableCodeEditor(editor);
	disposableStore.add(instantiationService.createInstance(
		JumpToView,
		editorObs,
		{ style: 'label' },
		constObservable({ jumpToPosition: new Position(6, 18) }),
	));
}

function createLongDistanceEditor(options: {
	container: HTMLElement;
	disposableStore: import('../../../../base/common/lifecycle.js').DisposableStore;
	theme: import('./fixtureUtils.js').ComponentFixtureContext['theme'];
	code: string;
	cursorLine: number;
	editRange: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
	newText: string;
	editorOptions?: IEditorOptions;
}): void {
	const { container, disposableStore, theme } = options;
	container.style.width = '600px';
	container.style.height = '500px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		options.code,
		URI.parse('inmemory://long-distance.ts'),
		'typescript'
	));

	instantiationService.stubInstance(InlineCompletionsSource, {
		cancelUpdate: () => { },
		clear: () => { },
		clearOperationOnTextModelChange: constObservable(undefined) as IObservableWithChange<undefined, void>,
		clearSuggestWidgetInlineCompletions: () => { },
		dispose: () => { },
		fetch: async () => true,
		inlineCompletions: constObservable(new InlineCompletionsState([
			InlineEditItem.createForTest(
				TextModelValueReference.snapshot(textModel),
				new Range(
					options.editRange.startLineNumber,
					options.editRange.startColumn,
					options.editRange.endLineNumber,
					options.editRange.endColumn
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
			inlineSuggest: {
				edits: { showLongDistanceHint: true },
			},
			...options.editorOptions,
		},
		editorWidgetOptions
	));

	editor.setModel(textModel);
	editor.setPosition({ lineNumber: options.cursorLine, column: 1 });
	editor.focus();

	const controller = InlineCompletionsController.get(editor);
	controller?.model?.get();
}

export default defineThemedFixtureGroup({
	HintsToolbar: defineComponentFixture({
		render: (context) => renderHintsToolbar(context),
	}),
	HintsToolbarHovered: defineComponentFixture({
		render: (context) => renderHintsToolbar({ ...context, simulateHover: true }),
	}),
	JumpToHint: defineComponentFixture({
		render: renderJumpToHint,
	}),
	LongDistanceHint: defineComponentFixture({
		render: (context) => createLongDistanceEditor({
			...context,
			code: LONG_DISTANCE_CODE,
			cursorLine: 1,
			editRange: { startLineNumber: 28, startColumn: 1, endLineNumber: 35, endColumn: 100 },
			newText: `async function processFile(config: Config, filename: string): Promise<void> {
	const inputPath = join(config.inputDir, filename);
	const outputPath = join(config.outputDir, filename);
	const data = await readFile(inputPath, 'utf8');
	if (!validateInput(data)) {
		throw new Error(\`Invalid input in \${filename}\`);
	}
	const processed = data.split('\\n').map(processLine).join('\\n');
	await writeFile(outputPath, processed);`,
		}),
	}),
});
