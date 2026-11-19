/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { triggerUpload } from '../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { extname } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IChatAttachmentResolveService } from '../../../../workbench/contrib/chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatContextValueItem } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatPasteAttachmentMetadata, IChatRequestVariableEntry, OmittedState, toPasteVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { CHAT_ATTACHABLE_IMAGE_MIME_TYPES, getAttachableImageExtension } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { detectEncodingFromBuffer, UTF16be, UTF16le } from '../../../../workbench/services/textfile/common/encoding.js';

const maxDeviceAttachmentSize = 30 * ByteSize.MB;

export function getMobileFileAttachmentAccessibilityHelp(): string {
	return localize('mobileFileAttachments.help', "In Add Context, choose Photos for images, or Files for photos and text files from your device. Photos requests PNG, JPEG, GIF, or WebP from the system picker. Each file must be at most 30 MB. Binary documents such as PDFs are not supported by this device picker. Selecting files adds them to the draft without sending it or opening an editor. Activate an attachment to preview it, or use its Remove button to detach it. Canceling the device picker returns focus to the input. To attach a workspace file instead, search for it in Add Context.");
}

export class MobileFileContextValuePick implements IChatContextValueItem {
	readonly type = 'valuePick';
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly ordinal: number;

	constructor(
		private readonly source: 'files' | 'photos',
		private readonly pickFiles: typeof triggerUpload = triggerUpload,
		@IChatAttachmentResolveService private readonly attachmentResolveService: IChatAttachmentResolveService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		this.label = source === 'photos' ? localize('mobileFileAttachments.photos', "Photos...") : localize('mobileFileAttachments.files', "Files...");
		this.icon = source === 'photos' ? Codicon.fileMedia : Codicon.file;
		this.ordinal = source === 'photos' ? 901 : 900;
	}

	isEnabled(widget: IChatWidget): boolean {
		return !!(widget.attachmentCapabilities.supportsImageAttachments || (this.source === 'files' && widget.attachmentCapabilities.supportsFileAttachments));
	}

	async asAttachment(widget: IChatWidget): Promise<IChatRequestVariableEntry[] | undefined> {
		try {
			const imagesOnly = this.source === 'photos' || !widget.attachmentCapabilities.supportsFileAttachments;
			const files = await this.pickFiles(imagesOnly ? [
				...new Set(Object.values(CHAT_ATTACHABLE_IMAGE_MIME_TYPES)),
				...Object.keys(CHAT_ATTACHABLE_IMAGE_MIME_TYPES).map(extension => `.${extension}`),
			].join(',') : undefined);
			if (!files?.length) {
				return undefined;
			}

			const checkAttachmentSupport = (name: string, isImage: boolean): boolean => {
				if (isImage ? widget.attachmentCapabilities.supportsImageAttachments : widget.attachmentCapabilities.supportsFileAttachments) {
					return true;
				}
				this.warnUnsupported(name);
				return false;
			};
			const attachments: IChatRequestVariableEntry[] = [];
			for (const file of Array.from(files)) {
				try {
					if (file.size > maxDeviceAttachmentSize) {
						this.notificationService.warn(localize('mobileFileAttachments.tooLarge', "Could not attach {0}. Choose a file no larger than 30 MB.", file.name));
						continue;
					}

					const mimeType = CHAT_ATTACHABLE_IMAGE_MIME_TYPES[extname(file.name).slice(1).toLowerCase()] || file.type || getMediaMime(file.name);
					const isImage = !!mimeType && !!getAttachableImageExtension(mimeType);
					if (this.source === 'photos' && !isImage) {
						this.warnUnsupported(file.name);
						continue;
					}
					if (!checkAttachmentSupport(file.name, isImage)) {
						continue;
					}
					if (!isImage && ((mimeType?.startsWith('image/') && mimeType !== 'image/svg+xml') || mimeType?.startsWith('audio/') || mimeType?.startsWith('video/') || mimeType === 'application/pdf')) {
						this.warnUnsupported(file.name);
						continue;
					}

					const data = new Uint8Array(await file.arrayBuffer());
					let resolved: IChatRequestVariableEntry[];
					if (isImage) {
						resolved = await this.attachmentResolveService.resolveImageAttachContext([{
							name: file.name,
							data,
							mimeType,
							omittedState: mimeType === 'image/gif' ? OmittedState.Partial : OmittedState.NotOmitted,
						}]);
					} else {
						const detected = detectEncodingFromBuffer({ buffer: VSBuffer.wrap(data), bytesRead: data.byteLength });
						if (detected.seemsBinary) {
							this.warnUnsupported(file.name);
							continue;
						}
						const encoding = detected.encoding === UTF16le ? 'utf-16le' : detected.encoding === UTF16be ? 'utf-16be' : 'utf-8';
						const text = new TextDecoder(encoding, { fatal: true }).decode(data);
						resolved = [toPasteVariableEntry(file.name, text, {
							icon: Codicon.file,
							language: 'plaintext',
							_meta: {
								[ChatPasteAttachmentMetadata.FileSnapshot]: true,
								[ChatPasteAttachmentMetadata.TextArtifact]: true,
							},
						})];
					}
					if (!resolved.length) {
						this.notificationService.warn(localize('mobileFileAttachments.unresolved', "Could not attach {0}.", file.name));
						continue;
					}
					attachments.push(...resolved);
				} catch (error) {
					this.notificationService.error(localize('mobileFileAttachments.failed', "Could not attach {0}: {1}", file.name, toErrorMessage(error)));
				}
			}
			// A later file read can change which earlier selections this chat accepts.
			return attachments.filter(entry => checkAttachmentSupport(entry.name, entry.kind === 'image'));
		} catch (error) {
			this.notificationService.error(localize('mobileFileAttachments.dialogFailed', "Could not open the file picker: {0}", toErrorMessage(error)));
			return undefined;
		} finally {
			widget.focusInput();
		}
	}

	private warnUnsupported(name: string): void {
		this.notificationService.warn(localize('mobileFileAttachments.unsupported', "Could not attach {0}. Choose a text file or a PNG, JPEG, GIF, or WebP image supported by this chat.", name));
	}
}
