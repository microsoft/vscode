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
import { EDITOR_FONT_DEFAULTS } from '../../../../common/config/fontInfo.js';
import { TextEdit, TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { EditSources } from '../../../../common/textModelEditSource.js';
import { createCodeEditorServices } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { InlineCompletionEditorType } from '../../browser/model/provideInlineCompletions.js';
import { InlineEditTabAction } from '../../browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsInsertionView } from '../../browser/view/inlineEdits/inlineEditsViews/inlineEditsInsertionView.js';
import { InlineSuggestionsView } from '../../browser/view/inlineSuggestionsView.js';

suite('InlineSuggestionsView font family', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createView(fontFamily: string) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const instantiationService = createCodeEditorServices(store);
		const editor = store.add(instantiationService.createInstance(
			CodeEditorWidget,
			container,
			{ inlineSuggest: { fontFamily } },
			{ contributions: [] },
		));
		editor.setModel(store.add(createTextModel('')));

		const existingStyles = new Set(document.head.querySelectorAll('style'));
		store.add(instantiationService.createInstance(
			InlineSuggestionsView,
			editor,
			constObservable(undefined),
			observableValue('focusIsInMenu', false),
		));
		const style = Array.from(document.head.querySelectorAll('style')).find(style =>
			!existingStyles.has(style) && style.textContent?.includes('.ghost-text-decoration-preview'));
		assert.ok(style);
		return { editor, style };
	}

	function expectedStyles(fontFamily: string): string {
		return `.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`;
	}

	test('sanitizes the initial configured font family', () => {
		const { style } = createView('monospace; } .inline-font-injection { color: red; } /*');
		assert.strictEqual(style.textContent?.trim(), expectedStyles(EDITOR_FONT_DEFAULTS.fontFamily));
	});

	test('preserves valid font lists and sanitizes configuration updates', () => {
		const fontFamily = '"Fira Code", monospace';
		const { editor, style } = createView(fontFamily);
		const styles = [style.textContent?.trim()];
		editor.updateOptions({ inlineSuggest: { fontFamily: 'monospace; color: red' } });
		styles.push(style.textContent?.trim());
		const unicodeFontFamily = '"\u6e90\u30ce\u89d2\u30b4\u30b7\u30c3\u30af", monospace';
		editor.updateOptions({ inlineSuggest: { fontFamily: unicodeFontFamily } });
		styles.push(style.textContent?.trim());
		assert.deepStrictEqual(styles, [
			expectedStyles(fontFamily),
			expectedStyles(EDITOR_FONT_DEFAULTS.fontFamily),
			expectedStyles(unicodeFontFamily),
		]);
	});
});

suite('GhostTextView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
