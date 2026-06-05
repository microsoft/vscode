/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Worker } from 'tesseract.js';

export interface OcrPerImageResult {
	textLength: number;
	wordCount: number;
	lineCount: number;
	confidence: number;
}

export interface OcrAggregateResult {
	imageCount: number;
	totalTextLength: number;
	maxTextLength: number;
	totalWordCount: number;
	totalLineCount: number;
	maxConfidence: number;
	durationMs: number;
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

async function runOcrOnImage(imageData: Uint8Array): Promise<OcrPerImageResult | undefined> {
	try {
		const worker = await getWorker();
		const result = await worker.recognize(imageData);
		const text = result.data.text?.trim() ?? '';
		if (!text) {
			return undefined;
		}
		return {
			textLength: text.length,
			wordCount: result.data.words?.length ?? 0,
			lineCount: result.data.lines?.length ?? 0,
			confidence: result.data.confidence ?? 0,
		};
	} catch {
		return undefined;
	}
}

export function extractAllImageBytes(messages: readonly { content?: unknown }[]): Uint8Array[] {
	const out: Uint8Array[] = [];
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
				out.push(Buffer.from(match[1], 'base64'));
			}
		}
	}
	return out;
}

/**
 * Run OCR on every image attached to the request and return aggregate signals
 * suitable for multimodal routing telemetry. Runs in parallel with the LLM request
 * so it does not add user-visible latency.
 */
export async function extractOcrFromMessages(messages: readonly { content?: unknown }[]): Promise<OcrAggregateResult | undefined> {
	const images = extractAllImageBytes(messages);
	if (images.length === 0) {
		return undefined;
	}
	const start = Date.now();
	const aggregate: OcrAggregateResult = {
		imageCount: 0,
		totalTextLength: 0,
		maxTextLength: 0,
		totalWordCount: 0,
		totalLineCount: 0,
		maxConfidence: 0,
		durationMs: 0,
	};
	for (const bytes of images) {
		const r = await runOcrOnImage(bytes);
		if (!r) {
			continue;
		}
		aggregate.imageCount++;
		aggregate.totalTextLength += r.textLength;
		aggregate.maxTextLength = Math.max(aggregate.maxTextLength, r.textLength);
		aggregate.totalWordCount += r.wordCount;
		aggregate.totalLineCount += r.lineCount;
		aggregate.maxConfidence = Math.max(aggregate.maxConfidence, r.confidence);
	}
	aggregate.durationMs = Date.now() - start;
	if (aggregate.imageCount === 0) {
		return undefined;
	}
	return aggregate;
}
