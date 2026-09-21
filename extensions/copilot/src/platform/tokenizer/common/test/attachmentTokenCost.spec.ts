/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { createPngDataUrl } from '../../../image/common/test/testImageData';
import { calculateImageTokenCost, calculateImageTokenCostForDimensions, estimateDocumentTokenCost } from '../attachmentTokenCost';

describe('calculateImageTokenCostForDimensions', () => {
	it('charges the flat low-detail price regardless of size', () => {
		expect(calculateImageTokenCostForDimensions(4000, 3000, 'low')).toBe(85);
	});

	it('tiles a small image after scaling its short side to 768', () => {
		// 100x50 → 1536x768 → 3x2 tiles
		expect(calculateImageTokenCostForDimensions(100, 50, 'high')).toBe(6 * 170 + 85);
	});

	it('fits a large image into 2048 before tiling', () => {
		// 4096x4096 → 2048x2048 → 768x768 → 2x2 tiles
		expect(calculateImageTokenCostForDimensions(4096, 4096, undefined)).toBe(4 * 170 + 85);
	});
});

describe('calculateImageTokenCost', () => {
	it('reads the dimensions from a data URL', () => {
		expect(calculateImageTokenCost(createPngDataUrl(100, 50), 'high')).toBe(calculateImageTokenCostForDimensions(100, 50, 'high'));
	});

	it('rejects anything that is not an inline image', () => {
		expect(() => calculateImageTokenCost('https://example.com/a.png', 'high')).toThrow();
	});
});

describe('estimateDocumentTokenCost', () => {
	it('is zero for no data', () => {
		expect(estimateDocumentTokenCost(undefined)).toBe(0);
		expect(estimateDocumentTokenCost('')).toBe(0);
	});

	it('estimates one token per eight decoded bytes', () => {
		// 768 bytes encode without padding, so the byte count is exact.
		const base64 = Buffer.alloc(768, 1).toString('base64');
		expect(estimateDocumentTokenCost(base64)).toBe(96);
	});
});
