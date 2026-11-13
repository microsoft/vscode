/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { createScreenshotToolImage, getScreenshotToolImageData, IScreenshotToolEdit, IScreenshotToolEditable, IScreenshotToolService } from '../../../screenshotTool/browser/screenshotTool.js';
import { IChatRequestVariableEntry, isImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { extractImagesFromChatVariables } from '../../common/chatImageExtraction.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';

export const ScreenshotVariableId = 'screenshot-focused-window';

export function convertBufferToScreenshotVariable(buffer: VSBuffer, mimeType?: string): IChatRequestVariableEntry {
	return {
		id: ScreenshotVariableId,
		name: localize('screenshot', 'Screenshot'),
		value: buffer.buffer,
		kind: 'image',
		...(mimeType ? { mimeType } : {}),
	};
}

/**
 * Keeps an image attached with the changes of its markup, and remembers its annotations, which its next markup restores.
 * The changes belong to that attachment, so they are dropped when it was removed or replaced meanwhile.
 */
export function applyScreenshotToolEdit(attachmentModel: ChatAttachmentModel, attachment: IChatRequestVariableEntry, edit: IScreenshotToolEdit, screenshotToolService: IScreenshotToolService): void {
	if (!isImageVariableEntry(attachment) || !attachmentModel.attachments.includes(attachment)) {
		return;
	}
	const { data, mimeType } = getScreenshotToolImageData(edit.image);
	// A marked up image is no longer the file it came from, so downloading or recalling it keeps the markup.
	const marked: IChatRequestVariableEntry = { ...attachment, value: data.buffer, mimeType, references: [] };
	// The chat input renders its attachments again as soon as they change, and looks up which ones can be edited then.
	screenshotToolService.registerEditableAttachment(marked, { original: edit.original, annotationState: edit.annotationState });
	attachmentModel.updateContext([], [marked]);
}

/**
 * Returns an attached image to mark up: as the screenshot tool remembers it, with the annotations of its earlier
 * markups, or else as it is attached, such as an image that was pasted.
 */
export function getEditableImageAttachment(attachment: IChatRequestVariableEntry | undefined, screenshotToolService: IScreenshotToolService, readFile: (uri: URI) => Promise<Uint8Array>): IScreenshotToolEditable | Promise<IScreenshotToolEditable> {
	return (attachment && screenshotToolService.getEditableAttachment(attachment)) ?? loadEditableImageAttachment(attachment, readFile);
}

async function loadEditableImageAttachment(attachment: IChatRequestVariableEntry | undefined, readFile: (uri: URI) => Promise<Uint8Array>): Promise<IScreenshotToolEditable> {
	const [image] = attachment ? extractImagesFromChatVariables([attachment]) : [];
	if (!image) {
		throw new Error('The image is no longer attached.');
	}
	const data = image.data ?? VSBuffer.wrap(await readFile(image.uri));
	return { original: await createScreenshotToolImage(data, image.mimeType), annotationState: undefined };
}
