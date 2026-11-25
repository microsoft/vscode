/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType } from '../../base/browser/dom.js';
import { raceTimeout } from '../../base/common/async.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { LinkedMap, Touch } from '../../base/common/map.js';
import { getMediaMime } from '../../base/common/mime.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { registerOpenEditorListeners } from '../../platform/editor/browser/editor.js';
import './media/chatImagePreview.css';

const CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE = 768;
const THUMBNAIL_DECODE_TIMEOUT_MS = 10_000;
const THUMBNAIL_CACHE_SIZE = 50;

interface IChatImageThumbnail {
	readonly cacheKey: string;
	/** Identifies the image data the thumbnail was made from. */
	readonly source: string;
	readonly pending: Promise<Blob | undefined>;
	/** The thumbnail once it is encoded, for the images that are rendered after that. */
	blob?: Blob;
	/**
	 * The object URL of {@link blob}, shared by the images that show the thumbnail. An image is
	 * available as soon as it gets a URL that the window has loaded already, while a URL of its
	 * own is loaded first, which leaves the image empty in the meantime.
	 */
	url?: string;
	/** The number of images showing {@link url}. */
	references: number;
}

/** The latest thumbnail of each cache key, least recently used first. */
const thumbnails = new LinkedMap<string, IChatImageThumbnail>();

/**
 * The image hover shared by chat attachments and session image references.
 *
 * @param buffer The data of the image, or `undefined` while it is still being loaded, which
 * shows the thumbnail that was last made for `cacheKey`, if any.
 * @param onImageUrl Called with the URL of the image to show. When the thumbnail is already
 * there, this happens before returning, so that an image that is rendered again does not go
 * through its placeholder once more.
 */
export function createChatImageHoverContent(
	resource: URI | undefined,
	fullName: string,
	buffer: ArrayBuffer | Uint8Array | undefined,
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
		const location = $('.chat-image-hover-location.chat-attached-context-url.chat-pill-location-hover', undefined, fullName);
		hoverElement.append($('.chat-image-hover-location-separator.chat-attached-context-url-separator'), location);
	}

	const data = !buffer || buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const mimeType = getMediaMime(resource?.path ?? fullName) ?? 'application/octet-stream';
	const previewImageUrl = disposables.add(new MutableDisposable<IDisposable>());
	if (onImageError) {
		disposables.add(addDisposableListener(hoverImage, EventType.ERROR, onImageError));
	}
	disposables.add(addDisposableListener(hoverImage, EventType.LOAD, () => onContentsChanged?.()));
	const showImage = (url: string, isThumbnail: boolean, urlReference: IDisposable) => {
		previewImageUrl.value = urlReference;
		hoverImage.src = url;
		onImageUrl?.(url, isThumbnail, hoverImage);
	};
	const showThumbnail = (thumbnail: IChatImageThumbnail, blob: Blob) => {
		const url = thumbnail.url ??= URL.createObjectURL(blob);
		thumbnail.references++;
		showImage(url, true, toDisposable(() => {
			thumbnail.references--;
			revokeUnusedThumbnailUrl(thumbnail);
		}));
	};

	const thumbnail = data ? getOrCreateImageThumbnail(cacheKey, data, CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE, mimeType) : thumbnails.get(cacheKey, Touch.AsNew);
	if (thumbnail?.blob) {
		showThumbnail(thumbnail, thumbnail.blob);
	} else if (thumbnail && data) {
		void thumbnail.pending.then(blob => {
			if (disposables.isDisposed) {
				return;
			}
			if (blob) {
				showThumbnail(thumbnail, blob);
			} else {
				const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType }));
				showImage(url, false, toDisposable(() => URL.revokeObjectURL(url)));
			}
		});
	}

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
			// Chromium encodes PNG and JPEG blobs only while the renderer is idle, so a busy
			// window (e.g. a streaming chat response) delays the thumbnail by seconds. WebP is
			// encoded on a worker thread; quality 1 is lossless and preserves PNG thumbnails.
			const isJpeg = data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF;
			canvas.toBlob(thumbnail => resolve(thumbnail ?? undefined), 'image/webp', isJpeg ? 0.92 : 1);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(undefined);
		};
	});
}

function getOrCreateImageThumbnail(cacheKey: string, data: Uint8Array, maxSize: number, mimeType: string): IChatImageThumbnail {
	const source = `${maxSize}:${data.byteLength}:${mimeType}`;
	const cached = thumbnails.get(cacheKey, Touch.AsNew);
	if (cached?.source === source) {
		return cached;
	}
	const thumbnail: IChatImageThumbnail = {
		cacheKey,
		source,
		references: 0,
		pending: raceTimeout(createImageThumbnail(data, maxSize, mimeType), THUMBNAIL_DECODE_TIMEOUT_MS).then(blob => {
			thumbnail.blob = blob;
			if (!blob && thumbnails.get(cacheKey) === thumbnail) {
				thumbnails.delete(cacheKey);
			}
			return blob;
		}),
	};
	thumbnails.set(cacheKey, thumbnail, Touch.AsNew);
	const dropped = cached ?? (thumbnails.size > THUMBNAIL_CACHE_SIZE ? thumbnails.shift() : undefined);
	if (dropped) {
		revokeUnusedThumbnailUrl(dropped);
	}
	return thumbnail;
}

/** Revokes the URL of a thumbnail that left the cache, once no image shows it anymore. */
function revokeUnusedThumbnailUrl(thumbnail: IChatImageThumbnail): void {
	if (thumbnail.url && !thumbnail.references && thumbnails.get(thumbnail.cacheKey) !== thumbnail) {
		URL.revokeObjectURL(thumbnail.url);
		thumbnail.url = undefined;
	}
}
