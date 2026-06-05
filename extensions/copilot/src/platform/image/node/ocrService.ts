/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Worker } from 'tesseract.js';

export interface OcrResult {
	text: string;
	confidence: number;
}

let workerPromise: Promise<Worker> | undefined;

async function getWorker(): Promise<Worker> {
	if (!workerPromise) {
		workerPromise = (async () => {
			const Tesseract = await import('tesseract.js');
			const worker = await Tesseract.createWorker('eng');
			return worker;
		})();
	}
	return workerPromise;
}

/**
 * Run OCR on a single image and return the extracted text and confidence score.
 * Returns undefined if OCR fails or produces no meaningful output.
 */
export async function extractTextFromImage(imageData: Uint8Array): Promise<OcrResult | undefined> {
	try {
		const worker = await getWorker();
		const result = await worker.recognize(imageData);
		const text = result.data.text?.trim() ?? '';
		if (!text) {
			return undefined;
		}
		return {
			text,
			confidence: result.data.confidence ?? 0,
		};
	} catch {
		return undefined;
	}
}

/**
 * Extract the first image's binary data from an array of chat messages containing data URLs.
 */
export function extractFirstImageBytes(messages: readonly { content?: unknown }[]): Uint8Array | undefined {
	for (const message of messages) {
		if (!Array.isArray(message.content)) {
			continue;
		}
		for (const part of message.content) {
			if (typeof part !== 'object' || part === null) {
				continue;
			}
			const imageUrl = (part as Record<string, unknown>).imageUrl ?? (part as Record<string, unknown>).image_url;
			if (typeof imageUrl !== 'object' || imageUrl === null) {
				continue;
			}
			const url = (imageUrl as Record<string, unknown>).url;
			if (typeof url !== 'string' || !url.startsWith('data:')) {
				continue;
			}
			const match = /^data:image\/(?:jpeg|png|gif|webp);base64,(.+)$/.exec(url);
			if (match) {
				return Buffer.from(match[1], 'base64');
			}
		}
	}
	return undefined;
}

/**
 * Run OCR on the first image found in messages.
 * Designed to run in parallel with the LLM request for zero user-visible latency impact.
 */
export async function extractOcrFromMessages(messages: readonly { content?: unknown }[]): Promise<OcrResult | undefined> {
	const imageBytes = extractFirstImageBytes(messages);
	if (!imageBytes) {
		return undefined;
	}
	return extractTextFromImage(imageBytes);
}
