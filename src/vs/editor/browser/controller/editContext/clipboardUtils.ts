/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IViewModel } from '../../../common/viewModel.js';
import { Range } from '../../../common/core/range.js';
import { isWindows } from '../../../../base/common/platform.js';

export function getDataToCopy(viewModel: IViewModel, modelSelections: Range[], emptySelectionClipboard: boolean, copyWithSyntaxHighlighting: boolean): ClipboardDataToCopy {
	const rawTextToCopy = viewModel.getPlainTextToCopy(modelSelections, emptySelectionClipboard, isWindows);
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

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false
};

interface InMemoryClipboardMetadata {
	lastCopiedValue: string;
	data: ClipboardStoredMetadata;
}
