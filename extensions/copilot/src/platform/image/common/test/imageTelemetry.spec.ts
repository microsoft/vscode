/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { getImageTelemetryEventMeasurements, getImageTelemetryMeasurementsFromMessages } from '../imageTelemetry';
import { createPngDataUrl } from './testImageData';

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

	it('does not throw when image dimensions cannot be read', () => {
		const messageMeasurements = getImageTelemetryMeasurementsFromMessages([
			{ content: [{ imageUrl: { url: 'data:image/png;base64,AQIDBA==' } }] }
		]);

		expect(messageMeasurements).toMatchObject({
			imageCount: 1,
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