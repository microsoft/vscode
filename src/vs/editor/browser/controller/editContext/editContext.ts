/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { Position } from 'vs/editor/common/core/position';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { EditorOption, EditorOptions, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as nls from 'vs/nls';
import { Color } from 'vs/base/common/color';
import * as browser from 'vs/base/browser/browser';

export const canUseZeroSizeTextarea = (browser.isFirefox);

export abstract class AbstractEditContextHandler extends ViewPart {
	abstract appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void;
	abstract writeScreenReaderContent(reason: string): void;
	abstract focusScreenReaderContent(): void;
	abstract setAriaOptions(options: IEditorAriaOptions): void;
	abstract refreshFocusState(): void;
	abstract isFocused(): boolean;
}

export interface IRenderData {
	lastRenderPosition: Position | null;
	top: number;
	left: number;
	width: number;
	height: number;
	useCover: boolean;

	color?: Color | null;
	italic?: boolean;
	bold?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
}

export interface ITypeData {
	text: string;
	replacePrevCharCnt: number;
	replaceNextCharCnt: number;
	positionDelta: number;
}

export interface ISimpleModel {
	getLineCount(): number;
	getLineMaxColumn(lineNumber: number): number;
	getValueInRange(range: Range, eol: EndOfLinePreference): string;
	getValueLengthInRange(range: Range, eol: EndOfLinePreference): number;
	modifyPosition(position: Position, offset: number): Position;
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

	public static fromEditorSelection(model: ISimpleModel, selection: Range, linesPerPage: number, trimLongText: boolean): {
		value: string;
		selectionStart: number;
		selectionEnd: number;
		newLineCountBeforeSelection: number;
	} {
		console.log('fromEditorSelection');

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
			selectionStart: pretext.length,
			selectionEnd: pretext.length + text.length,
			newLineCountBeforeSelection: pretextRange.endLineNumber - pretextRange.startLineNumber,
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

export function getAccessibilityOptions(options: IComputedEditorOptions): {
	accessibilitySupport: AccessibilitySupport;
	accessibilityPageSize: number;
	textAreaWrapping: boolean;
	textAreaWidth: number;
} {
	const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
	let accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	if (accessibilitySupport === AccessibilitySupport.Enabled && accessibilityPageSize === EditorOptions.accessibilityPageSize.defaultValue) {
		// If a screen reader is attached and the default value is not set we should automatically increase the page size to 500 for a better experience
		accessibilityPageSize = 500;
	} else {
		accessibilityPageSize = accessibilityPageSize;
	}

	// When wrapping is enabled and a screen reader might be attached,
	// we will size the textarea to match the width used for wrapping points computation (see `domLineBreaksComputer.ts`).
	// This is because screen readers will read the text in the textarea and we'd like that the
	// wrapping points in the textarea match the wrapping points in the editor.
	const layoutInfo = options.get(EditorOption.layoutInfo);
	const wrappingColumn = layoutInfo.wrappingColumn;
	let textAreaWrapping: boolean = false;
	let textAreaWidth: number = 0;
	if (wrappingColumn !== -1 && accessibilitySupport !== AccessibilitySupport.Disabled) {
		const fontInfo = options.get(EditorOption.fontInfo);
		textAreaWrapping = true;
		textAreaWidth = Math.round(wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
	} else {
		textAreaWrapping = false;
		textAreaWidth = (canUseZeroSizeTextarea ? 0 : 1);
	}
	return {
		accessibilitySupport,
		accessibilityPageSize,
		textAreaWrapping,
		textAreaWidth
	};
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
