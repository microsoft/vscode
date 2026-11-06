/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { getImageTelemetryEventMeasurements, getImageTelemetryMeasurementsFromMessages, getImageTelemetryMeasurementsFromReferences } from '../imageTelemetry';
import { createPngBytes, createPngDataUrl } from './testImageData';

describe('imageTelemetry', () => {
	it('collects MIME and byte counts from message data URLs', () => {
		const measurements = getImageTelemetryMeasurementsFromMessages([
			{
				content: [
					{ imageUrl: { url: 'data:image/png;base64,AQIDBA==' } },
					{ imageUrl: { url: 'data:image/jpeg;base64,AQI=' } },
				]
			}
		]);

		expect(measurements).toMatchObject({
			imageCount: 2,
			totalImageBytes: 6,
			maxImageBytes: 4,
			maxImageWidth: 0,
			maxImageHeight: 0,
			maxImagePixels: 0,
			totalImagePixels: 0,
			imagePngCount: 1,
			imageJpegCount: 1,
			imageUnknownSourceCount: 2,
		});
	});

	it('collects dimension metadata from message data URLs', () => {
		const measurements = getImageTelemetryMeasurementsFromMessages([
			{
				content: [
					{ imageUrl: { url: createPngDataUrl(2, 3) } },
					{ imageUrl: { url: createPngDataUrl(4, 5) } },
				]
			}
		]);

		expect(measurements).toMatchObject({
			imageCount: 2,
			totalImageBytes: 48,
			maxImageBytes: 24,
			maxImageWidth: 4,
			maxImageHeight: 5,
			maxImagePixels: 20,
			totalImagePixels: 26,
			imagePngCount: 2,
		});
	});

	it('skips message image URLs that are not sent to the endpoint', () => {
		const measurements = getImageTelemetryMeasurementsFromMessages([
			{
				content: [
					{ imageUrl: { url: 'http://example.com/image.png', mediaType: 'image/png' } },
					{ imageUrl: { url: 'data:image/svg+xml;base64,AQID' } },
					{ imageUrl: { url: 'data:image/png,AQID' } },
					{ imageUrl: { url: 'https://example.com/image.png', mediaType: 'image/png' } },
				]
			}
		]);

		expect(measurements).toMatchObject({
			imageCount: 1,
			imagePngCount: 1,
			imageUrlCount: 1,
		});
	});

	it('collects source and byte counts from image references', () => {
		const measurements = getImageTelemetryMeasurementsFromReferences([
			{ id: 'paste', value: { mimeType: 'image/png', data: new Uint8Array([1, 2]), isPasted: true } },
			{ id: 'remote', value: { mimeType: 'image/webp', data: new Uint8Array([3]), isURL: true } },
			{ id: 'local', value: { mimeType: 'image/gif', data: new Uint8Array([4, 5, 6]), isURL: false } },
		]);

		expect(measurements).toMatchObject({
			imageCount: 3,
			totalImageBytes: 6,
			maxImageBytes: 3,
			imagePngCount: 1,
			imageGifCount: 1,
			imageWebpCount: 1,
			imageClipboardCount: 1,
			imageFileCount: 1,
			imageUrlCount: 1,
		});
	});

	it('collects dimension metadata from image references', () => {
		const measurements = getImageTelemetryMeasurementsFromReferences([
			{ id: 'wide', value: { mimeType: 'image/png', data: createPngBytes(7, 2), isPasted: true } },
			{ id: 'tall', value: { mimeType: 'image/png', data: createPngBytes(3, 11), isPasted: true } },
		]);

		expect(measurements).toMatchObject({
			imageCount: 2,
			totalImageBytes: 48,
			maxImageBytes: 24,
			maxImageWidth: 7,
			maxImageHeight: 11,
			maxImagePixels: 33,
			totalImagePixels: 47,
		});
	});

	it('does not throw when image dimensions cannot be read', () => {
		const messageMeasurements = getImageTelemetryMeasurementsFromMessages([
			{ content: [{ imageUrl: { url: 'data:image/png;base64,AQIDBA==' } }] }
		]);
		const referenceMeasurements = getImageTelemetryMeasurementsFromReferences([
			{ id: 'bad-png', value: { mimeType: 'image/png', data: new Uint8Array(24), isPasted: true } }
		]);

		expect(messageMeasurements).toMatchObject({
			imageCount: 1,
			maxImageWidth: 0,
			maxImageHeight: 0,
			maxImagePixels: 0,
			totalImagePixels: 0,
		});
		expect(referenceMeasurements).toMatchObject({
			imageCount: 1,
			maxImageWidth: 0,
			maxImageHeight: 0,
			maxImagePixels: 0,
			totalImagePixels: 0,
		});
	});

	it('does not collect dimensions from unsupported image reference MIME types', () => {
		const measurements = getImageTelemetryMeasurementsFromReferences([
			{ id: 'vector', value: { mimeType: 'image/svg+xml', data: createPngBytes(7, 11), isPasted: true } }
		]);

		expect(measurements).toMatchObject({
			imageCount: 1,
			imageUnknownMimeCount: 1,
			maxImageWidth: 0,
			maxImageHeight: 0,
			maxImagePixels: 0,
			totalImagePixels: 0,
		});
	});

	it('does not collect dimensions from URL-only images', () => {
		const measurements = getImageTelemetryMeasurementsFromMessages([
			{ content: [{ imageUrl: { url: 'https://example.com/image.png', mediaType: 'image/png' } }] }
		]);

		expect(measurements).toMatchObject({
			imageCount: 1,
			imageUrlCount: 1,
			maxImageWidth: 0,
			maxImageHeight: 0,
			maxImagePixels: 0,
			totalImagePixels: 0,
		});
	});

	it('omits telemetry measures when no images are present', () => {
		const measurements = getImageTelemetryMeasurementsFromMessages([{ content: [{ text: 'hello' }] }]);

		expect(getImageTelemetryEventMeasurements(measurements)).toEqual({});
	});
});