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
import { extname } from '../../../../base/common/path.js';
import { localize } from '../../../../nls.js';
import { IIssueReporterScreenshot } from '../common/issue.js';

export const MAX_ISSUE_ATTACHMENTS = 5;
export const MAX_ISSUE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ISSUE_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_ISSUE_FILE_BYTES = 25 * 1024 * 1024;

export interface IIssueReporterMediaFormat {
	readonly kind: 'image' | 'video' | 'file';
	readonly mimeType: string;
	readonly extension: string;
	readonly maxBytes: number;
}

export interface IIssueReporterVideoMetadata {
	readonly width: number;
	readonly height: number;
	readonly durationMs?: number;
	readonly thumbnailDataUrl: string;
}

export function getIssueReporterMediaFormat(name: string, type = ''): IIssueReporterMediaFormat {
	const inferredType = getMediaMime(name);
	const declaredType = type.split(';', 1)[0].trim().toLowerCase();
	const mimeType = declaredType && declaredType !== Mimes.binary ? type : (inferredType === 'image/jpg' ? 'image/jpeg' : inferredType) || Mimes.binary;
	const mediaType = mimeType.split(';', 1)[0].trim().toLowerCase();
	const kind = mediaType.startsWith('image/') ? 'image' : mediaType.startsWith('video/') ? 'video' : 'file';
	const originalExtension = extname(name).slice(1).toLowerCase();
	const inferredExtension = mediaType === 'image/jpeg' || mediaType === 'image/jpg' ? 'jpg' : getExtensionForMimeType(mediaType)?.slice(1);
	return {
		kind,
		mimeType,
		extension: /^[a-z0-9][a-z0-9_+-]*$/.test(originalExtension) ? originalExtension : inferredExtension || 'bin',
		maxBytes: kind === 'image' ? MAX_ISSUE_IMAGE_BYTES : kind === 'video' ? MAX_ISSUE_VIDEO_BYTES : MAX_ISSUE_FILE_BYTES,
	};
}

export function getIssueReporterScreenshotFile(screenshot: IIssueReporterScreenshot, screenshotNumber: number): { dataUrl: string; name: string; format: IIssueReporterMediaFormat } {
	const dataUrl = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
	const format = getIssueReporterMediaFormat('', dataUrl.slice(5, dataUrl.indexOf(',')).split(';', 1)[0]);
	return { dataUrl, name: `screenshot-${screenshotNumber}.${format.extension}`, format };
}

export function validateIssueReporterMediaFile(file: Pick<File, 'name' | 'type' | 'size'>): IIssueReporterMediaFormat {
	const name = file.name || localize('unnamedAttachment', "Clipboard attachment");
	const format = getIssueReporterMediaFormat(file.name, file.type);
	if (file.size > format.maxBytes) {
		throw new Error(localize('attachmentTooLarge', "Cannot attach {0}. The limit for this file is {1} MB.", name, format.maxBytes / (1024 * 1024)));
	}
	return format;
}

export async function readIssueReporterMediaFile(file: File, token: CancellationToken): Promise<{ format: IIssueReporterMediaFormat; bytes: VSBuffer; durationMs?: number }> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const format = validateIssueReporterMediaFile(file);
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
