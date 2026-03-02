/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getOutput, getImages } from '../../browser/outputHelpers.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';

suite('outputHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getOutput', () => {
		test('should return empty string when xterm is undefined', () => {
			const instance = { xterm: undefined } as unknown as ITerminalInstance;
			strictEqual(getOutput(instance), '');
		});

		test('should return empty string when xterm.raw is undefined', () => {
			const instance = { xterm: { raw: undefined } } as unknown as ITerminalInstance;
			strictEqual(getOutput(instance), '');
		});

		test('should extract text from buffer lines', () => {
			const lines = ['hello world', 'second line', 'third line'];
			const instance = createMockInstanceWithLines(lines);
			const output = getOutput(instance);
			strictEqual(output, 'hello world\nsecond line\nthird line');
		});

		test('should start from startMarker line', () => {
			const lines = ['line 0', 'line 1', 'line 2', 'line 3'];
			const instance = createMockInstanceWithLines(lines);
			// eslint-disable-next-line local/code-no-any-casts
			const marker = { line: 2 } as any;
			const output = getOutput(instance, marker);
			strictEqual(output, 'line 2\nline 3');
		});

		test('should handle startMarker with negative line', () => {
			const lines = ['line 0', 'line 1'];
			const instance = createMockInstanceWithLines(lines);
			// eslint-disable-next-line local/code-no-any-casts
			const marker = { line: -5 } as any;
			const output = getOutput(instance, marker);
			strictEqual(output, 'line 0\nline 1');
		});
	});

	suite('getImages', () => {
		test('should return empty array when xterm is undefined', async () => {
			const instance = { xterm: undefined } as unknown as ITerminalInstance;
			const images = await getImages(instance);
			deepStrictEqual(images, []);
		});

		test('should return empty array when xterm.raw is undefined', async () => {
			const instance = { xterm: { raw: undefined } } as unknown as ITerminalInstance;
			const images = await getImages(instance);
			deepStrictEqual(images, []);
		});

		test('should return empty array when no images in range', async () => {
			const instance = createMockInstanceWithImages([]);
			const images = await getImages(instance);
			deepStrictEqual(images, []);
		});

		test('should cap images to MAX_IMAGES limit', async () => {
			// Create more canvases than the limit (MAX_IMAGES = 3)
			const canvases: HTMLCanvasElement[] = [];
			for (let i = 0; i < 10; i++) {
				const canvas = document.createElement('canvas');
				canvas.width = 1;
				canvas.height = 1;
				canvases.push(canvas);
			}
			const instance = createMockInstanceWithImages(canvases);
			const images = await getImages(instance);
			strictEqual(images.length, 3);
		});
	});
});

function createMockInstanceWithLines(lines: string[]): ITerminalInstance {
	const mockLines = lines.map(text => ({
		translateToString: (_trimRight?: boolean) => text,
		length: text.length,
		getCell: () => null,
		isWrapped: false,
	}));

	const buffer = {
		get length() { return lines.length; },
		getLine: (y: number) => y >= 0 && y < mockLines.length ? mockLines[y] : undefined,
		type: 'normal' as const,
		cursorX: 0,
		cursorY: 0,
		viewportY: 0,
		baseY: 0,
	};

	return {
		xterm: {
			raw: {
				buffer: {
					active: buffer,
				},
			},
			getUniqueImagesInRange: () => [],
		},
	} as unknown as ITerminalInstance;
}

function createMockInstanceWithImages(canvases: HTMLCanvasElement[]): ITerminalInstance {
	const buffer = {
		get length() { return 24; },
		getLine: () => undefined,
		type: 'normal' as const,
		cursorX: 0,
		cursorY: 0,
		viewportY: 0,
		baseY: 0,
	};

	return {
		xterm: {
			raw: {
				buffer: {
					active: buffer,
				},
			},
			getUniqueImagesInRange: () => canvases,
		},
	} as unknown as ITerminalInstance;
}
