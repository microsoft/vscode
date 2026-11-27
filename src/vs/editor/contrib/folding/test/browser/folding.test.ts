/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { IMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorMouseEvent, MouseTargetType } from '../../../../browser/editorBrowser.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { ITestCodeEditor, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { FoldingController } from '../../browser/folding.js';

suite('FoldingController', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #292361: duplicate mouseup after a gutter click toggles fold only once', async () => {
		await withAsyncTestCodeEditor([
			'A',
			'  B',
			'  C',
		], { folding: true, foldingStrategy: 'indentation' }, async editor => {
			const foldingController = editor.registerAndInstantiateContribution(FoldingController.ID, FoldingController);
			const foldingModel = await foldingController.getFoldingModel();
			assert.ok(foldingModel);

			const region = foldingModel.getRegionAtLine(1);
			assert.ok(region);
			assert.strictEqual(region.isCollapsed, false);

			const click = createGutterFoldClickEvent(1);
			fireEditorMouseDown(editor, click);
			fireEditorMouseUp(editor, click);
			fireEditorMouseUp(editor, click);

			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, true);

			fireEditorMouseDown(editor, click);
			fireEditorMouseUp(editor, click);
			fireEditorMouseUp(editor, click);

			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, false);
		});
	});

	test('issue #292361: tap on the inline fold placeholder unfolds the region', async () => {
		await withAsyncTestCodeEditor([
			'A',
			'  B',
			'  C',
		], { folding: true, foldingStrategy: 'indentation' }, async editor => {
			const foldingController = editor.registerAndInstantiateContribution(FoldingController.ID, FoldingController);
			const foldingModel = await foldingController.getFoldingModel();
			assert.ok(foldingModel);

			const gutterClick = createGutterFoldClickEvent(1);
			fireEditorMouseDown(editor, gutterClick);
			fireEditorMouseUp(editor, gutterClick);
			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, true);

			// Android phone Gesture tap (PointerEventHandler._dispatchGesture) uses leftButton: false.
			// The "..." placeholder is CONTENT_TEXT at the end of the folded line.
			const maxColumn = editor.getModel()!.getLineMaxColumn(1);
			const tap = createFoldPlaceholderTapEvent(1, maxColumn);
			fireEditorMouseDown(editor, tap);
			fireEditorMouseUp(editor, tap);

			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, false);
		});
	});

	test('issue #292361: tap after the folded line unfolds when unfoldOnClickAfterEndOfLine is enabled', async () => {
		await withAsyncTestCodeEditor([
			'A',
			'  B',
			'  C',
		], { folding: true, foldingStrategy: 'indentation', unfoldOnClickAfterEndOfLine: true }, async editor => {
			const foldingController = editor.registerAndInstantiateContribution(FoldingController.ID, FoldingController);
			const foldingModel = await foldingController.getFoldingModel();
			assert.ok(foldingModel);

			const gutterClick = createGutterFoldClickEvent(1);
			fireEditorMouseDown(editor, gutterClick);
			fireEditorMouseUp(editor, gutterClick);
			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, true);

			const maxColumn = editor.getModel()!.getLineMaxColumn(1);
			const tap = createFoldEmptyContentTapEvent(1, maxColumn);
			fireEditorMouseDown(editor, tap);
			fireEditorMouseUp(editor, tap);

			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, false);
		});
	});

	test('issue #292361: right-click on the fold placeholder does not unfold', async () => {
		await withAsyncTestCodeEditor([
			'A',
			'  B',
			'  C',
		], { folding: true, foldingStrategy: 'indentation' }, async editor => {
			const foldingController = editor.registerAndInstantiateContribution(FoldingController.ID, FoldingController);
			const foldingModel = await foldingController.getFoldingModel();
			assert.ok(foldingModel);

			const gutterClick = createGutterFoldClickEvent(1);
			fireEditorMouseDown(editor, gutterClick);
			fireEditorMouseUp(editor, gutterClick);
			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, true);

			const maxColumn = editor.getModel()!.getLineMaxColumn(1);
			const rightClick = createFoldPlaceholderRightClickEvent(1, maxColumn);
			fireEditorMouseDown(editor, rightClick);
			fireEditorMouseUp(editor, rightClick);

			assert.strictEqual(foldingModel.getRegionAtLine(1)?.isCollapsed, true);
		});
	});
});

interface MouseEventEmitter {
	fire(event: IEditorMouseEvent): void;
}

function fireEditorMouseDown(editor: ITestCodeEditor, event: IEditorMouseEvent): void {
	(editor as unknown as { _onMouseDown: MouseEventEmitter })._onMouseDown.fire(event);
}

function fireEditorMouseUp(editor: ITestCodeEditor, event: IEditorMouseEvent): void {
	(editor as unknown as { _onMouseUp: MouseEventEmitter })._onMouseUp.fire(event);
}

function createMouseEvent(leftButton: boolean, target: HTMLElement, rightButton = false): IMouseEvent {
	return {
		browserEvent: new MouseEvent('mouseup', { button: leftButton ? 0 : rightButton ? 2 : -1, buttons: 0 }),
		leftButton,
		middleButton: false,
		rightButton,
		buttons: 0,
		target,
		detail: 1,
		posx: 0,
		posy: 0,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		timestamp: Date.now(),
		defaultPrevented: false,
		preventDefault: () => { },
		stopPropagation: () => { },
	};
}

function createGutterFoldClickEvent(lineNumber: number): IEditorMouseEvent {
	const range = new Range(lineNumber, 1, lineNumber, 1);
	const element = document.createElement('div');
	return {
		event: createMouseEvent(true, element),
		target: {
			type: MouseTargetType.GUTTER_LINE_DECORATIONS,
			element,
			position: new Position(lineNumber, 1),
			mouseColumn: 1,
			range,
			detail: {
				isAfterLines: false,
				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				lineNumbersWidth: 0,
				offsetX: 10,
			},
		},
	};
}

function createFoldPlaceholderTapEvent(lineNumber: number, column: number): IEditorMouseEvent {
	const range = new Range(lineNumber, column, lineNumber, column);
	const element = document.createElement('span');
	element.className = 'inline-folded';
	return {
		event: createMouseEvent(false, element),
		target: {
			type: MouseTargetType.CONTENT_TEXT,
			element,
			position: new Position(lineNumber, column),
			mouseColumn: column,
			range,
			detail: {
				mightBeForeignElement: true,
				injectedText: null,
			},
		},
	};
}

function createFoldPlaceholderRightClickEvent(lineNumber: number, column: number): IEditorMouseEvent {
	const event = createFoldPlaceholderTapEvent(lineNumber, column);
	return {
		...event,
		event: createMouseEvent(false, event.target.element!, true),
	};
}

function createFoldEmptyContentTapEvent(lineNumber: number, column: number): IEditorMouseEvent {
	const range = new Range(lineNumber, column, lineNumber, column);
	const element = document.createElement('div');
	return {
		event: createMouseEvent(false, element),
		target: {
			type: MouseTargetType.CONTENT_EMPTY,
			element,
			position: new Position(lineNumber, column),
			mouseColumn: column,
			range,
			detail: {
				isAfterLines: false,
				horizontalDistanceToText: 4,
			},
		},
	};
}
