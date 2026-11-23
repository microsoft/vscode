/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getImageDimensions } from '../../../util/common/imageUtils';

type ImageTelemetrySource = 'clipboard' | 'screenshot' | 'file' | 'url' | 'unknown';

export interface ImageTelemetryMeasurements {
	imageCount: number;
	totalImageBytes: number;
	maxImageBytes: number;
	maxImageWidth: number;
	maxImageHeight: number;
	maxImagePixels: number;
	totalImagePixels: number;
	imagePngCount: number;
	imageJpegCount: number;
	imageGifCount: number;
	imageWebpCount: number;
	imageUnknownMimeCount: number;
	imageClipboardCount: number;
	imageScreenshotCount: number;
	imageFileCount: number;
	imageUrlCount: number;
	imageUnknownSourceCount: number;
}

interface ImageTelemetryInput {
	mimeType?: string;
	byteLength?: number;
	dimensions?: ImageTelemetryDimensions;
	source?: ImageTelemetrySource;
}

interface ImageTelemetryDimensions {
	width: number;
	height: number;
}

interface MessageWithContent {
	content?: unknown;
}

function createEmptyImageTelemetryMeasurements(): ImageTelemetryMeasurements {
	return {
		imageCount: 0,
		totalImageBytes: 0,
		maxImageBytes: 0,
		maxImageWidth: 0,
		maxImageHeight: 0,
		maxImagePixels: 0,
		totalImagePixels: 0,
		imagePngCount: 0,
		imageJpegCount: 0,
		imageGifCount: 0,
		imageWebpCount: 0,
		imageUnknownMimeCount: 0,
		imageClipboardCount: 0,
		imageScreenshotCount: 0,
		imageFileCount: 0,
		imageUrlCount: 0,
		imageUnknownSourceCount: 0,
	};
}

export function getImageTelemetryEventMeasurements(measurements: ImageTelemetryMeasurements): Partial<ImageTelemetryMeasurements> {
	return measurements.imageCount > 0 ? measurements : {};
}

export function getImageTelemetryMeasurementsFromMessages(messages: readonly MessageWithContent[] | undefined): ImageTelemetryMeasurements {
	const measurements = createEmptyImageTelemetryMeasurements();

	for (const message of messages ?? []) {
		if (!Array.isArray(message.content)) {
			continue;
		}

		for (const part of message.content) {
			const imageUrl = getObjectProperty(part, 'imageUrl');
			const url = getStringProperty(imageUrl, 'url');
			if (!url) {
				continue;
			}

			const input = getImageTelemetryInputFromUrl(url, getStringProperty(imageUrl, 'mediaType'));
			if (input) {
				addImageTelemetryInput(measurements, input);
			}
		}
	}

	return measurements;
}

function addImageTelemetryInput(measurements: ImageTelemetryMeasurements, input: ImageTelemetryInput): void {
	measurements.imageCount++;

	const byteLength = input.byteLength ?? 0;
	measurements.totalImageBytes += byteLength;
	measurements.maxImageBytes = Math.max(measurements.maxImageBytes, byteLength);
	addImageDimensions(measurements, input.dimensions);

	switch (normalizeMimeType(input.mimeType)) {
		case 'png':
			measurements.imagePngCount++;
			break;
		case 'jpeg':
			measurements.imageJpegCount++;
			break;
		case 'gif':
			measurements.imageGifCount++;
			break;
		case 'webp':
			measurements.imageWebpCount++;
			break;
		default:
			measurements.imageUnknownMimeCount++;
	}

	switch (input.source) {
		case 'clipboard':
			measurements.imageClipboardCount++;
			break;
		case 'screenshot':
			measurements.imageScreenshotCount++;
			break;
		case 'file':
			measurements.imageFileCount++;
			break;
		case 'url':
			measurements.imageUrlCount++;
			break;
		default:
			measurements.imageUnknownSourceCount++;
	}
}

function getImageTelemetryInputFromUrl(url: string, mediaType: string | undefined): ImageTelemetryInput | undefined {
	if (!url.startsWith('data:')) {
		return url.startsWith('https://') ? { mimeType: mediaType, source: 'url' } : undefined;
	}

	const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(url);
	if (!match) {
		return undefined;
	}

	return {
		mimeType: mediaType ?? match[1],
		byteLength: getBase64ByteLength(match[2]),
		dimensions: getImageDimensionsFromDataUrl(url),
		source: 'unknown',
	};
}

function addImageDimensions(measurements: ImageTelemetryMeasurements, dimensions: ImageTelemetryDimensions | undefined): void {
	if (!dimensions || !isValidDimension(dimensions.width) || !isValidDimension(dimensions.height)) {
		return;
	}

	const pixels = dimensions.width * dimensions.height;
	if (!Number.isFinite(pixels) || pixels <= 0) {
		return;
	}

	measurements.maxImageWidth = Math.max(measurements.maxImageWidth, dimensions.width);
	measurements.maxImageHeight = Math.max(measurements.maxImageHeight, dimensions.height);
	measurements.maxImagePixels = Math.max(measurements.maxImagePixels, pixels);
	measurements.totalImagePixels += pixels;
}

function isValidDimension(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

function getImageDimensionsFromDataUrl(url: string): ImageTelemetryDimensions | undefined {
	try {
		return getImageDimensions(url);
	} catch {
		return undefined;
	}
}

function normalizeMimeType(mimeType: string | undefined): 'png' | 'jpeg' | 'gif' | 'webp' | 'unknown' {
	const normalized = mimeType?.toLowerCase().split(';')[0].trim();
	switch (normalized) {
		case 'image/png':
			return 'png';
		case 'image/jpeg':
		case 'image/jpg':
			return 'jpeg';
		case 'image/gif':
			return 'gif';
		case 'image/webp':
			return 'webp';
		default:
			return 'unknown';
	}
}

function getBase64ByteLength(base64Data: string): number {
	const trimmed = base64Data.trim();
	let padding = 0;
	if (trimmed.endsWith('==')) {
		padding = 2;
	} else if (trimmed.endsWith('=')) {
		padding = 1;
	}
	return Math.max(0, Math.floor(trimmed.length * 3 / 4) - padding);
}

function getObjectProperty(value: unknown, property: string): Record<string, unknown> | undefined {
	return asRecord(asRecord(value)?.[property]);
}

function getStringProperty(value: unknown, property: string): string | undefined {
	const propertyValue = asRecord(value)?.[property];
	return typeof propertyValue === 'string' ? propertyValue : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}