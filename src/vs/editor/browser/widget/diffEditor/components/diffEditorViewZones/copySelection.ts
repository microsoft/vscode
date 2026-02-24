/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Range } from '../../../../../common/core/range.js';
import { DetailedLineRangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../common/model.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { RenderLinesResult } from './renderLines.js';

export interface IEnableViewZoneCopySelectionOptions {
	/** The view zone HTML element that contains the deleted codes. */
	domNode: HTMLElement;

	/** The diff entry for the current view zone. */
	diffEntry: DetailedLineRangeMapping;

	/** The original text model, to get the original text based on selection. */
	originalModel: ITextModel;

	/** The render lines result that can translate DOM positions to model positions. */
	renderLinesResult: RenderLinesResult;

	/** The clipboard service to write the selected text to. */
	clipboardService: IClipboardService;
}

export function enableCopySelection(options: IEnableViewZoneCopySelectionOptions): DisposableStore {
	const { domNode, renderLinesResult, diffEntry, originalModel, clipboardService } = options;
	const viewZoneDisposable = new DisposableStore();

	viewZoneDisposable.add(addDisposableListener(domNode, 'copy', (e) => {
		e.preventDefault();
		const selection = domNode.ownerDocument.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return;
		}

		const domRange = selection.getRangeAt(0);
		if (!domRange || domRange.collapsed) {
			return;
		}

		const startElement = domRange.startContainer.nodeType === Node.TEXT_NODE
			? domRange.startContainer.parentElement
			: domRange.startContainer as HTMLElement;
		const endElement = domRange.endContainer.nodeType === Node.TEXT_NODE
			? domRange.endContainer.parentElement
			: domRange.endContainer as HTMLElement;

		if (!startElement || !endElement) {
			return;
		}

		const startPosition = renderLinesResult.getModelPositionAt(startElement, domRange.startOffset);
		const endPosition = renderLinesResult.getModelPositionAt(endElement, domRange.endOffset);

		if (!startPosition || !endPosition) {
			return;
		}

		const adjustedStart = startPosition.delta(diffEntry.original.startLineNumber - 1);
		const adjustedEnd = endPosition.delta(diffEntry.original.startLineNumber - 1);

		const range = adjustedEnd.isBefore(adjustedStart) ?
			Range.fromPositions(adjustedEnd, adjustedStart) :
			Range.fromPositions(adjustedStart, adjustedEnd);

		const selectedText = originalModel.getValueInRange(range);
		clipboardService.writeText(selectedText);
	}));

	return viewZoneDisposable;
}
