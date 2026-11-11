/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { localize } from '../../../../../nls.js';
import { getScreenshotToolImageData, IScreenshotToolEdit, IScreenshotToolService } from '../../../screenshotTool/browser/screenshotTool.js';
import { IChatRequestVariableEntry, isImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
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
