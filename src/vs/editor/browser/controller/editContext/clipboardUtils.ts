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

/**
 * ClipboardItem requires valid "type/subtype" MIME syntax; the legacy "vscode-editor-data" label has no "/" and would cause a TypeError.
 * @see https://w3c.github.io/clipboard-apis/#dom-clipboarditem-clipboarditem
 * @see https://mimesniff.spec.whatwg.org/#parse-a-mime-type
 */
const editorDataMime = 'application/vnd.code.editor-data';

export function generateDataToCopyAndStoreInMemory(viewModel: IViewModel, id: string | undefined, isFirefox: boolean): { dataToCopy: ClipboardDataToCopy; metadata: ClipboardStoredMetadata } {
	const { dataToCopy, metadata } = generateDataToCopy(viewModel);
	storeMetadataInMemory(dataToCopy.text, metadata, isFirefox);
	return { dataToCopy, metadata };
}

function storeMetadataInMemory(textToCopy: string, metadata: ClipboardStoredMetadata, isFirefox: boolean): void {
	InMemoryClipboardMetadataManager.INSTANCE.set(
		// When writing "LINE\r\n" to the clipboard and then pasting,
		// Firefox pastes "LINE\n", so let's work around this quirk
		(isFirefox ? textToCopy.replace(/\r\n/g, '\n') : textToCopy),
		metadata
	);
}

function generateDataToCopy(viewModel: IViewModel): { dataToCopy: ClipboardDataToCopy; metadata: ClipboardStoredMetadata } {
	const emptySelectionClipboard = viewModel.getEditorOption(EditorOption.emptySelectionClipboard);
	const copyWithSyntaxHighlighting = viewModel.getEditorOption(EditorOption.copyWithSyntaxHighlighting);
	const selections = viewModel.getCursorStates().map(cursorState => cursorState.modelState.selection);
	const dataToCopy = getDataToCopy(viewModel, selections, emptySelectionClipboard, copyWithSyntaxHighlighting);
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

function getDataToCopy(viewModel: IViewModel, modelSelections: Range[], emptySelectionClipboard: boolean, copyWithSyntaxHighlighting: boolean): ClipboardDataToCopy {
	const isBlock = viewModel.getCursorColumnSelectData().isReal;
	const { sourceRanges, sourceText } = viewModel.getPlainTextToCopy(modelSelections, emptySelectionClipboard, isWindows);
	const newLineCharacter = viewModel.model.getEOL();

	const isFromEmptySelection = (emptySelectionClipboard && modelSelections.length === 1 && modelSelections[0].isEmpty());
	const multicursorText = (Array.isArray(sourceText) ? sourceText : null);
	const text = (Array.isArray(sourceText) ? sourceText.join(newLineCharacter) : sourceText);

	let html: string | null | undefined = undefined;
	let mode: string | null = null;
	if (CopyOptions.forceCopyWithSyntaxHighlighting || (copyWithSyntaxHighlighting && sourceText.length < 65536)) {
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
	forceCopyWithSyntaxHighlighting: false,
	electronBugWorkaroundCopyEventHasFired: false
};

interface InMemoryClipboardMetadata {
	lastCopiedValue: string;
	data: ClipboardStoredMetadata;
}

const ClipboardEventUtils = {

	getTextData(clipboardData: IReadableClipboardData | DataTransfer, getFilePath: (file: File) => string | undefined): [string, ClipboardStoredMetadata | null] {
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
		clipboardData.setData('vscode-editor-data', JSON.stringify(metadata));
	}
};

function getClipboardApiTextData(clipboardData: DataTransfer, getFilePath: (file: File) => string | undefined): [string, ClipboardStoredMetadata | null] {
	return ClipboardEventUtils.getTextData({
		...createReadableClipboardData(clipboardData),
		getData: type => type === 'vscode-editor-data'
			? clipboardData.getData(editorDataMime) || clipboardData.getData(type)
			: clipboardData.getData(type),
	}, getFilePath);
}

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
	const { dataToCopy, metadata } = generateDataToCopy(context.viewModel);
	let handled = false;
	return {
		isCut,
		clipboardData: {
			setData: (type: string, value: string) => {
				e.clipboardData?.setData(type, value);
			},
		},
		dataToCopy,
		ensureClipboardGetsEditorData: (): void => {
			e.preventDefault();
			if (e.clipboardData) {
				ClipboardEventUtils.setTextData(e.clipboardData, dataToCopy.text, dataToCopy.html, metadata);
			}
			storeMetadataInMemory(dataToCopy.text, metadata, isFirefox);
			logService.trace('ensureClipboardGetsEditorSelection with id : ', metadata.id, ' with text.length: ', dataToCopy.text.length);
		},
		setHandled: () => {
			handled = true;
			e.preventDefault();
			e.stopImmediatePropagation();
		},
		get isHandled() { return handled; },
	};
}

/**
 * Creates copy/cut data for the Clipboard API without a DOM event.
 */
export function createClipboardCopyEventFromData(clipboardData: IWritableClipboardData, isCut: boolean, viewModel: IViewModel, logService: ILogService, isFirefox: boolean): IClipboardCopyEvent {
	const { dataToCopy, metadata } = generateDataToCopy(viewModel);
	let handled = false;
	return {
		isCut,
		clipboardData,
		dataToCopy,
		ensureClipboardGetsEditorData: (): void => {
			ClipboardEventUtils.setTextData({
				setData: (type, value) => clipboardData.setData(type === 'vscode-editor-data' ? editorDataMime : type, value),
			}, dataToCopy.text, dataToCopy.html, metadata);
			storeMetadataInMemory(dataToCopy.text, metadata, isFirefox);
			logService.trace('ensureClipboardGetsEditorSelection with id : ', metadata.id, ' with text.length: ', dataToCopy.text.length);
		},
		setHandled: () => {
			handled = true;
		},
		get isHandled() { return handled; },
	};
}

/**
 * Creates an IClipboardPasteEvent from a DOM ClipboardEvent.
 */
export function createClipboardPasteEvent(e: ClipboardEvent, getFilePath: (file: File) => string | undefined = getPathForFile): IClipboardPasteEvent {
	let handled = false;
	let [text, metadata] = e.clipboardData ? ClipboardEventUtils.getTextData(e.clipboardData, getFilePath) : ['', null];
	if (!metadata && e.clipboardData?.getData(editorDataMime)) {
		[text, metadata] = getClipboardApiTextData(e.clipboardData, getFilePath);
	}
	metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
	return {
		clipboardData: createReadableClipboardData(e.clipboardData),
		metadata,
		text,
		toExternalVSDataTransfer: () => e.clipboardData ? toExternalVSDataTransfer(e.clipboardData) : undefined,
		browserEvent: e,
		setHandled: () => {
			handled = true;
			e.preventDefault();
			e.stopImmediatePropagation();
		},
		get isHandled() { return handled; },
	};
}

/**
 * Creates paste data from normalized Clipboard API formats without a DOM event.
 */
export function createClipboardPasteEventFromData(clipboardData: DataTransfer, getFilePath: (file: File) => string | undefined = getPathForFile): IClipboardPasteEvent {
	let handled = false;
	let [text, metadata] = getClipboardApiTextData(clipboardData, getFilePath);
	metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
	return {
		clipboardData: createReadableClipboardData(clipboardData),
		metadata,
		text,
		toExternalVSDataTransfer: () => toExternalVSDataTransfer(clipboardData),
		browserEvent: undefined,
		setHandled: () => {
			handled = true;
		},
		get isHandled() { return handled; },
	};
}

export function createReadableClipboardData(dataTransfer: DataTransfer | undefined | null): IReadableClipboardData {
	return {
		types: Array.from(dataTransfer?.types ?? []),
		files: Array.prototype.slice.call(dataTransfer?.files ?? [], 0),
		getData: (type: string) => dataTransfer?.getData(type) ?? '',
	};
}

export function createWritableClipboardData(dataTransfer: DataTransfer | undefined | null): IWritableClipboardData {
	return {
		setData: (type: string, value: string) => dataTransfer?.setData(type, value),
	};
}
