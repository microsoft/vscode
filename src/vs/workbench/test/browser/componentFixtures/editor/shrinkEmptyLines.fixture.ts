/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { InlineCompletionsController } from '../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import '../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js';
import { ShrinkEmptyLinesController } from '../../../../../editor/contrib/shrinkEmptyLines/browser/shrinkEmptyLines.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition, waitForFixtureDomCondition } from '../fixtureUtils.js';

const SAMPLE_CODE = [
	'class Counter',
	'{',
	'    increment()',
	'    {',
	'        const values = [',
	'            1,',
	'            2',
	'        ];',
	'',
	'        return values;',
	'    }',
	'',
	'\treset()',
	'\t{',
	'\t\treturn 0;',
	'\t}',
	'}',
].join('\n');

function renderShrinkEmptyLines(context: ComponentFixtureContext, multiplier: number, selected = false): void {
	const { container, disposableStore, theme } = context;
	container.style.width = '480px';
	container.style.height = '400px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const model = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://shrink-empty-lines.txt'),
		'plaintext'
	));
	model.updateOptions({ tabSize: 4 });

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			dimension: { width: 480, height: 400 },
			fontFamily: 'Consolas, "Courier New", monospace',
			fontSize: 16,
			lineHeight: 22,
			allowVariableLineHeights: true,
			allowVariableFonts: true,
			shrinkEmptyLines: multiplier,
			shrinkEmptyLinesKind: 'punctuation',
			glyphMargin: false,
			lineNumbers: 'on',
			minimap: { enabled: false },
			renderLineHighlight: 'none',
			renderWhitespace: 'none',
			scrollBeyondLastLine: false,
			scrollbar: { horizontal: 'hidden', vertical: 'hidden' },
		},
		{
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([ShrinkEmptyLinesController.ID]),
		}
	));
	editor.setModel(model);

	if (selected) {
		editor.setSelection(new Range(5, 9, 10, 23));
		context.focus(editor);
	}
	editor.render(true);
}

async function renderInlineCompletion(context: ComponentFixtureContext, accepted: boolean): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.style.width = '640px';
	container.style.height = '240px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registerWorkbenchServices,
	});
	let inlineSuggestionSignalPlayed = false;
	const accessibilitySignalService = instantiationService.get(IAccessibilitySignalService);
	instantiationService.stub(IAccessibilitySignalService, accessibilitySignalService, 'playSignal', async (signal: AccessibilitySignal) => {
		if (signal === AccessibilitySignal.inlineSuggestion) {
			inlineSuggestionSignalPlayed = true;
		}
	});
	const model = disposableStore.add(createTextModel(
		instantiationService,
		'function sum() {\n    const total = 42;\n\n    return total;\n}',
		URI.parse('inmemory://shrink-empty-lines-inline-completion.ts'),
		'plaintext',
	));
	model.updateOptions({ tabSize: 4 });
	disposableStore.add(instantiationService.get(ILanguageFeaturesService).inlineCompletionsProvider.register({ pattern: '**' }, {
		provideInlineCompletions: textModel => ({
			items: textModel === model && model.getLineContent(3) === '' ? [{
				insertText: '    console.log(total);',
				range: new Range(3, 1, 3, 1),
			}] : [],
		}),
		disposeInlineCompletions: () => { },
	}));
	const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
		dimension: { width: 640, height: 240 },
		fontFamily: 'Consolas, "Courier New", monospace',
		fontSize: 26,
		lineHeight: 40,
		shrinkEmptyLines: 0.5,
		allowVariableLineHeights: true,
		allowVariableFonts: true,
		cursorBlinking: 'solid',
		glyphMargin: false,
		minimap: { enabled: false },
		renderLineHighlight: 'none',
		renderWhitespace: 'none',
		scrollBeyondLastLine: false,
		scrollbar: { horizontal: 'hidden', vertical: 'hidden' },
		inlineSuggest: { showToolbar: 'never' },
	}, {
		contributions: EditorExtensionsRegistry.getSomeEditorContributions([ShrinkEmptyLinesController.ID, InlineCompletionsController.ID]),
	}));
	editor.setModel(model);
	editor.setPosition({ lineNumber: 3, column: 1 });
	context.focus(editor);

	const completionModel = InlineCompletionsController.get(editor)?.model.get();
	if (!completionModel) {
		throw new Error('Inline completion model was not created');
	}
	await completionModel.triggerExplicitly();
	if (accepted) {
		await waitForFixtureCondition(() => inlineSuggestionSignalPlayed, 'Inline suggestion accessibility signal was not played');
		await completionModel.accept();
	}
	editor.render(true);
	await waitForFixtureDomCondition(container, () => accepted
		? model.getLineContent(3) === '    console.log(total);' && !container.querySelector('.ghost-text-decoration')
		: Array.from(container.querySelectorAll('.ghost-text-decoration')).some(token => token.textContent?.includes('console.log(total);')),
		disposableStore,
	);
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	Regular: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Seventeen numbered lines of code use uniform line heights and font sizes, including blank lines and punctuation-only lines. Both space-indented and tab-indented braces align with the code at the same indentation level.'],
		render: context => renderShrinkEmptyLines(context, 1),
	}),
	Shrunk: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The same code has half-height blank and punctuation-only lines. Braces, closing brackets, and their line numbers use smaller fonts, while lines containing letters or digits keep their regular size. Space-indented and tab-indented braces retain their horizontal indentation rather than shifting left.'],
		render: context => renderShrinkEmptyLines(context, 0.5),
	}),
	Selected: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A selection spans the array declaration through the return statement, crossing regular-height digit lines, a half-height closing bracket line, and a half-height blank line. The selection background follows the varying line heights without gaps, and the selected text remains aligned with its unselected indentation.'],
		render: context => renderShrinkEmptyLines(context, 0.5, true),
	}),
	InlineCompletion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['An inline suggestion on a half-height empty line uses smaller glyphs, while its four-space indentation aligns with the full-size return statement below it.'],
		render: context => renderInlineCompletion(context, false),
	}),
	InlineCompletionAccepted: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The accepted console.log statement uses the regular font and line height, and starts at the same indentation as its preview and the return statement below it.'],
		render: context => renderInlineCompletion(context, true),
	}),
});
