/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, spy, stub } from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { getIssueReporterScreenshotFile, MAX_ISSUE_FILE_BYTES, MAX_ISSUE_IMAGE_BYTES, MAX_ISSUE_VIDEO_BYTES, readIssueReporterImage, readIssueReporterMediaFile, readIssueReporterVideo, validateIssueReporterMediaFile } from '../../browser/issueReporterMedia.js';
import { issueReporterAvifFixture, issueReporterGifFixture, issueReporterImageFixture, issueReporterVideoFixtures, issueReporterWebpFixture } from '../common/issueReporterMediaFixtures.js';

suite('Issue reporter media decoding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	test('names captures from the effective image format including annotations', () => {
		const sources = [
			{ dataUrl: issueReporterImageFixture },
			{ dataUrl: issueReporterGifFixture },
			{ dataUrl: issueReporterWebpFixture },
			{ dataUrl: issueReporterAvifFixture, annotatedDataUrl: issueReporterImageFixture },
		];
		assert.deepStrictEqual(sources.map((screenshot, index) => {
			const { dataUrl, name, format } = getIssueReporterScreenshotFile(screenshot, index + 1);
			return { name, mimeType: format.mimeType, effectiveImage: dataUrl === (screenshot.annotatedDataUrl ?? screenshot.dataUrl) };
		}), [
			{ name: 'screenshot-1.png', mimeType: 'image/png', effectiveImage: true },
			{ name: 'screenshot-2.gif', mimeType: 'image/gif', effectiveImage: true },
			{ name: 'screenshot-3.webp', mimeType: 'image/webp', effectiveImage: true },
			{ name: 'screenshot-4.png', mimeType: 'image/png', effectiveImage: true },
		]);
	});

	for (const [name, type, mimeType, extension] of [
		['image.PNG', '', 'image/png', 'png'],
		['photo.JPEG', '', 'image/jpeg', 'jpeg'],
		['photo.jpe', 'application/octet-stream', 'image/jpeg', 'jpe'],
		['', 'image/jpg', 'image/jpg', 'jpg'],
		['', 'IMAGE/WEBP', 'IMAGE/WEBP', 'webp'],
		['image.gif', 'image/gif', 'image/gif', 'gif'],
		['image.avif', 'image/avif', 'image/avif', 'avif'],
		['recording.MP4', '', 'video/mp4', 'mp4'],
		['', 'video/webm;codecs=vp9', 'video/webm;codecs=vp9', 'webm'],
		['clip.MOV', 'application/octet-stream', 'video/quicktime', 'mov'],
		['clip.MOV', 'APPLICATION/OCTET-STREAM; charset=binary', 'video/quicktime', 'mov'],
	]) {
		test(`resolves supported media metadata for ${name || type}`, () => {
			const format = validateIssueReporterMediaFile({ name, type, size: 1 });
			assert.deepStrictEqual({ mimeType: format.mimeType, extension: format.extension }, { mimeType, extension });
		});
	}

	test('preserves safe original suffixes for filename-based attachment previews', () => {
		const files = [
			['report.ipynb', '', 'ipynb'],
			['report.ipynb', 'application/json', 'ipynb'],
			['report.ipynb', 'application/x-ipynb+json', 'ipynb'],
			['report.ipynb', 'text/plain', 'ipynb'],
			['report.PDF', 'application/pdf', 'pdf'],
			['trace.json', 'application/json', 'json'],
			['notes.md', 'text/plain', 'md'],
			['source.c++', '', 'c++'],
			['bundle.zip', 'application/octet-stream', 'zip'],
			['unnamed', 'text/plain', 'txt'],
			['file.txt:stream', '', 'bin'],
			['file.bad\\suffix', '', 'bin'],
			['file.', '', 'bin'],
			['.env', '', 'bin'],
			['', '', 'bin'],
		];
		assert.deepStrictEqual(files.map(([name, type]) => validateIssueReporterMediaFile({ name, type, size: 1 }).extension), files.map(([, , extension]) => extension));
	});

	for (const [name, type] of [
		['document.pdf', 'application/pdf'],
		['vector.svg', 'image/svg+xml'],
		['image.bmp', 'image/bmp'],
		['image.png', 'application/pdf'],
		['unknown', ''],
		['', ''],
	]) {
		test(`accepts files without an extension allowlist: ${name || 'unnamed'}`, () => {
			assert.strictEqual(validateIssueReporterMediaFile({ name, type, size: 100 }).mimeType, type || 'application/octet-stream');
		});
	}

	for (const [name, type, maximum] of [
		['image.png', 'image/png', MAX_ISSUE_IMAGE_BYTES],
		['video.mp4', 'video/mp4', MAX_ISSUE_VIDEO_BYTES],
		['bundle.zip', 'application/zip', MAX_ISSUE_FILE_BYTES],
	] as const) {
		test(`checks exact byte boundaries for ${type} before decoding`, () => {
			const outcomes = [0, 1, maximum - 1, maximum, maximum + 1].map(size => {
				try {
					validateIssueReporterMediaFile({ name, type, size });
					return 'accepted';
				} catch {
					return 'rejected';
				}
			});
			assert.deepStrictEqual({ maximum, outcomes }, {
				maximum: type === 'image/png' ? 10485760 : type === 'video/mp4' ? 104857600 : 26214400,
				outcomes: ['accepted', 'accepted', 'accepted', 'accepted', 'rejected'],
			});
		});
	}

	test('reads undecodable video and generic files without inspecting or changing their contents', async () => {
		const contents = new Uint8Array([0, 1, 2, 3]);
		const results = [];
		for (const [name, type] of [['broken.mov', 'video/quicktime'], ['bundle.zip', 'application/zip'], ['file.unfamiliar', 'application/x-custom']]) {
			const file = new File([contents], name, { type });
			const slice = spy(file, 'slice');
			const result = await readIssueReporterMediaFile(file, CancellationToken.None);
			results.push({ name: file.name, type: result.format.mimeType, bytes: [...result.bytes.buffer], headerReads: slice.callCount });
		}
		assert.deepStrictEqual(results, [
			{ name: 'broken.mov', type: 'video/quicktime', bytes: [0, 1, 2, 3], headerReads: 0 },
			{ name: 'bundle.zip', type: 'application/zip', bytes: [0, 1, 2, 3], headerReads: 0 },
			{ name: 'file.unfamiliar', type: 'application/x-custom', bytes: [0, 1, 2, 3], headerReads: 0 },
		]);
	});

	test('decodes a real PNG and removes its source and listeners', async () => {
		const image = mainWindow.document.createElement('img');
		const added = spy(image, 'addEventListener');
		const removed = spy(image, 'removeEventListener');
		const dimensions = await readIssueReporterImage(issueReporterImageFixture, CancellationToken.None, () => image);
		assert.deepStrictEqual({ dimensions, source: image.getAttribute('src'), listeners: added.callCount - removed.callCount }, { dimensions: { width: 48, height: 32 }, source: null, listeners: 0 });
	});

	for (const type of ['image/jpeg', 'image/webp']) {
		test(`decodes a real ${type} without changing its dimensions`, async () => {
			const canvas = mainWindow.document.createElement('canvas');
			canvas.width = 48;
			canvas.height = 32;
			canvas.getContext('2d')!.fillRect(0, 0, 48, 32);
			const dataUrl = type === 'image/webp' ? issueReporterWebpFixture : canvas.toDataURL(type);
			const { format } = await readIssueReporterMediaFile(new File([new Uint8Array(decodeBase64(dataUrl.split(',')[1]).buffer)], '', { type }), CancellationToken.None);
			const dimensions = await readIssueReporterImage(dataUrl, CancellationToken.None);
			assert.deepStrictEqual({ dimensions, mimeType: format.mimeType }, { dimensions: { width: 48, height: 32 }, mimeType: type });
		});
	}

	for (const [type, dataUrl, size] of [['image/gif', issueReporterGifFixture, 1], ['image/avif', issueReporterAvifFixture, 64]] as const) {
		test(`detects and decodes a real ${type}`, async () => {
			const { format } = await readIssueReporterMediaFile(new File([new Uint8Array(decodeBase64(dataUrl.split(',')[1]).buffer)], '', { type }), CancellationToken.None);
			const dimensions = await readIssueReporterImage(dataUrl, CancellationToken.None);
			assert.deepStrictEqual({ mimeType: format.mimeType, dimensions }, { mimeType: type, dimensions: { width: size, height: size } });
		});
	}

	for (const extension of ['mp4', 'webm', 'mov'] as const) {
		// The WebM case: WebM can't be opened on the shipped (feed) Electron that product builds test with (`PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed`), so this is skipped until https://github.com/microsoft/vscode/issues/343345 is fixed.
		(extension === 'webm' ? test.skip : test)(`decodes real ${extension} or explicitly rejects an unsupported container or codec, with complete cleanup`, async () => {
			const video = mainWindow.document.createElement('video');
			const added = spy(video, 'addEventListener');
			const removed = spy(video, 'removeEventListener');
			const mimeType = extension === 'mov' ? 'video/quicktime' : `video/${extension}`;
			const playbackMimeType = extension === 'webm' ? 'video/webm;codecs=vp8' : mimeType;
			const unsupportedMedia = !video.canPlayType(playbackMimeType);
			// WebKit requires a same-origin WebM source to export the thumbnail.
			const videoUrl = extension === 'webm'
				? URL.createObjectURL(new Blob([new Uint8Array(decodeBase64(issueReporterVideoFixtures[extension]).buffer)], { type: mimeType }))
				: `data:${mimeType};base64,${issueReporterVideoFixtures[extension]}`;
			if (extension === 'webm') {
				store.add(toDisposable(() => URL.revokeObjectURL(videoUrl)));
			}
			const operation = readIssueReporterVideo(videoUrl, CancellationToken.None, () => video);
			if (unsupportedMedia) {
				await assert.rejects(operation, /could not be decoded/);
				assert.deepStrictEqual({ source: video.getAttribute('src'), paused: video.paused, listeners: added.callCount - removed.callCount }, { source: null, paused: true, listeners: 0 });
				return;
			}
			const metadata = await operation;
			const thumbnailSize = await readIssueReporterImage(metadata.thumbnailDataUrl, CancellationToken.None);
			assert.deepStrictEqual({
				width: metadata.width, height: metadata.height, durationMs: metadata.durationMs,
				thumbnailSize, source: video.getAttribute('src'), paused: video.paused,
				listeners: added.callCount - removed.callCount,
			}, { width: 48, height: 32, durationMs: 500, thumbnailSize: { width: 48, height: 32 }, source: null, paused: true, listeners: 0 });
		});
	}

	// WebM can't be opened on the shipped (feed) Electron that product builds test with (`PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed`), so this is skipped until https://github.com/microsoft/vscode/issues/343345 is fixed.
	test.skip('does not invent a duration for a WebM recording without duration metadata', async () => {
		const bytes = new Uint8Array(decodeBase64(issueReporterVideoFixtures.webm).buffer);
		const durationTag = bytes.findIndex((value, index) => value === 0x44 && bytes[index + 1] === 0x89 && bytes[index + 2] === 0x88);
		assert.ok(durationTag >= 0);
		bytes[durationTag] = 0xEC; // Replace Duration with an equally sized EBML Void element.
		const recording = new File([bytes], 'recording.webm', { type: 'video/webm' });
		const file = await readIssueReporterMediaFile(recording, CancellationToken.None);
		const videoUrl = URL.createObjectURL(recording);
		store.add(toDisposable(() => URL.revokeObjectURL(videoUrl)));
		const video = mainWindow.document.createElement('video');
		const operation = readIssueReporterVideo(videoUrl, CancellationToken.None, () => video);
		if (!video.canPlayType('video/webm;codecs=vp8')) {
			await assert.rejects(operation, /could not be decoded/);
			assert.strictEqual(file.durationMs, undefined);
			return;
		}
		const metadata = await operation;
		assert.deepStrictEqual({ width: metadata.width, height: metadata.height, durationMs: file.durationMs, thumbnail: metadata.thumbnailDataUrl.startsWith('data:image/jpeg') }, { width: 48, height: 32, durationMs: undefined, thumbnail: true });
	});

	test('reads declared WebM duration with its timestamp scale', async () => {
		const prefix = new Uint8Array(decodeBase64(issueReporterVideoFixtures.webm).buffer.slice(0, 36));
		const duration = new Uint8Array(4);
		new DataView(duration.buffer).setFloat32(0, 12.5);
		const fields = new Uint8Array([0x2A, 0xD7, 0xB1, 0x83, 0x1E, 0x84, 0x80, 0x44, 0x89, 0x84, ...duration]);
		const file = new File([prefix, new Uint8Array([0x18, 0x53, 0x80, 0x67, 0xFF, 0x15, 0x49, 0xA9, 0x66, 0x80 | fields.length]), fields], 'recording.webm', { type: 'video/webm' });
		const result = await readIssueReporterMediaFile(file, CancellationToken.None);
		assert.strictEqual(result.durationMs, 25);
	});

	for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
		test(`ignores invalid declared WebM duration ${value}`, async () => {
			const bytes = new Uint8Array(decodeBase64(issueReporterVideoFixtures.webm).buffer);
			const durationTag = bytes.findIndex((byte, index) => byte === 0x44 && bytes[index + 1] === 0x89 && bytes[index + 2] === 0x88);
			new DataView(bytes.buffer).setFloat64(durationTag + 3, value);
			const result = await readIssueReporterMediaFile(new File([bytes], 'recording.webm', { type: 'video/webm' }), CancellationToken.None);
			assert.strictEqual(result.durationMs, undefined);
		});
	}

	test('bounds WebM metadata traversal and ignores truncated element sizes', async () => {
		const prefix = new Uint8Array(decodeBase64(issueReporterVideoFixtures.webm).buffer.slice(0, 36));
		const segment = new Uint8Array([0x18, 0x53, 0x80, 0x67, 0xFF]);
		const manyElements = new Uint8Array(Array.from({ length: 1024 }, (_, index) => index % 2 ? 0x80 : 0xEC));
		const outcomes: (number | undefined)[] = [];
		for (const fields of [manyElements, new Uint8Array([0x15, 0x49, 0xA9, 0x66, 0xFE]), new Uint8Array([0x15, 0x49, 0xA9, 0x66, 0])]) {
			const result = await readIssueReporterMediaFile(new File([prefix, segment, fields], 'recording.webm', { type: 'video/webm' }), CancellationToken.None);
			outcomes.push(result.durationMs);
		}
		assert.deepStrictEqual(outcomes, [undefined, undefined, undefined]);
	});

	test('rejects corrupt image and video payloads rather than returning empty metadata', async () => {
		await assert.rejects(readIssueReporterImage('data:image/png;base64,bm90IGFuIGltYWdl', CancellationToken.None), /could not be decoded/);
		await assert.rejects(readIssueReporterVideo('data:video/mp4;base64,bm90IGEgdmlkZW8=', CancellationToken.None), /could not be decoded/);
	});

	for (const kind of ['image', 'video'] as const) {
		test(`cancels a pending ${kind} decoder and removes its source and listeners`, async () => {
			const token = store.add(new CancellationTokenSource());
			const element = kind === 'image' ? mainWindow.document.createElement('img') : mainWindow.document.createElement('video');
			stub(element, 'src').set(() => { });
			const added = spy(element, 'addEventListener');
			const removed = spy(element, 'removeEventListener');
			const operation = element instanceof HTMLImageElement
				? readIssueReporterImage('pending', token.token, () => element)
				: readIssueReporterVideo('pending', token.token, () => element);
			token.cancel();
			await assert.rejects(operation, CancellationError);
			assert.deepStrictEqual({ listeners: added.callCount - removed.callCount, source: element.getAttribute('src') }, { listeners: 0, source: null });
		});

		test(`times out a stalled ${kind} decoder with complete cleanup`, () => runWithFakedTimers({}, async () => {
			const element = kind === 'image' ? mainWindow.document.createElement('img') : mainWindow.document.createElement('video');
			stub(element, 'src').set(() => { });
			const added = spy(element, 'addEventListener');
			const removed = spy(element, 'removeEventListener');
			const operation = element instanceof HTMLImageElement
				? readIssueReporterImage('pending', CancellationToken.None, () => element)
				: readIssueReporterVideo('pending', CancellationToken.None, () => element);
			await assert.rejects(operation, /could not be decoded/);
			assert.deepStrictEqual({ listeners: added.callCount - removed.callCount, source: element.getAttribute('src') }, { listeners: 0, source: null });
		}));
	}

	test('does not create a decoder when cancellation was already requested', async () => {
		let created = false;
		await assert.rejects(readIssueReporterImage(issueReporterImageFixture, CancellationToken.Cancelled, () => {
			created = true;
			return mainWindow.document.createElement('img');
		}), CancellationError);
		await assert.rejects(readIssueReporterVideo('unused', CancellationToken.Cancelled, () => {
			created = true;
			return mainWindow.document.createElement('video');
		}), CancellationError);
		assert.strictEqual(created, false);
	});
});
