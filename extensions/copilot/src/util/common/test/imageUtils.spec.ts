/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { getImageDimensionsFromBytes, getImageMimeTypeFromBytes } from '../imageUtils';
import { nonImages, realImages } from './imageFixtures';

describe('getImageMimeTypeFromBytes', () => {
	test('detects the format of real encoded images', () => {
		const detected = Object.fromEntries(Object.entries(realImages).map(([mimeType, data]) => [mimeType, getImageMimeTypeFromBytes(data)]));
		expect(detected).toEqual(Object.fromEntries(Object.keys(realImages).map(mimeType => [mimeType, mimeType])));
	});

	test('detected type agrees with the existing dimension decoder', () => {
		// Independent check that the detected type is one the bytes really decode as
		const dimensions = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].map(mimeType => {
			const data = realImages[mimeType];
			return getImageDimensionsFromBytes(data, getImageMimeTypeFromBytes(data));
		});
		expect(dimensions).toEqual(new Array(4).fill({ width: 3, height: 2 }));
	});

	test('returns undefined for files that are not supported images', () => {
		const detected = Object.fromEntries(Object.entries(nonImages).map(([name, data]) => [name, getImageMimeTypeFromBytes(data)]));
		expect(detected).toEqual(Object.fromEntries(Object.keys(nonImages).map(name => [name, undefined])));
	});

	test('returns undefined when an image is truncated inside its signature', () => {
		const truncated = Object.entries(realImages).map(([mimeType, data]) => [mimeType, getImageMimeTypeFromBytes(data.subarray(0, 2))]);
		expect(Object.fromEntries(truncated)).toEqual(Object.fromEntries(Object.keys(realImages).map(mimeType => [mimeType, undefined])));
	});
});
