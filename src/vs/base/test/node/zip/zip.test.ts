/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import assert from 'assert';
import { tmpdir } from 'os';
import { createCancelablePromise } from '../../../common/async.js';
import { VSBuffer } from '../../../common/buffer.js';
import { CancellationTokenSource } from '../../../common/cancellation.js';
import { isCancellationError } from '../../../common/errors.js';
import { FileAccess } from '../../../common/network.js';
import * as path from '../../../common/path.js';
import { createZip } from '../../../common/zip.js';
import { Promises } from '../../../node/pfs.js';
import { buffer, extract, validateZip, zip } from '../../../node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils.js';
import { getRandomTestPath } from '../testUtils.js';

suite('Zip', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts browser-created ZIP archives without changing binary contents or filenames', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		try {
			const files = [
				{ path: 'generated-image-1.png', contents: VSBuffer.wrap(Uint8Array.from({ length: 256 }, (_, index) => index)) },
				{ path: 'images/\u00e9.jpeg', contents: VSBuffer.fromString('original image bytes') },
				{ path: 'empty.webp', contents: VSBuffer.alloc(0) },
			];
			const archive = path.join(testDir, 'images.zip');
			const output = path.join(testDir, 'extracted');
			await fs.promises.writeFile(archive, createZip(files).buffer);
			await createCancelablePromise(token => extract(archive, output, {}, token));
			const extracted = await Promise.all(files.map(async file => ({
				path: file.path,
				contents: [...await fs.promises.readFile(path.join(output, file.path))],
			})));
			assert.deepStrictEqual(extracted, files.map(file => ({ path: file.path, contents: [...file.contents.buffer] })));
		} finally {
			await Promises.rm(testDir);
		}
	});

	test('stores a nested archive without recompressing it and reports source bytes', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		try {
			const hostZip = path.join(testDir, 'host.zip');
			const exportZip = path.join(testDir, 'export.zip');
			await zip(hostZip, [{ path: 'events.jsonl', contents: 'event\n'.repeat(100_000) }]);
			const source = await fs.promises.readFile(hostZip);
			const progress: number[] = [];
			await zip(exportZip, [
				{ path: 'host-logs.zip', localPath: hostZip, localPathSize: source.byteLength, compress: false },
			], { onProgress: bytes => progress.push(bytes) });
			const exported = await fs.promises.readFile(exportZip);
			assert.deepStrictEqual({
				compressionMethod: exported.readUInt16LE(8),
				lastProgress: progress.at(-1),
				hostArchiveUnchanged: (await buffer(exportZip, 'host-logs.zip')).equals(source),
				hostCompressed: source.byteLength < 600_000 / 10,
			}, {
				compressionMethod: 0,
				lastProgress: source.byteLength,
				hostArchiveUnchanged: true,
				hostCompressed: true,
			});
		} finally {
			await Promises.rm(testDir);
		}
	});

	test('cancels ZIP creation while reading a source', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		const cancellation = disposables.add(new CancellationTokenSource());
		try {
			const source = path.join(testDir, 'source.log');
			await fs.promises.writeFile(source, Buffer.alloc(1024 * 1024));
			await assert.rejects(zip(path.join(testDir, 'export.zip'), [{ path: 'source.log', localPath: source }], {
				token: cancellation.token,
				onProgress: () => cancellation.cancel(),
			}), isCancellationError);
		} finally {
			await Promises.rm(testDir);
		}
	});

	test('extract should handle directories', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		await fs.promises.mkdir(testDir, { recursive: true });

		const fixtures = FileAccess.asFileUri('vs/base/test/node/zip/fixtures').fsPath;
		const fixture = path.join(fixtures, 'extract.zip');

		await createCancelablePromise(token => extract(fixture, testDir, {}, token));
		const doesExist = await Promises.exists(path.join(testDir, 'extension'));
		assert(doesExist);

		await Promises.rm(testDir);
	});

	test('zip should stream a fixed prefix of a local file', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const sourcePath = path.join(testDir, 'source.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(sourcePath, 'snapshot-appended');
		await zip(zipPath, [{ path: 'source.txt', localPath: sourcePath, localPathSize: 8 }]);

		assert.strictEqual((await buffer(zipPath, 'source.txt')).toString(), 'snapshot');

		await Promises.rm(testDir);
	});

	test('zip should clamp a prefix larger than the current file size', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const sourcePath = path.join(testDir, 'source.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(sourcePath, 'shrunk');
		// Request more bytes than the file holds: the entry contains the whole file.
		await zip(zipPath, [{ path: 'source.txt', localPath: sourcePath, localPathSize: 1024 }]);

		assert.strictEqual((await buffer(zipPath, 'source.txt')).toString(), 'shrunk');

		await Promises.rm(testDir);
	});

	test('zip should write an empty entry for a zero-length prefix', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const sourcePath = path.join(testDir, 'source.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(sourcePath, 'ignored');
		await zip(zipPath, [{ path: 'source.txt', localPath: sourcePath, localPathSize: 0 }]);

		assert.strictEqual((await buffer(zipPath, 'source.txt')).toString(), '');

		await Promises.rm(testDir);
	});

	test('zip should skip an unavailable best-effort bounded source without failing the archive', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const presentPath = path.join(testDir, 'present.txt');
		const missingPath = path.join(testDir, 'missing.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(presentPath, 'present-contents');
		const sourceErrors: { path: string; missing: boolean }[] = [];
		await zip(zipPath, [
			{ path: 'missing.txt', localPath: missingPath, localPathSize: 8, skipSourceErrors: true },
			{ path: 'present.txt', localPath: presentPath, localPathSize: 7 },
		], { onSourceError: (path, error) => sourceErrors.push({ path, missing: error.message.includes('ENOENT') }) });

		assert.deepStrictEqual({
			contents: (await buffer(zipPath, 'present.txt')).toString(),
			sourceErrors,
		}, {
			contents: 'present',
			sourceErrors: [{ path: 'missing.txt', missing: true }],
		});
		await assert.rejects(buffer(zipPath, 'missing.txt'));

		await Promises.rm(testDir);
	});

	test('zip should skip an unavailable best-effort source without a size limit', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const presentPath = path.join(testDir, 'present.txt');
		const missingPath = path.join(testDir, 'missing.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(presentPath, 'present-contents');
		await zip(zipPath, [
			{ path: 'missing.txt', localPath: missingPath, skipSourceErrors: true },
			{ path: 'present.txt', localPath: presentPath },
		]);

		assert.strictEqual((await buffer(zipPath, 'present.txt')).toString(), 'present-contents');
		await assert.rejects(buffer(zipPath, 'missing.txt'));

		await Promises.rm(testDir);
	});

	test('validateZip enforces entry and expanded-size limits', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip-validation');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await zip(zipPath, [
			{ path: 'one.txt', contents: '1234' },
			{ path: 'two.txt', contents: '5678' },
		]);

		await validateZip(zipPath, { maxEntries: 10 });
		await assert.rejects(validateZip(zipPath, { maxEntries: 1, maxUncompressedSize: 100 }), /too many entries/);
		await assert.rejects(validateZip(zipPath, { maxEntries: 10, maxUncompressedSize: 7 }), /expands beyond the allowed size/);
		await Promises.rm(testDir);
	});
});
