/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption, IEditorOptions } from '../../../../common/config/editorOptions.js';
import { TextEdit, TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { EditSources } from '../../../../common/textModelEditSource.js';
import { createCodeEditorServices } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { ShrinkEmptyLinesController } from '../../../shrinkEmptyLines/browser/shrinkEmptyLines.js';
import { GhostText, GhostTextPart } from '../../browser/model/ghostText.js';
import { InlineCompletionEditorType } from '../../browser/model/provideInlineCompletions.js';
import { GhostTextView, IGhostTextWidgetData } from '../../browser/view/ghostText/ghostTextView.js';
import { InlineEditTabAction } from '../../browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsInsertionView } from '../../browser/view/inlineEdits/inlineEditsViews/inlineEditsInsertionView.js';

suite('GhostTextView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shrinks suggestions only on compressed lines, leaving continuation lines at regular size', () => {
		const context = createGhostTextViewContext(store, '\n    \n{}\ncode');
		const results = [];

		for (const [lineNumber, column, preview] of [[1, 1, false], [2, 5, true], [3, 3, false], [4, 5, false]] as const) {
			context.setGhostText(new GhostText(lineNumber, [new GhostTextPart(column, 'suggested()\ncontinuation()', preview)]));
			results.push(context.getRenderedFontSizes());
		}

		assert.deepStrictEqual(results, [
			{ inline: ['10px'], additional: ['20px'] },
			{ inline: ['10px'], additional: ['20px'] },
			{ inline: ['10px'], additional: ['20px'] },
			{ inline: ['20px'], additional: ['20px'] },
		]);
	});

	test('updates suggestion sizes when font and line shrinking options change', () => {
		const context = createGhostTextViewContext(store, '');
		context.setGhostText(new GhostText(1, [new GhostTextPart(1, 'suggested()\ncontinuation()', false)]));
		const results = [context.getRenderedFontSizes()];
		const options: IEditorOptions[] = [
			{ fontSize: 24 },
			{ shrinkEmptyLines: 0.25 },
			{ allowVariableFonts: false },
			{ allowVariableFonts: true },
			{ allowVariableLineHeights: false },
			{ allowVariableLineHeights: true },
			{ shrinkEmptyLines: 1 },
			{ shrinkEmptyLines: 0.5, lineHeight: 40 },
		];

		for (const option of options) {
			context.editor.updateOptions(option);
			results.push(context.getRenderedFontSizes());
		}

		assert.deepStrictEqual(results, [
			{ inline: ['10px'], additional: ['20px'] },
			{ inline: ['12px'], additional: ['24px'] },
			{ inline: ['6px'], additional: ['24px'] },
			{ inline: ['24px'], additional: ['24px'] },
			{ inline: ['6px'], additional: ['24px'] },
			{ inline: ['24px'], additional: ['24px'] },
			{ inline: ['6px'], additional: ['24px'] },
			{ inline: ['24px'], additional: ['24px'] },
			{ inline: ['12px'], additional: ['24px'] },
		]);
	});

	test('updates suggestion sizes when the underlying line expands and shrinks', () => {
		const context = createGhostTextViewContext(store, '');
		context.setGhostText(new GhostText(1, [new GhostTextPart(1, 'suggested()\ncontinuation()', false)]));
		const results = [context.getRenderedFontSizes()];

		context.textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'code' }]);
		results.push(context.getRenderedFontSizes());
		context.textModel.applyEdits([{ range: new Range(1, 1, 1, 5), text: '' }]);
		results.push(context.getRenderedFontSizes());
		context.textModel.setValue('code');
		results.push(context.getRenderedFontSizes());
		context.textModel.setValue('');
		results.push(context.getRenderedFontSizes());

		assert.deepStrictEqual(results, [
			{ inline: ['10px'], additional: ['20px'] },
			{ inline: ['20px'], additional: ['20px'] },
			{ inline: ['10px'], additional: ['20px'] },
			{ inline: ['20px'], additional: ['20px'] },
			{ inline: ['10px'], additional: ['20px'] },
		]);
	});

	test('preserves indentation and measures the smaller injected text correctly', () => {
		const context = createGhostTextViewContext(store, '    }');
		context.setGhostText(new GhostText(1, [new GhostTextPart(5, 'suggested()', false)]));
		context.editor.render(true);

		const ghostText = context.container.querySelector('.view-lines .ghost-text-decoration');
		const renderedLine = context.container.querySelector('.view-lines .view-line > span');
		assert.ok(ghostText && renderedLine);
		const lineBounds = renderedLine.getBoundingClientRect();
		const ghostTextBounds = ghostText.getBoundingClientRect();
		const indentationWidth = 4 * context.editor.getOption(EditorOption.fontInfo).spaceWidth;

		assert.deepStrictEqual({
			fontSize: getWindow(context.container).getComputedStyle(ghostText).fontSize,
			indentationIsPreserved: Math.abs(ghostTextBounds.left - lineBounds.left - indentationWidth) < 1,
			endColumnMatchesRenderedText: Math.abs(context.editor.getOffsetForColumn(1, 6) - lineBounds.width) < 1,
		}, {
			fontSize: '10px',
			indentationIsPreserved: true,
			endColumnMatchesRenderedText: true,
		});
	});

	test('accepting a multi-line insertion preserves the viewport', async () => {
		const context = await createInsertionViewContext(store);
		const scrollTop = context.editor.getScrollTop();
		const anchorTop = context.editor.getTopForLineNumber(80, true) - scrollTop;

		store.add(context.editor.onDidChangeModelContent(() => context.input.set(undefined, undefined)));
		context.editor.edit(
			new TextEdit([new TextReplacement(context.insertionRange, context.insertionText)]),
			EditSources.inlineCompletionAccept({
				nes: true,
				requestUuid: 'ghost-text-view-test',
				languageId: context.textModel.getLanguageId(),
				correlationId: undefined,
			}),
		);
		context.editor.render(true);
		await nextAnimationFrame(getWindow(context.editor.getContainerDomNode()));

		assert.deepStrictEqual({
			scrollTop: context.editor.getScrollTop(),
			anchorTop: context.editor.getTopForLineNumber(80, true) - context.editor.getScrollTop(),
		}, {
			scrollTop,
			anchorTop,
		});
	});

	test('dismissing a multi-line insertion keeps the cursor stable', async () => {
		const context = await createInsertionViewContext(store);
		context.editor.setPosition(new Position(110, 1), 'test');
		const scrollTop = context.editor.getScrollTop();
		const cursorTop = context.editor.getTopForLineNumber(110, true) - scrollTop;

		context.input.set(undefined, undefined);
		context.editor.render(true);
		await nextAnimationFrame(getWindow(context.editor.getContainerDomNode()));

		assert.deepStrictEqual({
			scrollTopDelta: context.editor.getScrollTop() - scrollTop,
			cursorTop: context.editor.getTopForLineNumber(110, true) - context.editor.getScrollTop(),
		}, {
			scrollTopDelta: -context.insertedLineCount * context.lineHeight,
			cursorTop,
		});
	});
});

function createGhostTextViewContext(store: Pick<DisposableStore, 'add'>, text: string) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	store.add(toDisposable(() => container.remove()));

	const instantiationService = createCodeEditorServices(store);
	const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
		fontSize: 20,
		lineHeight: 30,
		shrinkEmptyLines: 0.5,
		renderWhitespace: 'none',
		minimap: { enabled: false },
	}, { contributions: [] }));
	const textModel = store.add(createTextModel(text));
	editor.setModel(textModel);
	store.add(new ShrinkEmptyLinesController(editor));
	editor.layout({ width: 1000, height: 500 });

	const input = observableValue<IGhostTextWidgetData | undefined>('ghostText', undefined);
	store.add(instantiationService.createInstance(GhostTextView, editor, input, {}));

	return {
		container,
		editor,
		textModel,
		setGhostText(ghostText: GhostText): void {
			input.set({
				ghostText,
				warning: undefined,
				handleInlineCompletionShown: () => { },
			}, undefined);
		},
		getRenderedFontSizes() {
			editor.render(true);
			const targetWindow = getWindow(container);
			return {
				inline: [...new Set(Array.from(container.querySelectorAll('.view-lines .ghost-text-decoration, .view-lines .ghost-text-decoration-preview'),
					token => targetWindow.getComputedStyle(token).fontSize))],
				additional: [...new Set(Array.from(container.querySelectorAll('.suggest-preview-text .ghost-text'),
					token => targetWindow.getComputedStyle(token).fontSize))],
			};
		},
	};
}

async function createInsertionViewContext(store: Pick<DisposableStore, 'add'>) {
	const container = document.createElement('div');
	container.style.width = '1000px';
	container.style.height = '500px';
	document.body.appendChild(container);
	store.add(toDisposable(() => container.remove()));

	const instantiationService = createCodeEditorServices(store);
	const lineHeight = 20;
	const editor = store.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			lineHeight,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
		},
		{ contributions: [] },
	));
	const textModel = store.add(createTextModel(
		Array.from({ length: 200 }, (_, index) => `line ${String(index + 1).padStart(3, '0')} content`).join('\n')
	));
	editor.setModel(textModel);
	editor.layout({ width: 1000, height: 500 });

	const targetLineNumber = 100;
	const targetColumn = 5;
	const insertionText = '\ninserted 1\ninserted 2\ninserted 3\ninserted 4\ninserted 5\ninserted 6\ninserted 7';
	const insertedLineCount = insertionText.split('\n').length - 1;
	const insertionRange = new Range(targetLineNumber, targetColumn, targetLineNumber, targetColumn);
	const input = observableValue<{
		lineNumber: number;
		startColumn: number;
		text: string;
		editorType: InlineCompletionEditorType;
	} | undefined>('input', undefined);
	store.add(instantiationService.createInstance(
		InlineEditsInsertionView,
		editor,
		input,
		constObservable(InlineEditTabAction.Accept),
	));

	editor.setPosition(new Position(targetLineNumber, targetColumn), 'test');
	editor.setScrollTop(editor.getTopForLineNumber(targetLineNumber - 22, true));
	input.set({
		lineNumber: targetLineNumber,
		startColumn: targetColumn,
		text: insertionText,
		editorType: InlineCompletionEditorType.TextEditor,
	}, undefined);
	editor.render(true);
	const targetWindow = getWindow(editor.getContainerDomNode());
	await nextAnimationFrame(targetWindow);
	await nextAnimationFrame(targetWindow);

	return {
		editor,
		input,
		textModel,
		lineHeight,
		insertionText,
		insertedLineCount,
		insertionRange,
	};
}

function nextAnimationFrame(targetWindow: Window): Promise<void> {
	return new Promise(resolve => targetWindow.requestAnimationFrame(() => resolve()));
}
