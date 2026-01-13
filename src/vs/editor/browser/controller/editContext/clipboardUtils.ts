/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IViewModel } from '../../../common/viewModel.js';
import { Range } from '../../../common/core/range.js';
import { isWindows } from '../../../../base/common/platform.js';
import { Mimes } from '../../../../base/common/mime.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { EditorOption, IComputedEditorOptions } from '../../../common/config/editorOptions.js';
import { generateUuid } from '../../../../base/common/uuid.js';

export function ensureClipboardGetsEditorSelection(e: ClipboardEvent, context: ViewContext, logService: ILogService, isFirefox: boolean): void {
	const viewModel = context.viewModel;
	const options = context.configuration.options;
	let id: string | undefined = undefined;
	if (logService.getLevel() === LogLevel.Trace) {
		id = generateUuid();
	}

	const { dataToCopy, storedMetadata } = generateDataToCopyAndStoreInMemory(viewModel, options, id, isFirefox);

	// !!!!!
	// This is a workaround for what we think is an Electron bug where
	// execCommand('copy') does not always work (it does not fire a clipboard event)
	// !!!!!
	// We signal that we have executed a copy command
	CopyOptions.electronBugWorkaroundCopyEventHasFired = true;

	e.preventDefault();
	if (e.clipboardData) {
		ClipboardEventUtils.setTextData(e.clipboardData, dataToCopy.text, dataToCopy.html, storedMetadata);
	}
	logService.trace('ensureClipboardGetsEditorSelection with id : ', id, ' with text.length: ', dataToCopy.text.length);
}

export function generateDataToCopyAndStoreInMemory(viewModel: IViewModel, options: IComputedEditorOptions, id: string | undefined, isFirefox: boolean) {
	const emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
	const copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);
	const selections = viewModel.getCursorStates().map(cursorState => cursorState.modelState.selection);
	const dataToCopy = getDataToCopy(viewModel, selections, emptySelectionClipboard, copyWithSyntaxHighlighting);
	const storedMetadata: ClipboardStoredMetadata = {
		version: 1,
		id,
		isFromEmptySelection: dataToCopy.isFromEmptySelection,
		multicursorText: dataToCopy.multicursorText,
		mode: dataToCopy.mode
	};
	InMemoryClipboardMetadataManager.INSTANCE.set(
		// When writing "LINE\r\n" to the clipboard and then pasting,
		// Firefox pastes "LINE\n", so let's work around this quirk
		(isFirefox ? dataToCopy.text.replace(/\r\n/g, '\n') : dataToCopy.text),
		storedMetadata
	);
	return { dataToCopy, storedMetadata };
}

function getDataToCopy(viewModel: IViewModel, modelSelections: Range[], emptySelectionClipboard: boolean, copyWithSyntaxHighlighting: boolean): ClipboardDataToCopy {
	// Filter selections to exclude hidden areas
	const filteredSelections = filterSelectionsExcludingHiddenAreas(viewModel, modelSelections);
	
	const rawTextToCopy = viewModel.getPlainTextToCopy(filteredSelections, emptySelectionClipboard, isWindows);
	const newLineCharacter = viewModel.model.getEOL();

	const isFromEmptySelection = (emptySelectionClipboard && modelSelections.length === 1 && modelSelections[0].isEmpty());
	const multicursorText = (Array.isArray(rawTextToCopy) ? rawTextToCopy : null);
	const text = (Array.isArray(rawTextToCopy) ? rawTextToCopy.join(newLineCharacter) : rawTextToCopy);

	let html: string | null | undefined = undefined;
	let mode: string | null = null;
	if (CopyOptions.forceCopyWithSyntaxHighlighting || (copyWithSyntaxHighlighting && text.length < 65536)) {
		const richText = viewModel.getRichTextToCopy(filteredSelections, emptySelectionClipboard);
		if (richText) {
			html = richText.html;
			mode = richText.mode;
		}
	}
	const dataToCopy: ClipboardDataToCopy = {
		isFromEmptySelection,
		multicursorText,
		text,
		html,
		mode
	};
	return dataToCopy;
}

/**
 * Filters the given selection ranges to exclude any hidden areas.
 * If there are no hidden areas, returns the original selections.
 * @param viewModel The view model containing hidden areas information
 * @param selections The original selection ranges
 * @returns Filtered selection ranges with hidden areas excluded
 */
function filterSelectionsExcludingHiddenAreas(viewModel: IViewModel, selections: Range[]): Range[] {
	const hiddenAreas = viewModel.getHiddenAreas();
	
	if (hiddenAreas.length === 0) {
		return selections;
	}

	const result: Range[] = [];

	for (const selection of selections) {
		const visibleRanges = splitRangeByHiddenAreas(selection, hiddenAreas);
		result.push(...visibleRanges);
	}

	return result;
}

/**
 * Checks if a line is hidden by any hidden area.
 */
function isLineHidden(lineNumber: number, hiddenAreas: Range[]): boolean {
	return hiddenAreas.some(h =>
		lineNumber >= h.startLineNumber && lineNumber <= h.endLineNumber
	);
}

/**
 * Splits a range into visible sub-ranges by excluding hidden areas.
 * Uses a line-by-line approach to identify continuous visible ranges.
 */
function splitRangeByHiddenAreas(range: Range, hiddenAreas: Range[]): Range[] {
	const result: Range[] = [];
	let visibleStart: number | null = null;

	for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
		const hidden = isLineHidden(line, hiddenAreas);

		if (hidden) {
			// End current visible range if any
			if (visibleStart !== null) {
				const startCol = visibleStart === range.startLineNumber ? range.startColumn : 1;
				const endLine = line - 1;
				const endCol = endLine === range.endLineNumber ? range.endColumn : Number.MAX_SAFE_INTEGER;
				result.push(new Range(visibleStart, startCol, endLine, endCol));
				visibleStart = null;
			}
		} else {
			// Start or continue visible range
			if (visibleStart === null) {
				visibleStart = line;
			}
		}
	}

	// Add any remaining visible range
	if (visibleStart !== null) {
		const startCol = visibleStart === range.startLineNumber ? range.startColumn : 1;
		result.push(new Range(visibleStart, startCol, range.endLineNumber, range.endColumn));
	}

	return result;
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
	id: string | undefined;
	isFromEmptySelection: boolean | undefined;
	multicursorText: string[] | null | undefined;
	mode: string | null;
}

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false,
	electronBugWorkaroundCopyEventHasFired: false
};

interface InMemoryClipboardMetadata {
	lastCopiedValue: string;
	data: ClipboardStoredMetadata;
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
