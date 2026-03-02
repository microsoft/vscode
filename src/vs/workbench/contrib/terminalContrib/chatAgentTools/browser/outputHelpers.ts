/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { truncateOutputKeepingTail } from './runInTerminalHelpers.js';

const MAX_OUTPUT_LENGTH = 16000;

/**
 * Maximum images to include per tool result. Keep this low because images
 * from every tool call accumulate in the conversation history that the
 * copilot extension sends to the LLM. The Anthropic API, for example,
 * rejects requests with more than 100 images total.
 */
const MAX_IMAGES = 3;

export function getOutput(instance: ITerminalInstance, startMarker?: IXtermMarker): string {
	if (!instance.xterm || !instance.xterm.raw) {
		return '';
	}
	const buffer = instance.xterm.raw.buffer.active;
	const startLine = Math.max(startMarker?.line ?? 0, 0);
	const endLine = buffer.length;
	const lines: string[] = new Array(endLine - startLine);

	for (let y = startLine; y < endLine; y++) {
		const line = buffer.getLine(y);
		lines[y - startLine] = line ? line.translateToString(true) : '';
	}

	let output = lines.join('\n');
	if (output.length > MAX_OUTPUT_LENGTH) {
		output = truncateOutputKeepingTail(output, MAX_OUTPUT_LENGTH);
	}
	return output;
}

/**
 * Extracts unique images from the terminal buffer in the given range as PNG Uint8Arrays.
 * Uses the ImageAddon's getUniqueImagesInRange to efficiently deduplicate by imageId.
 */
export async function getImages(instance: ITerminalInstance, startMarker?: IXtermMarker): Promise<{ mimeType: string; data: VSBuffer }[]> {
	if (!instance.xterm || !instance.xterm.raw) {
		return [];
	}

	const buffer = instance.xterm.raw.buffer.active;
	const startLine = Math.max(startMarker?.line ?? 0, 0);
	const endLine = buffer.length;

	const canvases = instance.xterm.getUniqueImagesInRange(startLine, endLine);
	if (canvases.length === 0) {
		return [];
	}

	// Limit images to avoid exceeding LLM API media limits
	const cappedCanvases = canvases.slice(0, MAX_IMAGES);

	const results: { mimeType: string; data: VSBuffer }[] = [];
	for (const canvas of cappedCanvases) {
		// Resize large images to reduce token usage in the LLM context.
		// Follows OpenAI's vision tokenization algorithm: cap at 2048px max,
		// then scale shortest side to 768px.
		const resized = _resizeCanvasForLLM(canvas);
		const blob = await new Promise<Blob | null>(resolve => resized.toBlob(resolve, 'image/png'));
		if (blob) {
			const arrayBuffer = await blob.arrayBuffer();
			results.push({
				mimeType: 'image/png',
				data: VSBuffer.wrap(new Uint8Array(arrayBuffer)),
			});
		}
	}
	return results;
}

const MAX_IMAGE_DIMENSION = 2048;
const TARGET_SHORT_SIDE = 768;

/**
 * Downscales a canvas for LLM consumption. If both dimensions are <= 768px,
 * returns the original canvas unchanged to avoid unnecessary re-encoding.
 */
function _resizeCanvasForLLM(source: HTMLCanvasElement): HTMLCanvasElement {
	let { width, height } = source;
	if (width <= TARGET_SHORT_SIDE && height <= TARGET_SHORT_SIDE) {
		return source;
	}

	if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
		const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
		width = Math.round(width * scale);
		height = Math.round(height * scale);
	}

	const scale = TARGET_SHORT_SIDE / Math.min(width, height);
	if (scale < 1) {
		width = Math.round(width * scale);
		height = Math.round(height * scale);
	}

	const out = document.createElement('canvas');
	out.width = width;
	out.height = height;
	const ctx = out.getContext('2d');
	if (!ctx) {
		return source;
	}
	ctx.drawImage(source, 0, 0, width, height);
	return out;
}
