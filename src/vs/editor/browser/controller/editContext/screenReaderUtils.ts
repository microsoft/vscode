/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EndOfLinePreference } from '../../../common/model.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { EditorOption, IComputedEditorOptions } from '../../../common/config/editorOptions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import * as nls from '../../../../nls.js';

export interface ISimpleModel {
	getLineCount(): number;
	getLineMaxColumn(lineNumber: number): number;
	getValueInRange(range: Range, eol: EndOfLinePreference): string;
	getValueLengthInRange(range: Range, eol: EndOfLinePreference): number;
	modifyPosition(position: Position, offset: number): Position;
}

export interface ScreenReaderContentState {
	value: string;

	/** the offset where selection starts inside `value` */
	selectionStart: number;

	/** the offset where selection ends inside `value` */
	selectionEnd: number;

	/** the editor range in the view coordinate system that matches the selection inside `value` */
	selection: Range;

	/** the position of the start of the `value` in the editor */
	startPositionWithinEditor: Position;

	/** the visible line count (wrapped, not necessarily matching \n characters) for the text in `value` before `selectionStart` */
	newlineCountBeforeSelection: number;
}

export class PagedScreenReaderStrategy {
	private static _getPageOfLine(lineNumber: number, linesPerPage: number): number {
		return Math.floor((lineNumber - 1) / linesPerPage);
	}

	private static _getRangeForPage(page: number, linesPerPage: number): Range {
		const offset = page * linesPerPage;
		const startLineNumber = offset + 1;
		const endLineNumber = offset + linesPerPage;
		return new Range(startLineNumber, 1, endLineNumber + 1, 1);
	}

	public static fromEditorSelection(model: ISimpleModel, selection: Range, linesPerPage: number, trimLongText: boolean): ScreenReaderContentState {
		// Chromium handles very poorly text even of a few thousand chars
		// Cut text to avoid stalling the entire UI
		const LIMIT_CHARS = 500;

		const selectionStartPage = PagedScreenReaderStrategy._getPageOfLine(selection.startLineNumber, linesPerPage);
		const selectionStartPageRange = PagedScreenReaderStrategy._getRangeForPage(selectionStartPage, linesPerPage);

		const selectionEndPage = PagedScreenReaderStrategy._getPageOfLine(selection.endLineNumber, linesPerPage);
		const selectionEndPageRange = PagedScreenReaderStrategy._getRangeForPage(selectionEndPage, linesPerPage);

		let pretextRange = selectionStartPageRange.intersectRanges(new Range(1, 1, selection.startLineNumber, selection.startColumn))!;
		if (trimLongText && model.getValueLengthInRange(pretextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
			const pretextStart = model.modifyPosition(pretextRange.getEndPosition(), -LIMIT_CHARS);
			pretextRange = Range.fromPositions(pretextStart, pretextRange.getEndPosition());
		}
		const pretext = model.getValueInRange(pretextRange, EndOfLinePreference.LF);

		const lastLine = model.getLineCount();
		const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
		let posttextRange = selectionEndPageRange.intersectRanges(new Range(selection.endLineNumber, selection.endColumn, lastLine, lastLineMaxColumn))!;
		if (trimLongText && model.getValueLengthInRange(posttextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
			const posttextEnd = model.modifyPosition(posttextRange.getStartPosition(), LIMIT_CHARS);
			posttextRange = Range.fromPositions(posttextRange.getStartPosition(), posttextEnd);
		}
		const posttext = model.getValueInRange(posttextRange, EndOfLinePreference.LF);


		let text: string;
		if (selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage) {
			// take full selection
			text = model.getValueInRange(selection, EndOfLinePreference.LF);
		} else {
			const selectionRange1 = selectionStartPageRange.intersectRanges(selection)!;
			const selectionRange2 = selectionEndPageRange.intersectRanges(selection)!;
			text = (
				model.getValueInRange(selectionRange1, EndOfLinePreference.LF)
				+ String.fromCharCode(8230)
				+ model.getValueInRange(selectionRange2, EndOfLinePreference.LF)
			);
		}
		if (trimLongText && text.length > 2 * LIMIT_CHARS) {
			text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
		}

		return {
			value: pretext + text + posttext,
			selection: selection,
			selectionStart: pretext.length,
			selectionEnd: pretext.length + text.length,
			startPositionWithinEditor: pretextRange.getStartPosition(),
			newlineCountBeforeSelection: pretextRange.endLineNumber - pretextRange.startLineNumber,
		};
	}
}

export function ariaLabelForScreenReaderContent(options: IComputedEditorOptions, keybindingService: IKeybindingService) {
	const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
	if (accessibilitySupport === AccessibilitySupport.Disabled) {

		const toggleKeybindingLabel = keybindingService.lookupKeybinding('editor.action.toggleScreenReaderAccessibilityMode')?.getAriaLabel();
		const runCommandKeybindingLabel = keybindingService.lookupKeybinding('workbench.action.showCommands')?.getAriaLabel();
		const keybindingEditorKeybindingLabel = keybindingService.lookupKeybinding('workbench.action.openGlobalKeybindings')?.getAriaLabel();
		const editorNotAccessibleMessage = nls.localize('accessibilityModeOff', "The editor is not accessible at this time.");
		if (toggleKeybindingLabel) {
			return nls.localize('accessibilityOffAriaLabel', "{0} To enable screen reader optimized mode, use {1}", editorNotAccessibleMessage, toggleKeybindingLabel);
		} else if (runCommandKeybindingLabel) {
			return nls.localize('accessibilityOffAriaLabelNoKb', "{0} To enable screen reader optimized mode, open the quick pick with {1} and run the command Toggle Screen Reader Accessibility Mode, which is currently not triggerable via keyboard.", editorNotAccessibleMessage, runCommandKeybindingLabel);
		} else if (keybindingEditorKeybindingLabel) {
			return nls.localize('accessibilityOffAriaLabelNoKbs', "{0} Please assign a keybinding for the command Toggle Screen Reader Accessibility Mode by accessing the keybindings editor with {1} and run it.", editorNotAccessibleMessage, keybindingEditorKeybindingLabel);
		} else {
			// SOS
			return editorNotAccessibleMessage;
		}
	}
	return options.get(EditorOption.ariaLabel);
}

export function newlinecount(text: string): number {
	let result = 0;
	let startIndex = -1;
	do {
		startIndex = text.indexOf('\n', startIndex + 1);
		if (startIndex === -1) {
			break;
		}
		result++;
	} while (true);
	return result;
}
