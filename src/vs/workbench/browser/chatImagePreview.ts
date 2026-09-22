/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType } from '../../base/browser/dom.js';
import { raceTimeout } from '../../base/common/async.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { LRUCache } from '../../base/common/map.js';
import { getMediaMime } from '../../base/common/mime.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { registerOpenEditorListeners } from '../../platform/editor/browser/editor.js';
import './media/chatImagePreview.css';

const CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE = 768;
const THUMBNAIL_DECODE_TIMEOUT_MS = 10_000;
const thumbnailCache = new LRUCache<string, Promise<Blob | undefined>>(50);

/** The image hover shared by chat attachments and session image references. */
export function createChatImageHoverContent(
	resource: URI | undefined,
	fullName: string,
	buffer: ArrayBuffer | Uint8Array,
	cacheKey: string,
	onContentsChanged?: () => void,
	clickHandler?: () => void,
	onImageUrl?: (url: string, isThumbnail: boolean, image: HTMLImageElement) => void,
	imageAlt = '',
	showImageInHover = true,
	onImageError?: () => void,
): { readonly element: HTMLElement; readonly disposable: IDisposable } {
	const disposables = new DisposableStore();
	const hoverElement = $('.chat-image-hover.chat-attached-context-hover');
	const hoverImage = $<HTMLImageElement>('img.chat-image-hover-image.chat-attached-context-image', { alt: imageAlt });
	if (showImageInHover) {
		const imageContainer = $('.chat-image-hover-image-container.chat-attached-context-image-container', undefined, hoverImage);
		hoverElement.appendChild(imageContainer);
		if (clickHandler) {
			imageContainer.classList.add('clickable');
			imageContainer.tabIndex = 0;
			imageContainer.role = 'button';
			imageContainer.ariaLabel = localize('chat.openImagePreview', "Open in Images Preview");
			disposables.add(registerOpenEditorListeners(imageContainer, async () => clickHandler()));
		}
	}

	if (resource) {
		const location = $('.chat-image-hover-location.chat-attached-context-url', undefined, fullName);
		hoverElement.append($('.chat-image-hover-location-separator.chat-attached-context-url-separator'), location);
	}

	const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const mimeType = getMediaMime(resource?.path ?? fullName) ?? 'application/octet-stream';
	const previewImageUrl = disposables.add(new MutableDisposable<IDisposable>());
	if (onImageError) {
		disposables.add(addDisposableListener(hoverImage, EventType.ERROR, onImageError));
	}
	void getOrCreateImageThumbnail(cacheKey, data, CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE, mimeType).then(thumbnail => {
		if (disposables.isDisposed) {
			return;
		}
		const source = thumbnail ?? new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType });
		const url = URL.createObjectURL(source);
		previewImageUrl.value = toDisposable(() => URL.revokeObjectURL(url));
		disposables.add(addDisposableListener(hoverImage, EventType.LOAD, () => onContentsChanged?.()));
		hoverImage.src = url;
		onImageUrl?.(url, !!thumbnail, hoverImage);
	});

	return { element: hoverElement, disposable: disposables };
}

function createImageThumbnail(data: Uint8Array, maxSize: number, mimeType: string): Promise<Blob | undefined> {
	return new Promise(resolve => {
		const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType });
		const image = $<HTMLImageElement>('img');
		const url = URL.createObjectURL(blob);
		image.src = url;
		image.onload = () => {
			URL.revokeObjectURL(url);
			const scaleFactor = Math.min(1, maxSize / Math.max(image.width, image.height));
			const canvas = $<HTMLCanvasElement>('canvas');
			canvas.width = Math.max(1, Math.round(image.width * scaleFactor));
			canvas.height = Math.max(1, Math.round(image.height * scaleFactor));
			const context = canvas.getContext('2d');
			if (!context) {
				resolve(undefined);
				return;
			}
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			const outputMimeType = data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF ? 'image/jpeg' : 'image/png';
			canvas.toBlob(thumbnail => resolve(thumbnail ?? undefined), outputMimeType);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(undefined);
		};
	});
}

function getOrCreateImageThumbnail(cacheKey: string, data: Uint8Array, maxSize: number, mimeType: string): Promise<Blob | undefined> {
	const key = `${cacheKey}:${maxSize}:${data.byteLength}:${mimeType}`;
	const cached = thumbnailCache.get(key);
	if (cached) {
		return cached;
	}
	const thumbnail: Promise<Blob | undefined> = raceTimeout(createImageThumbnail(data, maxSize, mimeType), THUMBNAIL_DECODE_TIMEOUT_MS).then(blob => {
		if (!blob && thumbnailCache.peek(key) === thumbnail) {
			thumbnailCache.delete(key);
		}
		return blob;
	});
	thumbnailCache.set(key, thumbnail);
	return thumbnail;
}
