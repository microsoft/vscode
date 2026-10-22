/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IViewModel } from '../../../common/viewModel.js';
import { Range } from '../../../common/core/range.js';
import { isWindows } from '../../../../base/common/platform.js';
import { Mimes } from '../../../../base/common/mime.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { toExternalVSDataTransfer } from '../../dataTransfer.js';

const editorDataMime = 'application/vnd.code.editor-data';

function storeMetadataInMemory(textToCopy: string, metadata: ClipboardStoredMetadata, isFirefox: boolean): void {
	InMemoryClipboardMetadataManager.INSTANCE.set(
		// When writing "LINE\r\n" to the clipboard and then pasting,
		// Firefox pastes "LINE\n", so let's work around this quirk
		(isFirefox ? textToCopy.replace(/\r\n/g, '\n') : textToCopy),
		metadata
	);
}

function generateDataToCopy(viewModel: IViewModel, forceCopyWithSyntaxHighlighting: boolean): { dataToCopy: ClipboardDataToCopy; metadata: ClipboardStoredMetadata } {
	const emptySelectionClipboard = viewModel.getEditorOption(EditorOption.emptySelectionClipboard);
	const copyWithSyntaxHighlighting = viewModel.getEditorOption(EditorOption.copyWithSyntaxHighlighting);
	const selections = viewModel.getCursorStates().map(cursorState => cursorState.modelState.selection);
	const dataToCopy = getDataToCopy(viewModel, selections, emptySelectionClipboard, copyWithSyntaxHighlighting, forceCopyWithSyntaxHighlighting);
	const metadata: ClipboardStoredMetadata = {
		version: 1,
		id: generateUuid(),
		isFromEmptySelection: dataToCopy.isFromEmptySelection,
		isBlock: dataToCopy.isBlock,
		multicursorText: dataToCopy.multicursorText,
		mode: dataToCopy.mode
	};
	return { dataToCopy, metadata };
}

function getDataToCopy(viewModel: IViewModel, modelSelections: Range[], emptySelectionClipboard: boolean, copyWithSyntaxHighlighting: boolean, forceCopyWithSyntaxHighlighting: boolean): ClipboardDataToCopy {
	const isBlock = viewModel.getCursorColumnSelectData().isReal;
	const { sourceRanges, sourceText } = viewModel.getPlainTextToCopy(modelSelections, emptySelectionClipboard, isWindows);
	const newLineCharacter = viewModel.model.getEOL();

	const isFromEmptySelection = (emptySelectionClipboard && modelSelections.length === 1 && modelSelections[0].isEmpty());
	const multicursorText = (Array.isArray(sourceText) ? sourceText : null);
	const text = (Array.isArray(sourceText) ? sourceText.join(newLineCharacter) : sourceText);

	let html: string | null | undefined = undefined;
	let mode: string | null = null;
	if (forceCopyWithSyntaxHighlighting || CopyOptions.forceCopyWithSyntaxHighlighting || (copyWithSyntaxHighlighting && sourceText.length < 65536)) {
		const richText = viewModel.getRichTextToCopy(modelSelections, emptySelectionClipboard);
		if (richText) {
			html = richText.html;
			mode = richText.mode;
		}
	}
	const dataToCopy: ClipboardDataToCopy = {
		isFromEmptySelection,
		isBlock,
		sourceRanges,
		multicursorText,
		text,
		html,
		mode
	};
	return dataToCopy;
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
	isBlock: boolean;
	sourceRanges: Range[];
	multicursorText: string[] | null | undefined;
	text: string;
	html: string | null | undefined;
	mode: string | null;
}

export interface ClipboardStoredMetadata {
	version: 1;
	id: string | undefined;
	isFromEmptySelection: boolean | undefined;
	isBlock: boolean | undefined;
	multicursorText: string[] | null | undefined;
	mode: string | null;
}

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false
};

interface InMemoryClipboardMetadata {
	lastCopiedValue: string;
	data: ClipboardStoredMetadata;
}

const ClipboardEventUtils = {

	getTextData(clipboardData: IReadableClipboardData | DataTransfer, getFilePath: (file: File) => string | undefined): [string, ClipboardStoredMetadata | null] {
		const text = clipboardData.getData(Mimes.text);
		let metadata: ClipboardStoredMetadata | null = null;
		const rawmetadata = clipboardData.getData(clipboardData.types.includes(editorDataMime) ? editorDataMime : 'vscode-editor-data');
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
			// No textual data pasted. This is what Chromium does when files copied in a file manager are pasted:
			// it only exposes the files and withholds the text (which on Linux contains their full paths).
			// Generate text from the file paths, or from the file names when the paths are not available (e.g. web).
			const files: File[] = Array.prototype.slice.call(clipboardData.files, 0);
			return [files.map(file => getFilePath(file) || file.name).join('\n'), null];
		}
		return [text, metadata];
	},

	setTextData(clipboardData: IWritableClipboardData, text: string, html: string | null | undefined, metadata: ClipboardStoredMetadata): void {
		clipboardData.setData(Mimes.text, text);
		if (typeof html === 'string') {
			clipboardData.setData('text/html', html);
		}
		clipboardData.setData(editorDataMime, JSON.stringify(metadata));
	}
};

/**
 * Readable clipboard data for paste operations.
 */
export interface IReadableClipboardData {
	/**
	 * All MIME types present in the clipboard.
	 */
	types: string[];

	/**
	 * Files from the clipboard (for paste operations).
	 */
	readonly files: readonly File[];

	/**
	 * Get data for a specific MIME type.
	 */
	getData(type: string): string;
}

/**
 * Writable clipboard data for copy/cut operations.
 */
export interface IWritableClipboardData {
	/**
	 * Set data for a specific MIME type.
	 */
	setData(type: string, value: string): void;
}

/**
 * Event data for clipboard copy/cut events.
 */
export interface IClipboardCopyEvent {
	/**
	 * Whether this is a cut operation.
	 */
	readonly isCut: boolean;

	/**
	 * The clipboard data to write to.
	 */
	readonly clipboardData: IWritableClipboardData;

	/**
	 * The data to be copied to the clipboard.
	 */
	readonly dataToCopy: ClipboardDataToCopy;

	readonly metadata: ClipboardStoredMetadata;

	/**
	 * Ensure that the clipboard gets the editor data.
	 */
	ensureClipboardGetsEditorData(): void;

	/**
	 * Signal that the event has been handled and default processing should be skipped.
	 */
	setHandled(): void;

	/**
	 * Whether the event has been marked as handled.
	 */
	readonly isHandled: boolean;
}

/**
 * Event data for clipboard paste events.
 */
export interface IClipboardPasteEvent {
	/**
	 * The clipboard data being pasted.
	 */
	readonly clipboardData: IReadableClipboardData;

	/**
	 * The metadata stored alongside the clipboard data, if any.
	 */
	readonly metadata: ClipboardStoredMetadata | null;

	/**
	 * The text content being pasted.
	 */
	readonly text: string;

	/**
	 * The underlying DOM event, if available.
	 * @deprecated Use clipboardData instead. This is provided for backward compatibility.
	 */
	readonly browserEvent: ClipboardEvent | undefined;

	toExternalVSDataTransfer(): VSDataTransfer | undefined;

	/**
	 * Signal that the event has been handled and default processing should be skipped.
	 */
	setHandled(): void;

	/**
	 * Whether the event has been marked as handled.
	 */
	readonly isHandled: boolean;
}

/**
 * Creates an IClipboardCopyEvent from a DOM ClipboardEvent.
 */
export function createClipboardCopyEvent(e: ClipboardEvent, isCut: boolean, context: ViewContext, logService: ILogService, isFirefox: boolean): IClipboardCopyEvent {
	return createClipboardCopyEventFromData({
		setData: (type, value) => e.clipboardData?.setData(type === editorDataMime ? 'vscode-editor-data' : type, value)
	}, isCut, context.viewModel, logService, isFirefox, e);
}

export function createClipboardCopyEventFromData(clipboardData: IWritableClipboardData, isCut: boolean, viewModel: IViewModel, logService: ILogService, isFirefox: boolean, browserEvent?: ClipboardEvent, forceCopyWithSyntaxHighlighting = false): IClipboardCopyEvent {
	const { dataToCopy, metadata } = generateDataToCopy(viewModel, forceCopyWithSyntaxHighlighting);
	let handled = false;
	return {
		isCut,
		clipboardData,
		dataToCopy,
		metadata,
		ensureClipboardGetsEditorData: (): void => {
			browserEvent?.preventDefault();
			ClipboardEventUtils.setTextData(clipboardData, dataToCopy.text, dataToCopy.html, metadata);
			storeMetadataInMemory(dataToCopy.text, metadata, isFirefox);
			logService.trace('ensureClipboardGetsEditorSelection with id : ', metadata.id, ' with text.length: ', dataToCopy.text.length);
		},
		setHandled: () => {
			handled = true;
			browserEvent?.preventDefault();
			browserEvent?.stopImmediatePropagation();
		},
		get isHandled() { return handled; },
	};
}

/**
 * Creates an IClipboardPasteEvent from a DOM ClipboardEvent.
 */
export function createClipboardPasteEvent(e: ClipboardEvent, getFilePath: (file: File) => string | undefined = getPathForFile): IClipboardPasteEvent {
	return createClipboardPasteEventFromData(e.clipboardData, e, getFilePath);
}

export function createClipboardPasteEventFromData(clipboardData: DataTransfer | null, browserEvent?: ClipboardEvent, getFilePath: (file: File) => string | undefined = getPathForFile): IClipboardPasteEvent {
	let handled = false;
	const readableData = createReadableClipboardData(clipboardData);
	let [text, metadata] = clipboardData ? ClipboardEventUtils.getTextData(readableData, getFilePath) : ['', null];
	metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
	return {
		clipboardData: readableData,
		metadata,
		text,
		toExternalVSDataTransfer: () => {
			if (!clipboardData) {
				return undefined;
			}
			const data = toExternalVSDataTransfer(clipboardData);
			for (const [mime, item] of [...data]) {
				if (mime.startsWith('web ')) {
					data.delete(mime);
					const unprefixedMime = mime.substring(4);
					if (!data.has(unprefixedMime)) {
						data.replace(unprefixedMime, item);
					}
				}
			}
			return data;
		},
		browserEvent,
		setHandled: () => {
			handled = true;
			browserEvent?.preventDefault();
			browserEvent?.stopImmediatePropagation();
		},
		get isHandled() { return handled; },
	};
}

export function createReadableClipboardData(dataTransfer: DataTransfer | undefined | null): IReadableClipboardData {
	const types = Array.from(dataTransfer?.types ?? []);
	return {
		types: Array.from(new Set(types.map(type => type.startsWith('web ') ? type.substring(4) : type))),
		files: Array.prototype.slice.call(dataTransfer?.files ?? [], 0),
		getData: (type: string) => {
			const mime = type.toLowerCase();
			const normalizedMime = mime === 'text' ? Mimes.text : mime === 'url' ? Mimes.uriList : mime;
			return dataTransfer?.getData(types.includes(normalizedMime) ? normalizedMime : `web ${normalizedMime}`) ?? '';
		},
	};
}

export function createWritableClipboardData(dataTransfer: DataTransfer | undefined | null): IWritableClipboardData {
	return {
		setData: (type: string, value: string) => dataTransfer?.setData(type, value),
	};
}
