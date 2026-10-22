/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener } from '../../../../base/browser/dom.js';
import { raceCancellationError, TimeoutTimer } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { getExtensionForMimeType, getMediaMime, Mimes } from '../../../../base/common/mime.js';
import { localize } from '../../../../nls.js';

export const MAX_ISSUE_ATTACHMENTS = 5;
export const MAX_ISSUE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ISSUE_VIDEO_BYTES = 100 * 1024 * 1024;

export interface IIssueReporterMediaFormat {
	readonly kind: 'image' | 'video';
	readonly mimeType: string;
	readonly extension: string;
	readonly maxBytes: number;
}

export interface IIssueReporterVideo {
	readonly filePath: string;
	readonly durationMs?: number;
	readonly thumbnailDataUrl?: string;
	readonly width?: number;
	readonly height?: number;
}

export interface IIssueReporterVideoMetadata {
	readonly width: number;
	readonly height: number;
	readonly durationMs?: number;
	readonly thumbnailDataUrl: string;
}

export type ImportedIssueMedia =
	| { readonly kind: 'image'; readonly image: { readonly dataUrl: string; readonly width: number; readonly height: number } }
	| { readonly kind: 'video'; readonly video: IIssueReporterVideo };

export function getIssueReporterMediaFormat(name: string, type = ''): IIssueReporterMediaFormat | undefined {
	let mimeType = type.split(';', 1)[0].trim().toLowerCase();
	if (!mimeType || mimeType === Mimes.binary) {
		mimeType = getMediaMime(name) ?? '';
	}
	if (mimeType === 'image/jpg') {
		mimeType = 'image/jpeg';
	}
	switch (mimeType) {
		case 'image/png':
		case 'image/jpeg':
		case 'image/gif':
		case 'image/webp':
		case 'image/avif':
			return { kind: 'image', mimeType, extension: mimeType === 'image/jpeg' ? 'jpg' : getExtensionForMimeType(mimeType)!.slice(1), maxBytes: MAX_ISSUE_IMAGE_BYTES };
		case 'video/mp4':
		case 'video/webm':
		case 'video/quicktime':
			return { kind: 'video', mimeType, extension: getExtensionForMimeType(mimeType)!.slice(1), maxBytes: MAX_ISSUE_VIDEO_BYTES };
		default:
			return undefined;
	}
}

export function validateIssueReporterMediaFile(file: Pick<File, 'name' | 'type' | 'size'>): IIssueReporterMediaFormat {
	const name = file.name || localize('unnamedAttachment', "Clipboard attachment");
	const format = getIssueReporterMediaFormat(file.name, file.type);
	if (!format) {
		throw new Error(localize('unsupportedAttachment', "Cannot attach {0}. Use PNG, JPEG, GIF, WebP, AVIF, MP4, WebM, or MOV.", name));
	}
	if (file.size === 0) {
		throw new Error(localize('emptyAttachment', "Cannot attach {0} because the file is empty.", name));
	}
	if (file.size > format.maxBytes) {
		throw new Error(localize('attachmentTooLarge', "Cannot attach {0}. The limit is {1} MB per {2}.", name, format.maxBytes / (1024 * 1024), format.kind === 'image' ? localize('image', "image") : localize('video', "video")));
	}
	return format;
}

export async function readIssueReporterMediaFile(file: File, token: CancellationToken): Promise<{ format: IIssueReporterMediaFormat; bytes: VSBuffer; durationMs?: number }> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const declaredFormat = validateIssueReporterMediaFile(file);
	const header = VSBuffer.wrap(new Uint8Array(await raceCancellationError(file.slice(0, 64).arrayBuffer(), token)));
	const signature = header.buffer;
	const text = (start: number, end: number) => header.slice(start, end).toString();
	let mimeType: string | undefined;
	if (signature[0] === 0xFF && signature[1] === 0xD8 && signature[2] === 0xFF) {
		mimeType = 'image/jpeg';
	} else if (signature[0] === 0x89 && text(1, 8) === 'PNG\r\n\x1a\n') {
		mimeType = 'image/png';
	} else if (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a') {
		mimeType = 'image/gif';
	} else if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') {
		mimeType = 'image/webp';
	} else if (signature[0] === 0x1A && signature[1] === 0x45 && signature[2] === 0xDF && signature[3] === 0xA3) {
		mimeType = 'video/webm';
	} else if (text(4, 8) === 'ftyp') {
		const brand = text(8, 12);
		mimeType = brand === 'avif' || brand === 'avis' ? 'image/avif' : brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
	} else if (declaredFormat.kind === 'video' && ['moov', 'mdat', 'wide', 'free'].includes(text(4, 8))) {
		mimeType = declaredFormat.mimeType;
	}
	if (!mimeType) {
		throw new Error(localize('invalidMediaHeader', "The file is not a supported image or video, or is damaged."));
	}
	const format = validateIssueReporterMediaFile({ name: file.name, type: mimeType, size: file.size });
	const bytes = VSBuffer.wrap(new Uint8Array(await raceCancellationError(file.arrayBuffer(), token)));
	return { format, bytes, durationMs: format.mimeType === 'video/webm' ? readWebmDuration(bytes.buffer) : undefined };
}

/** Chromium may estimate missing WebM duration from the last frame timestamp; only use declared duration. */
function readWebmDuration(bytes: Uint8Array): number | undefined {
	let visited = 0;
	const readInteger = (offset: number, limit: number, identifier: boolean) => {
		if (offset >= limit) {
			return undefined;
		}
		let mask = 0x80;
		let length = 1;
		while (mask && !(bytes[offset] & mask)) {
			mask >>= 1;
			length++;
		}
		if (!mask || length > (identifier ? 4 : 8) || offset + length > limit) {
			return undefined;
		}
		let value = identifier ? bytes[offset] : bytes[offset] & (mask - 1);
		let unknownSize = !identifier && value === mask - 1;
		for (let index = 1; index < length; index++) {
			value = value * 256 + bytes[offset + index];
			unknownSize &&= bytes[offset + index] === 0xFF;
		}
		return { value, unknownSize, next: offset + length };
	};
	function* elements(offset: number, limit: number): Iterable<{ id: number; start: number; end: number }> {
		while (offset < limit && visited++ < 512) {
			const id = readInteger(offset, limit, true);
			const size = id && readInteger(id.next, limit, false);
			if (!id || !size || (!size.unknownSize && !Number.isSafeInteger(size.value))) {
				return;
			}
			const end = size.unknownSize ? limit : size.next + size.value;
			if (end > limit) {
				return;
			}
			yield { id: id.value, start: size.next, end };
			offset = end;
		}
	}
	for (const segment of elements(0, bytes.length)) {
		if (segment.id !== 0x18538067) {
			continue;
		}
		for (const info of elements(segment.start, segment.end)) {
			if (info.id !== 0x1549A966) {
				continue;
			}
			let timestampScale = 1_000_000;
			let duration: number | undefined;
			for (const field of elements(info.start, info.end)) {
				const length = field.end - field.start;
				if (field.id === 0x2AD7B1) {
					if (length === 0 || length > 8) {
						return undefined;
					}
					timestampScale = 0;
					for (let index = field.start; index < field.end; index++) {
						timestampScale = timestampScale * 256 + bytes[index];
					}
				} else if (field.id === 0x4489 && (length === 4 || length === 8)) {
					const view = new DataView(bytes.buffer, bytes.byteOffset + field.start, length);
					duration = length === 4 ? view.getFloat32(0) : view.getFloat64(0);
				}
			}
			if (duration === undefined || !Number.isSafeInteger(timestampScale) || timestampScale <= 0) {
				return undefined;
			}
			const milliseconds = duration * timestampScale / 1_000_000;
			return Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= Number.MAX_SAFE_INTEGER ? Math.round(milliseconds) : undefined;
		}
	}
	return undefined;
}

export function readIssueReporterImage(
	dataUrl: string,
	token: CancellationToken,
	createImage: () => HTMLImageElement = () => $('img'),
): Promise<{ width: number; height: number }> {
	if (token.isCancellationRequested) {
		return Promise.reject(new CancellationError());
	}
	return new Promise((resolve, reject) => {
		const image = createImage();
		const store = new DisposableStore();
		let finished = false;
		const finish = (error?: Error) => {
			if (finished) {
				return;
			}
			finished = true;
			const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
			store.dispose();
			if (error) {
				reject(error);
			} else {
				resolve(dimensions);
			}
		};
		const fail = () => finish(new Error(localize('imageDecodeFailed', "The image could not be decoded. It may be damaged or use an unsupported format.")));
		store.add(toDisposable(() => {
			image.removeAttribute('src');
			image.remove();
		}));
		store.add(addDisposableListener(image, 'load', () => image.naturalWidth > 0 && image.naturalHeight > 0 ? finish() : fail(), { once: true }));
		store.add(addDisposableListener(image, 'error', fail));
		store.add(token.onCancellationRequested(() => finish(new CancellationError())));
		store.add(new TimeoutTimer(fail, 10000));
		try {
			image.src = dataUrl;
		} catch {
			fail();
		}
	});
}

export function readIssueReporterVideo(
	source: string,
	token: CancellationToken,
	createVideo: () => HTMLVideoElement = () => $('video'),
): Promise<IIssueReporterVideoMetadata> {
	if (token.isCancellationRequested) {
		return Promise.reject(new CancellationError());
	}
	return new Promise((resolve, reject) => {
		const video = createVideo();
		const store = new DisposableStore();
		let finished = false;
		let duration: number | undefined;
		const finish = (metadata?: IIssueReporterVideoMetadata, error?: Error) => {
			if (finished) {
				return;
			}
			finished = true;
			store.dispose();
			if (metadata) {
				resolve(metadata);
			} else {
				reject(error ?? new Error(localize('videoDecodeFailed', "The video could not be decoded. It may be damaged or use an unsupported format or codec.")));
			}
		};
		const captureFrame = () => {
			try {
				const canvas = $<HTMLCanvasElement>('canvas');
				const scale = Math.min(1, 640 / video.videoWidth, 360 / video.videoHeight);
				canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
				canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
				const context = canvas.getContext('2d');
				if (!context) {
					finish();
					return;
				}
				context.drawImage(video, 0, 0, canvas.width, canvas.height);
				finish({ width: video.videoWidth, height: video.videoHeight, durationMs: duration === undefined ? undefined : Math.round(duration * 1000), thumbnailDataUrl: canvas.toDataURL('image/jpeg', 0.7) });
			} catch {
				finish();
			}
		};
		const seekThumbnail = () => {
			if (duration === undefined) {
				captureFrame();
				return;
			}
			const position = Math.min(0.5, duration / 2);
			if (video.currentTime === position) {
				captureFrame();
			} else {
				try {
					video.currentTime = position;
				} catch {
					finish();
				}
			}
		};
		store.add(toDisposable(() => {
			video.pause();
			video.removeAttribute('src');
			video.load();
			video.remove();
		}));
		store.add(addDisposableListener(video, 'loadeddata', () => {
			if (!video.videoWidth || !video.videoHeight) {
				finish();
			} else if (Number.isFinite(video.duration) && video.duration > 0) {
				duration = video.duration;
				seekThumbnail();
			} else {
				captureFrame();
			}
		}, { once: true }));
		store.add(addDisposableListener(video, 'seeked', captureFrame));
		store.add(addDisposableListener(video, 'error', () => finish()));
		store.add(token.onCancellationRequested(() => finish(undefined, new CancellationError())));
		store.add(new TimeoutTimer(() => finish(), 10000));
		video.muted = true;
		video.playsInline = true;
		video.preload = 'auto';
		try {
			video.src = source;
			video.load();
		} catch {
			finish();
		}
	});
}
