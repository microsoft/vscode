/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNativeClipboardMedia } from '../markdown-editor-src/clipboardMedia.ts';

test('preserves native image, video, and audio file identity and bytes', async () => {
	const files = [
		new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' }),
		new File([new Uint8Array([4, 5, 6])], 'clip.mp4', { type: 'video/mp4' }),
		new File([new Uint8Array([7, 8, 9])], 'sound.mp3', { type: 'audio/mpeg' }),
	];
	const result = getNativeClipboardMedia({ text: 'fallback', files }, false);
	assert.deepStrictEqual({
		text: result.text,
		files: await Promise.all(result.images.map(async file => ({ name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] }))),
	}, {
		text: 'fallback',
		files: [
			{ name: 'image.png', type: 'image/png', bytes: [1, 2, 3] },
			{ name: 'clip.mp4', type: 'video/mp4', bytes: [4, 5, 6] },
			{ name: 'sound.mp3', type: 'audio/mpeg', bytes: [7, 8, 9] },
		],
	});
	assert.ok(result.images.every((file, index) => file === files[index]));
});

test('reports unsupported and untyped native file-only payloads explicitly', () => {
	for (const type of ['application/octet-stream', '']) {
		assert.throws(() => getNativeClipboardMedia({ text: '', files: [new File(['data'], 'file.bin', { type })] }, false), /clipboard formats are not available/);
	}
});

test('preserves plain-text fallback, empty clipboard, and explicit plain-text paste', () => {
	const files = [new File(['data'], 'file.bin')];
	assert.deepStrictEqual([
		getNativeClipboardMedia({ text: 'fallback', files }, false),
		getNativeClipboardMedia({ text: '', files }, true),
		getNativeClipboardMedia({ text: '', files: [] }, false),
	], [
		{ text: 'fallback', images: [] },
		{ text: '', images: [] },
		{ text: '', images: [] },
	]);
});
