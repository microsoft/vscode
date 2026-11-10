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
 */
export function applyScreenshotToolEdit(attachmentModel: ChatAttachmentModel, attachmentId: string, edit: IScreenshotToolEdit, screenshotToolService: IScreenshotToolService): void {
	const attachment = attachmentModel.attachments.find(candidate => candidate.id === attachmentId);
	if (!attachment || !isImageVariableEntry(attachment)) {
		return;
	}
	screenshotToolService.registerEditableAttachment(attachmentId, { original: edit.original, annotationState: edit.annotationState });
	const { data, mimeType } = getScreenshotToolImageData(edit.image);
	attachmentModel.updateContext([], [{ ...attachment, value: data.buffer, mimeType }]);
}
