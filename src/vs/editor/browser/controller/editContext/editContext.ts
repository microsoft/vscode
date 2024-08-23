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
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as nls from 'vs/nls';
import { Color } from 'vs/base/common/color';
import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import { IViewModel } from 'vs/editor/common/viewModel';
import { Mimes } from 'vs/base/common/mime';

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

export function ensureClipboardGetsEditorSelection(e: ClipboardEvent, dataToCopy: ClipboardDataToCopy): void {
	const storedMetadata: ClipboardStoredMetadata = {
		version: 1,
		isFromEmptySelection: dataToCopy.isFromEmptySelection,
		multicursorText: dataToCopy.multicursorText,
		mode: dataToCopy.mode
	};
	InMemoryClipboardMetadataManager.INSTANCE.set(
		// When writing "LINE\r\n" to the clipboard and then pasting,
		// Firefox pastes "LINE\n", so let's work around this quirk
		(browser.isFirefox ? dataToCopy.text.replace(/\r\n/g, '\n') : dataToCopy.text),
		storedMetadata
	);
	e.preventDefault();
	if (e.clipboardData) {
		ClipboardEventUtils.setTextData(e.clipboardData, dataToCopy.text, dataToCopy.html, storedMetadata);
	}
}

export function getDataToCopy(viewModel: IViewModel, modelSelections: Range[], emptySelectionClipboard: boolean, copyWithSyntaxHighlighting: boolean): ClipboardDataToCopy {
	const rawTextToCopy = viewModel.getPlainTextToCopy(modelSelections, emptySelectionClipboard, platform.isWindows);
	const newLineCharacter = viewModel.model.getEOL();

	const isFromEmptySelection = (emptySelectionClipboard && modelSelections.length === 1 && modelSelections[0].isEmpty());
	const multicursorText = (Array.isArray(rawTextToCopy) ? rawTextToCopy : null);
	const text = (Array.isArray(rawTextToCopy) ? rawTextToCopy.join(newLineCharacter) : rawTextToCopy);

	let html: string | null | undefined = undefined;
	let mode: string | null = null;
	if (CopyOptions.forceCopyWithSyntaxHighlighting || (copyWithSyntaxHighlighting && text.length < 65536)) {
		const richText = viewModel.getRichTextToCopy(modelSelections, emptySelectionClipboard);
		if (richText) {
			html = richText.html;
			mode = richText.mode;
		}
	}
	return {
		isFromEmptySelection,
		multicursorText,
		text,
		html,
		mode
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

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false
};

interface InMemoryClipboardMetadata {
	lastCopiedValue: string;
	data: ClipboardStoredMetadata;
}

/**
 * Every time we write to the clipboard, we record a bit of extra metadata here.
 * Every time we read from the cipboard, if the text matches our last written text,
 * we can fetch the previous metadata.
 */
export class InMemoryClipboardMetadataManager {
	public static readonly INSTANCE = new InMemoryClipboardMetadataManager();

	private _lastState: InMemoryClipboardMetadata | null;

	constructor() {
		this._lastState = null;
	}

	public set(lastCopiedValue: string, data: ClipboardStoredMetadata): void {
		this._lastState = { lastCopiedValue, data };
	}

	public get(pastedText: string): ClipboardStoredMetadata | null {
		if (this._lastState && this._lastState.lastCopiedValue === pastedText) {
			// match!
			return this._lastState.data;
		}
		this._lastState = null;
		return null;
	}
}

export interface ClipboardDataToCopy {
	isFromEmptySelection: boolean;
	multicursorText: string[] | null | undefined;
	text: string;
	html: string | null | undefined;
	mode: string | null;
}

export interface ClipboardStoredMetadata {
	version: 1;
	isFromEmptySelection: boolean | undefined;
	multicursorText: string[] | null | undefined;
	mode: string | null;
}


export const ClipboardEventUtils = {

	getTextData(clipboardData: DataTransfer): [string, ClipboardStoredMetadata | null] {
		const text = clipboardData.getData(Mimes.text);
		let metadata: ClipboardStoredMetadata | null = null;
		const rawmetadata = clipboardData.getData('vscode-editor-data');
		if (typeof rawmetadata === 'string') {
			try {
				metadata = <ClipboardStoredMetadata>JSON.parse(rawmetadata);
				if (metadata.version !== 1) {
					metadata = null;
				}
			} catch (err) {
				// no problem!
			}
		}

		if (text.length === 0 && metadata === null && clipboardData.files.length > 0) {
			// no textual data pasted, generate text from file names
			const files: File[] = Array.prototype.slice.call(clipboardData.files, 0);
			return [files.map(file => file.name).join('\n'), null];
		}

		return [text, metadata];
	},

	setTextData(clipboardData: DataTransfer, text: string, html: string | null | undefined, metadata: ClipboardStoredMetadata): void {
		clipboardData.setData(Mimes.text, text);
		if (typeof html === 'string') {
			clipboardData.setData('text/html', html);
		}
		clipboardData.setData('vscode-editor-data', JSON.stringify(metadata));
	}
};
