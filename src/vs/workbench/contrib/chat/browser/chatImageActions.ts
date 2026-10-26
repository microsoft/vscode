/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getWindow } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { encodeImageAsPng } from '../../mediaPreview/browser/imageViewer.js';

export function createChatImageCopyActions(accessor: ServicesAccessor, widget: HTMLElement, resource?: URI, readData?: () => Promise<Uint8Array>, mimeType?: string): () => IAction[] {
	const clipboardService = accessor.get(IClipboardService);
	const notificationService = accessor.get(INotificationService);
	const requestService = accessor.get(IRequestService);
	const webWorkerService = accessor.get(IWebWorkerService);
	const labelService = accessor.get(ILabelService);
	const webContentExtractorService = accessor.get(ISharedWebContentExtractorService);
	return () => {
		// eslint-disable-next-line no-restricted-syntax
		const image = widget instanceof HTMLImageElement || widget instanceof getWindow(widget).HTMLImageElement ? widget : widget.querySelector('img');
		const canCopy = !!readData || !!image?.complete && image.naturalWidth > 0;

		const readPng = async () => {
			if (!readData && image && !/^https?:/.test(image.currentSrc || image.src)) {
				return encodeImageAsPng(image, webWorkerService);
			}

			let bytes: Uint8Array;
			let imageMimeType = mimeType ?? (resource && getMediaMime(resource.path));
			if (readData) {
				bytes = await readData();
			} else if (image?.src) {
				const url = image.currentSrc || image.src;
				const extracted = await webContentExtractorService.readImageWithMetadata(URI.parse(url), CancellationToken.None);
				if (extracted) {
					bytes = extracted.data.buffer;
					imageMimeType = extracted.mimeType;
				} else {
					let context: IRequestContext;
					try {
						context = await requestService.request({ url, type: 'GET', callSite: 'chat.copyImage', logUrl: false }, CancellationToken.None);
					} catch (error) {
						throw new Error(localize('chat.copyImage.browserAccess', "Unable to read the image. In a browser, the image server must allow cross-origin access. Try opening the chat in the desktop application. {0}", toErrorMessage(error)));
					}
					if (context.res.statusCode !== 200) {
						throw new Error(localize('chat.copyImage.httpError', "Image request failed ({0}).", context.res.statusCode));
					}
					const contentType = context.res.headers['content-type'] ?? context.res.headers['Content-Type'];
					imageMimeType = (Array.isArray(contentType) ? contentType[0] : contentType)?.split(';', 1)[0].trim();
					bytes = (await streamToBuffer(context.stream)).buffer;
				}
			} else {
				throw new Error(localize('chat.copyImage.unavailable', "The image is not available."));
			}

			const source = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: imageMimeType === 'image/svg' ? 'image/svg+xml' : imageMimeType }));
			const decoded = $<HTMLImageElement>('img', { src: source });
			try {
				await decoded.decode();
				return await encodeImageAsPng(decoded, webWorkerService);
			} finally {
				URL.revokeObjectURL(source);
			}
		};

		const actions = [toAction({
			id: 'workbench.action.chat.copyImage',
			label: localize('chat.copyImage', "Copy Image"),
			enabled: canCopy,
			run: async () => {
				try {
					await clipboardService.writeImage(readPng());
					status(localize('chat.copyImage.success', "Image copied to clipboard"));
				} catch (error) {
					notificationService.error(localize('chat.copyImage.error', "Failed to copy image: {0}", toErrorMessage(error)));
				}
			},
		})];

		if (resource && [Schemas.file, Schemas.vscodeRemote, AGENT_HOST_SCHEME].includes(resource.scheme)) {
			actions.push(toAction({
				id: 'workbench.action.chat.copyImagePath',
				label: localize('chat.copyImagePath', "Copy Image Path"),
				run: () => clipboardService.writeText(labelService.getUriLabel(resource, { noPrefix: true })),
			}));
		}
		return actions;
	};
}
