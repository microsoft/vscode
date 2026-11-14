/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getExtensionForMimeType, getMediaMime, getMediaOrTextMime, normalizeMimeType } from '../../common/mime.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Mime', () => {

	test('normalize', () => {
		assert.strictEqual(normalizeMimeType('invalid'), 'invalid');
		assert.strictEqual(normalizeMimeType('invalid', true), undefined);
		assert.strictEqual(normalizeMimeType('Text/plain'), 'text/plain');
		assert.strictEqual(normalizeMimeType('Text/pläin'), 'text/pläin');
		assert.strictEqual(normalizeMimeType('Text/plain;UPPER'), 'text/plain;UPPER');
		assert.strictEqual(normalizeMimeType('Text/plain;lower'), 'text/plain;lower');
	});

	test('normalize preserves case in parameters containing slashes', () => {
		for (const strict of [false, true]) {
			const normalize = (value: string) => strict ? normalizeMimeType(value, true) : normalizeMimeType(value);
			assert.deepStrictEqual([
				normalize('Multipart/FORM-DATA; boundary="AbC/DeF"'),
				normalize('Application/SOAP+XML; action="https://Example.com/Action"'),
				normalize('Text/PLAIN; charset=UTF-8; name="Dir/File.TXT"'),
			], [
				'multipart/form-data; boundary="AbC/DeF"',
				'application/soap+xml; action="https://Example.com/Action"',
				'text/plain; charset=UTF-8; name="Dir/File.TXT"',
			]);
		}
	});

	test('normalize preserves invalid MIME types with line terminators', () => {
		for (const lineTerminator of ['\n', '\r', '\u2028', '\u2029']) {
			const mimeType = `Text${lineTerminator}/PLAIN`;
			assert.deepStrictEqual([
				normalizeMimeType(mimeType),
				normalizeMimeType(mimeType, true),
			], [mimeType, undefined]);
		}
	});

	test('getExtensionForMimeType', () => {
		// Note: for MIME types with multiple extensions (e.g., image/jpg -> .jpe, .jpeg, .jpg),
		// the function returns the first matching extension in iteration order
		assert.ok(['.jpe', '.jpeg', '.jpg'].includes(getExtensionForMimeType('image/jpg')!));
		// image/jpeg is an alias for image/jpg and should also return a valid extension
		assert.ok(['.jpe', '.jpeg', '.jpg'].includes(getExtensionForMimeType('image/jpeg')!));
		assert.strictEqual(getExtensionForMimeType('image/avif'), '.avif');
		assert.strictEqual(getExtensionForMimeType('image/png'), '.png');
		assert.strictEqual(getExtensionForMimeType('image/gif'), '.gif');
		assert.strictEqual(getExtensionForMimeType('image/webp'), '.webp');
		assert.ok(['.mp2', '.mp2a', '.mp3', '.mpga', '.m2a', '.m3a'].includes(getExtensionForMimeType('audio/mpeg')!));
		assert.ok(['.mp4', '.mp4v', '.mpg4'].includes(getExtensionForMimeType('video/mp4')!));
		assert.strictEqual(getExtensionForMimeType('text/plain'), '.txt');
		assert.strictEqual(getExtensionForMimeType('unknown/type'), undefined);
	});

	test('getMediaMime', () => {
		assert.strictEqual(getMediaMime('profile.avif'), 'image/avif');
	});

	test('getMediaOrTextMime', () => {
		assert.deepStrictEqual(
			['a.json', 'a.js.map', 'a.pdf', 'a.wasm', 'a.woff2', 'a.ttf', 'a.otf', 'a.PDF', 'a.png', 'a.unknown'].map(getMediaOrTextMime),
			['application/json', 'application/json', 'application/pdf', 'application/wasm', 'font/woff2', 'font/ttf', 'font/otf', 'application/pdf', 'image/png', undefined]
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
