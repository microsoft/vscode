/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getImageDimensions } from '../../../util/common/imageUtils';

export type ImageDetail = 'low' | 'high' | 'auto' | undefined;

/**
 * Estimates the prompt tokens an image of the given pixel dimensions costs.
 * https://platform.openai.com/docs/guides/vision#calculating-costs
 */
export function calculateImageTokenCostForDimensions(width: number, height: number, detail: ImageDetail): number {
	if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
		throw new Error(`Invalid image dimensions: ${width}x${height}`);
	}

	if (detail === 'low') {
		return 85;
	}

	// Scale image to fit within a 2048 x 2048 square if necessary. The scaled
	// sizes stay fractional until the end: rounding here would turn the short
	// side of a very elongated image into 0 and the next step into a division
	// by zero.
	if (width > 2048 || height > 2048) {
		const scaleFactor = 2048 / Math.max(width, height);
		width *= scaleFactor;
		height *= scaleFactor;
	}

	const scaleFactor = 768 / Math.min(width, height);
	width = Math.round(width * scaleFactor);
	height = Math.round(height * scaleFactor);

	const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);

	return tiles * 170 + 85;
}

function isPositiveFinite(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

/**
 * Estimates the prompt tokens of a `data:image/...;base64,` URL from the
 * dimensions encoded in its header. Throws when the image cannot be decoded.
 */
export function calculateImageTokenCost(imageUrl: string, detail: ImageDetail): number {
	const { width, height } = getImageDimensions(imageUrl);
	return calculateImageTokenCostForDimensions(width, height, detail);
}

/**
 * Estimates the token cost of a base64-encoded document (e.g. PDF) without BPE tokenization.
 * Uses a size-based heuristic to avoid tokenizing large binary payloads and polluting
 * the LRU cache. Intentionally conservative (overestimates) to avoid exceeding context limits.
 */
export function estimateDocumentTokenCost(base64Data: string | undefined): number {
	if (!base64Data) {
		return 0;
	}
	// Roughly estimate original bytes from base64 length.
	// Base64 encodes 3 bytes into 4 characters, so bytes ~= len * 3 / 4.
	const length = base64Data.length;
	const estimatedBytes = Math.floor((length * 3) / 4);
	// Heuristic: assume approximately 1 token per 8 bytes of document data.
	// This is a rough estimate that avoids expensive BPE tokenization of large
	// binary payloads and avoids polluting the LRU token cache.
	const estimatedTokens = Math.ceil(estimatedBytes / 8);
	return estimatedTokens;
}
