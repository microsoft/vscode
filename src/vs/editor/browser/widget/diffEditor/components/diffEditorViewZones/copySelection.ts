/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getDomNodePagePosition } from '../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../base/common/actions.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ICodeEditor, MouseTargetType } from '../../../../../browser/editorBrowser.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { DetailedLineRangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../common/model.js';
import { localize } from '../../../../../../nls.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';

export interface IEnableViewZoneSelectionAndCopyOptions {
	/** The view zone HTML element that contains the deleted codes. */
	domNode: HTMLElement;

	/** Returns the current view zone ID. */
	getViewZoneId: () => string;

	/** The diff entry for the current view zone. */
	diffEntry: DetailedLineRangeMapping;

	/** The original text model, to get the original text based on selection. */
	originalModel: ITextModel;

	/** The line height of the editor, to calculate the line number offset. */
	editorLineHeight: number;

	/** The actual view lines for each editor line (considers line-wrapping). */
	viewLineCounts: number[];

	/** The editor to listen to mouse events on. */
	editor: ICodeEditor;

	/**
	 * The function to show the context menu.
	 *
	 * @param anchor The anchor position for the context menu.
	 * @param baseActions The base actions to show in the context menu, which will
	 *     include the "Copy Selection" option if any text is selected in this
	 *     view zone.
	 * @param onHide The function to call when the context menu is dismissed.
	 */
	showContextMenu:
	(anchor: { x: number; y: number }, baseActions?: Action[],
		onHide?: () => void) => void;

	/** The clipboard service to write the selected text to. */
	clipboardService: IClipboardService;
}

export function enableCopySelection(
	options: IEnableViewZoneSelectionAndCopyOptions): DisposableStore {
	const {
		domNode,
		getViewZoneId,
		diffEntry,
		originalModel,
		editorLineHeight,
		viewLineCounts,
		editor,
		showContextMenu,
		clipboardService,
	} = options;
	let lastMouseDownPosition: Position | undefined;
	const viewZoneDisposable = new DisposableStore();

	viewZoneDisposable.add(editor.onMouseDown(e => {
		if (!e.event.leftButton) {
			return;
		}
		if (e.target.type !== MouseTargetType.CONTENT_VIEW_ZONE &&
			e.target.type !== MouseTargetType.GUTTER_VIEW_ZONE) {
			return;
		}
		if (e.target.detail.viewZoneId !== getViewZoneId()) {
			return;
		}

		// Temporarily makes the *current* view zone selectable
		// This prevents the selection from bleeding into other view zones
		domNode.classList.add('line-delete-selectable');

		const lineNumberOffset = calculateLineNumberOffset(e.event.browserEvent.y, domNode, editorLineHeight, viewLineCounts);
		const lineNumber = diffEntry.original.startLineNumber + lineNumberOffset;
		lastMouseDownPosition = new Position(lineNumber, getRealColumnNumber(e.target.mouseColumn, lineNumber, originalModel));
	}));

	viewZoneDisposable.add(editor.onMouseUp(e => {
		if (!lastMouseDownPosition) {
			return;
		}
		const mouseDownPosition = lastMouseDownPosition;
		lastMouseDownPosition = undefined;

		if (!e.event.leftButton) {
			return;
		}
		if ((e.target.type !== MouseTargetType.CONTENT_VIEW_ZONE &&
			e.target.type !== MouseTargetType.GUTTER_VIEW_ZONE) ||
			e.target.detail.viewZoneId !== getViewZoneId()) {
			// Mouse left the current view zone. Remove the selectable class
			domNode.classList.remove('line-delete-selectable');
			return;
		}

		const lineNumberOffset = calculateLineNumberOffset(e.event.browserEvent.y, domNode, editorLineHeight, viewLineCounts);
		const lineNumber = diffEntry.original.startLineNumber + lineNumberOffset;
		const mouseUpPosition = new Position(lineNumber, getRealColumnNumber(e.target.mouseColumn, lineNumber, originalModel));

		const range = mouseUpPosition.isBefore(mouseDownPosition) ?
			Range.fromPositions(mouseUpPosition, mouseDownPosition) :
			Range.fromPositions(mouseDownPosition, mouseUpPosition);
		const selectedText = originalModel.getValueInRange(range);
		const onCopy =
			viewZoneDisposable.add(addDisposableListener(domNode, 'copy', (e) => {
				e.preventDefault();
				clipboardService.writeText(selectedText);
			}));

		showContextMenu(
			{ x: e.event.posx, y: e.event.posy + editorLineHeight },
			selectedText ?
				[new Action(
					'diff.clipboard.copySelectedDeletedContent',
					localize(
						'diff.clipboard.copySelectedDeletedContent.label',
						'Copy Selection'),
					undefined, true,
					async () => clipboardService.writeText(selectedText))] :
				[],
			() => {
				onCopy.dispose();
				domNode.classList.remove('line-delete-selectable');
			});
	}));
	return viewZoneDisposable;
}

/**
 * Calculate the line number offset of the given browser event y-coordinate in a
 * view zone.
 *
 * @param y The y-coordinate position of the browser event.
 * @param viewZoneNode The view zone HTML element.
 * @param editorLineHeight The line height of the editor.
 * @param viewLineCounts The actual view lines for each editor line (considers
 *     line-wrapping).
 * @return The line number offset in the given view zone.
 */
function calculateLineNumberOffset(
	y: number,
	viewZoneNode: HTMLElement,
	editorLineHeight: number,
	viewLineCounts: number[],
): number {
	const { top } = getDomNodePagePosition(viewZoneNode);
	const offset = y - top;
	const lineNumberOffset = Math.floor(offset / editorLineHeight);

	let acc = 0;
	for (let i = 0; i < viewLineCounts.length; i++) {
		acc += viewLineCounts[i];
		if (lineNumberOffset < acc) {
			return i;
		}
	}
	return lineNumberOffset;
}

/**
 * Get the real column number of the given mouse column in a view zone. This
 * compensates for different tab sizes.
 *
 * @param mouseColumn The mouse column position of the browser event.
 * @param lineNumber The line number of the original text model.
 * @param textModel The original text model.
 * @return The real column number of the given mouse column in the view zone.
 */
function getRealColumnNumber(
	mouseColumn: number,
	lineNumber: number,
	textModel: ITextModel,
) {
	const lineContent = textModel.getLineContent(lineNumber);
	if (lineContent.startsWith('\t')) {
		const tabs = textModel.getLineFirstNonWhitespaceColumn(lineNumber) - 1;
		return mouseColumn - tabs * (textModel.getOptions().tabSize - 1);
	}
	return mouseColumn;
}
