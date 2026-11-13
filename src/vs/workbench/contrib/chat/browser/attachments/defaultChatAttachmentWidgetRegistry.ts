/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { createScreenshotToolImage, getScreenshotToolImageData, IScreenshotToolEdit, IScreenshotToolEditable, IScreenshotToolService, ScreenshotToolSurface, toImageCarouselMarkUp } from '../../../screenshotTool/browser/screenshotTool.js';
import { IChatRequestVariableEntry, isImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { extractImagesFromChatVariables } from '../../common/chatImageExtraction.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { ChatAttachmentWidgetRegistry, IChatImageAttachmentEditor } from './chatAttachmentWidgetRegistry.js';

/** Supplies image editing before restored attachments first render, without a late contribution. */
export class DefaultChatAttachmentWidgetRegistry extends ChatAttachmentWidgetRegistry {
	readonly imageEditor: IChatImageAttachmentEditor | undefined;

	constructor(
		@IScreenshotToolService screenshotToolService: IScreenshotToolService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super();
		if (screenshotToolService.isSupported) {
			const readFile = async (uri: URI) => (await fileService.readFile(uri)).value.buffer;
			this.imageEditor = {
				edit: async (attachmentModel, attachment) => {
					try {
						const screenshot = await getEditableImageAttachment(attachment, screenshotToolService, readFile);
						const edit = await screenshotToolService.edit(screenshot, ScreenshotToolSurface.Chat);
						if (edit) {
							applyScreenshotToolEdit(attachmentModel, attachment, edit, screenshotToolService);
						}
					} catch (error) {
						logService.error('[ChatInputPart] Marking up an attached image failed:', error);
					}
				},
				createMarkUp: (container, attachmentModel, attachmentId) => {
					// An earlier markup may have replaced the attachment since the carousel opened.
					const attachment = attachmentModel.attachments.find(candidate => candidate.id === attachmentId);
					const screenshot = getEditableImageAttachment(attachment, screenshotToolService, readFile);
					const markUp = screenshotToolService.markUp(container, screenshot, ScreenshotToolSurface.Chat);
					void markUp.result.then(edit => {
						if (edit && attachment) {
							applyScreenshotToolEdit(attachmentModel, attachment, edit, screenshotToolService);
						}
					}, error => logService.error('[ChatImageCarouselService] Marking up an attached image failed:', error));
					return toImageCarouselMarkUp(markUp);
				},
			};
		}
	}
}

function applyScreenshotToolEdit(attachmentModel: ChatAttachmentModel, attachment: IChatRequestVariableEntry, edit: IScreenshotToolEdit, screenshotToolService: IScreenshotToolService): void {
	if (!isImageVariableEntry(attachment) || !attachmentModel.attachments.includes(attachment)) {
		return;
	}
	const { data, mimeType } = getScreenshotToolImageData(edit.image);
	// Downloads and recalled input must use the marked-up image, not its original file.
	const marked: IChatRequestVariableEntry = { ...attachment, value: data.buffer, mimeType, references: [] };
	// Updating the model immediately re-renders its attachments, so register their annotations first.
	screenshotToolService.registerEditableAttachment(marked, { original: edit.original, annotationState: edit.annotationState });
	attachmentModel.updateContext([], [marked]);
}

function getEditableImageAttachment(attachment: IChatRequestVariableEntry | undefined, screenshotToolService: IScreenshotToolService, readFile: (uri: URI) => Promise<Uint8Array>): IScreenshotToolEditable | Promise<IScreenshotToolEditable> {
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
