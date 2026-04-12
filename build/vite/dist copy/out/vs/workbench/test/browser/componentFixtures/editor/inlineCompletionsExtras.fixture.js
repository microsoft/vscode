/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { observableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { InlineCompletionsController } from '../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import '../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js';
import { InlineCompletionsSource, InlineCompletionsState } from '../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js';
import { InlineEditItem } from '../../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js';
import { TextModelValueReference } from '../../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js';
import { JumpToView } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/jumpToView.js';
import { GutterIndicatorMenuContent } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorMenu.js';
import { InlineSuggestionGutterMenuData } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import '../../../../../editor/contrib/inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget.css';
import '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/view.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
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
const HINTS_CODE = `function greet(name: string): string {
	return "Hello, " + name
}

greet("World");
`;
async function renderHintsToolbar(options) {
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
    const textModel = disposableStore.add(createTextModel(instantiationService, HINTS_CODE, URI.parse('inmemory://hints-toolbar.ts'), 'typescript'));
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
    const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 14,
        cursorBlinking: 'solid',
        inlineSuggest: { showToolbar: 'always' },
    }, { contributions: EditorExtensionsRegistry.getEditorContributions() }));
    editor.setModel(textModel);
    editor.setPosition({ lineNumber: 2, column: 28 });
    editor.focus();
    const controller = InlineCompletionsController.get(editor);
    controller?.model?.get()?.triggerExplicitly();
    await new Promise(resolve => setTimeout(resolve, 100));
}
function renderJumpToHint({ container, disposableStore, theme }) {
    container.style.width = '500px';
    container.style.height = '200px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
    const textModel = disposableStore.add(createTextModel(instantiationService, SAMPLE_CODE, URI.parse('inmemory://jump-to-hint.ts'), 'typescript'));
    const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 14,
        cursorBlinking: 'solid',
    }, { contributions: [] }));
    editor.setModel(textModel);
    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.focus();
    const editorObs = observableCodeEditor(editor);
    disposableStore.add(instantiationService.createInstance(JumpToView, editorObs, { style: 'label' }, constObservable({ jumpToPosition: new Position(6, 18) })));
}
function createLongDistanceEditor(options) {
    const { container, disposableStore, theme } = options;
    container.style.width = '600px';
    container.style.height = '500px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
    const textModel = disposableStore.add(createTextModel(instantiationService, options.code, URI.parse('inmemory://long-distance.ts'), 'typescript'));
    instantiationService.stubInstance(InlineCompletionsSource, {
        cancelUpdate: () => { },
        clear: () => { },
        clearOperationOnTextModelChange: constObservable(undefined),
        clearSuggestWidgetInlineCompletions: () => { },
        dispose: () => { },
        fetch: async () => true,
        inlineCompletions: constObservable(new InlineCompletionsState([
            InlineEditItem.createForTest(TextModelValueReference.snapshot(textModel), new Range(options.editRange.startLineNumber, options.editRange.startColumn, options.editRange.endLineNumber, options.editRange.endColumn), options.newText)
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
        inlineSuggest: {
            edits: { showLongDistanceHint: true },
        },
        ...options.editorOptions,
    }, editorWidgetOptions));
    editor.setModel(textModel);
    editor.setPosition({ lineNumber: options.cursorLine, column: 1 });
    editor.focus();
    const controller = InlineCompletionsController.get(editor);
    controller?.model?.get();
}
function renderGutterMenu({ container, disposableStore, theme }) {
    container.style.width = '250px';
    container.style.height = '280px';
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: theme,
        additionalServices: (reg) => {
            registerWorkbenchServices(reg);
        },
    });
    const textModel = disposableStore.add(createTextModel(instantiationService, 'const x = 1;', URI.parse('inmemory://gutter-menu.ts'), 'typescript'));
    const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, document.createElement('div'), { minimap: { enabled: false } }, { contributions: [] }));
    editor.setModel(textModel);
    const editorObs = observableCodeEditor(editor);
    const menuData = new InlineSuggestionGutterMenuData(undefined, 'Copilot', [], undefined, undefined, undefined);
    const content = disposableStore.add(instantiationService.createInstance(GutterIndicatorMenuContent, editorObs, menuData, () => { }).toDisposableLiveElement());
    container.style.background = 'var(--vscode-editorHoverWidget-background)';
    container.style.border = '2px solid var(--vscode-editorHoverWidget-border)';
    container.style.borderRadius = '3px';
    container.style.color = 'var(--vscode-editorHoverWidget-foreground)';
    container.appendChild(content.element);
}
export default defineThemedFixtureGroup({ path: 'editor/' }, {
    HintsToolbar: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderHintsToolbar(context),
    }),
    HintsToolbarHovered: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderHintsToolbar({ ...context, simulateHover: true }),
    }),
    JumpToHint: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: renderJumpToHint,
    }),
    LongDistanceHint: defineComponentFixture({
        labels: { kind: 'screenshot', flaky: true },
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
    GutterMenu: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: renderGutterMenu,
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnNFeHRyYXMuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZWRpdG9yL2lubGluZUNvbXBsZXRpb25zRXh0cmFzLmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBeUIsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUEyQixvQkFBb0IsRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNqTCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0JBQWdCLEVBQTRCLE1BQU0scUVBQXFFLENBQUM7QUFDakksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtR0FBbUcsQ0FBQztBQUNoSixPQUFPLDJGQUEyRixDQUFDO0FBQ25HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDBGQUEwRixDQUFDO0FBQzNKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1RkFBdUYsQ0FBQztBQUN2SCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwRkFB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