/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClipboardMediaStore, clipboardMediaChunkSize, readClipboardMediaContents } from '../src/preview/markdownEditorMediaTransfer.ts';

test('retains metadata without reading files and transfers exact bytes in bounded sequential chunks', async () => {
	const bytes = Uint8Array.from({ length: clipboardMediaChunkSize * 2 + 37 }, (_, index) => index % 256);
	const slices: [number | undefined, number | undefined][] = [];
	class TrackedFile extends File {
		override slice(start?: number, end?: number): Blob {
			slices.push([start, end]);
			return super.slice(start, end);
		}
		override arrayBuffer(): Promise<ArrayBuffer> {
			throw new Error('Must not read the whole clipboard file');
		}
	}
	const store = new ClipboardMediaStore([new TrackedFile([bytes], 'clip.mp4', { type: 'video/mp4' })]);
	const controller = new AbortController();
	try {
		assert.deepStrictEqual({ images: store.images.map(({ id, ...image }) => ({ ...image, hasId: !!id })), slices }, {
			images: [{ name: 'clip.mp4', mime: 'video/mp4', size: bytes.length, hasId: true }], slices: [],
		});
		let active = 0;
		let peak = 0;
		const result = await readClipboardMediaContents(store.images[0], async request => {
			peak = Math.max(peak, ++active);
			const chunk = await store.read(request, controller.signal);
			assert.ok(chunk.base64.length <= 4 * Math.ceil(clipboardMediaChunkSize / 3));
			active--;
			return chunk;
		}, () => { });
		assert.deepStrictEqual({ bytes: result, slices, peak }, {
			bytes,
			slices: [[0, clipboardMediaChunkSize], [clipboardMediaChunkSize, clipboardMediaChunkSize * 2], [clipboardMediaChunkSize * 2, bytes.length]],
			peak: 1,
		});
	} finally { store.dispose(); }
});

test('rejects oversized, invalid, unknown and expired chunk requests', async () => {
	const store = new ClipboardMediaStore([new File(['abcd'], 'image.png', { type: 'image/png' })]);
	const signal = new AbortController().signal;
	const request = { id: store.images[0].id, offset: 0, length: 4 };
	try {
		for (const invalid of [
			{ length: clipboardMediaChunkSize + 1 }, { offset: -1 }, { offset: 0.5 },
			{ length: 0 }, { offset: 1 }, { id: 'unknown' },
		]) {
			await assert.rejects(store.read({ ...request, ...invalid }, signal), /Invalid or expired/);
		}
		store.dispose();
		await assert.rejects(store.read(request, signal), /Invalid or expired/);
	} finally { store.dispose(); }
});

test('transfers a file larger than 25 MiB without a whole-file base64 payload or a file-size cap', async () => {
	const bytes = new Uint8Array(25 * 1024 * 1024 + 1);
	bytes[0] = 19;
	bytes[bytes.length - 1] = 71;
	const store = new ClipboardMediaStore([new File([bytes], 'large.mp4', { type: 'video/mp4' })]);
	const signal = new AbortController().signal;
	let calls = 0;
	try {
		const actual = await readClipboardMediaContents(store.images[0], request => {
			calls++;
			assert.ok(request.length <= clipboardMediaChunkSize);
			return store.read(request, signal);
		}, () => { });
		assert.deepStrictEqual(actual, bytes);
		assert.strictEqual(calls, 101);
	} finally { store.dispose(); }
});

test('stops after cancellation or a stale edit without requesting the next chunk', async () => {
	for (const cancel of [true, false]) {
		const store = new ClipboardMediaStore([new File([new Uint8Array(clipboardMediaChunkSize + 1)], 'clip.mp4', { type: 'video/mp4' })]);
		const controller = new AbortController();
		let calls = 0;
		let stale = false;
		try {
			await assert.rejects(readClipboardMediaContents(store.images[0], async request => {
				calls++;
				const result = await store.read(request, controller.signal);
				if (cancel) { controller.abort(); } else { stale = true; }
				return result;
			}, () => {
				controller.signal.throwIfAborted();
				if (stale) { throw new Error('stale'); }
			}));
			assert.strictEqual(calls, 1);
		} finally { store.dispose(); }
	}
});

test('propagates read errors and rejects malformed or truncated responses', async () => {
	const file = { id: 'file', name: 'image.png', mime: 'image/png', size: 4 };
	await assert.rejects(readClipboardMediaContents(file, async () => { throw new Error('read failed'); }, () => { }), /read failed/);
	for (const base64 of ['!', 'AQID', 'AQIDBAU=', '!!!!!!!!']) {
		await assert.rejects(readClipboardMediaContents(file, async () => ({ base64 }), () => { }), /clipboard media chunk/);
	}
});

test('rejects disposal and cancellation while a chunk read is pending', async () => {
	for (const cancel of [true, false]) {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<ArrayBuffer>();
		class DelayedFile extends File {
			override slice(): Blob {
				const blob = super.slice();
				blob.arrayBuffer = () => { entered.resolve(); return finish.promise; };
				return blob;
			}
		}
		const store = new ClipboardMediaStore([new DelayedFile(['abcd'], 'image.png', { type: 'image/png' })]);
		const controller = new AbortController();
		try {
			const result = store.read({ id: store.images[0].id, offset: 0, length: 4 }, controller.signal);
			await entered.promise;
			if (cancel) { controller.abort(); } else { store.dispose(); }
			finish.resolve(new ArrayBuffer(4));
			await assert.rejects(result);
		} finally { store.dispose(); }
	}
});
