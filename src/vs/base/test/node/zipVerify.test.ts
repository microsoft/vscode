/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { crc32, ZipVerifyError, ZipVerifyErrorCode, verifyZipFile, quickVerifyZip, verifyZipStream } from '../../node/zipVerify.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('zipVerify', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let tmpDir: string;

	setup(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zipverify-test-'));
	});

	teardown(async () => {
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch { /* ignore cleanup errors */ }
	});

	suite('crc32', () => {
		test('empty buffer returns expected CRC', () => {
			const result = crc32(Buffer.alloc(0));
			assert.strictEqual(result, 0x00000000);
		});

		test('known string has correct CRC32', () => {
			const result = crc32(Buffer.from('hello'));
			assert.strictEqual(result, 0x3610a686);
		});

		test('different data produces different CRCs', () => {
			const crc1 = crc32(Buffer.from('abc'));
			const crc2 = crc32(Buffer.from('def'));
			assert.notStrictEqual(crc1, crc2);
		});

		test('same data produces same CRC', () => {
			const data = Buffer.from('test data for crc32');
			const crc1 = crc32(data);
			const crc2 = crc32(data);
			assert.strictEqual(crc1, crc2);
		});

		test('CRC is always a 32-bit unsigned integer', () => {
			const data = Buffer.from('any data here');
			const result = crc32(data);
			assert.ok(result >= 0);
			assert.ok(result <= 0xFFFFFFFF);
		});
	});

	suite('ZipVerifyError', () => {
		test('creates error with correct code and message', () => {
			const err = new ZipVerifyError(ZipVerifyErrorCode.CorruptHeader, 'test message');
			assert.strictEqual(err.code, ZipVerifyErrorCode.CorruptHeader);
			assert.strictEqual(err.message, 'test message');
			assert.strictEqual(err.name, 'ZipVerifyError');
		});

		test('creates error with details', () => {
			const details = { entryIndex: 5, entryName: 'test.txt', expectedCrc: 123, actualCrc: 456 };
			const err = new ZipVerifyError(ZipVerifyErrorCode.BadCRC, 'crc mismatch', details);
			assert.strictEqual(err.details?.entryIndex, 5);
			assert.strictEqual(err.details?.entryName, 'test.txt');
			assert.strictEqual(err.details?.expectedCrc, 123);
			assert.strictEqual(err.details?.actualCrc, 456);
		});

		test('is instance of Error', () => {
			const err = new ZipVerifyError(ZipVerifyErrorCode.IOError, 'io error');
			assert.ok(err instanceof Error);
			assert.ok(err instanceof ZipVerifyError);
		});
	});

	suite('verifyZipFile', () => {
		test('returns IOError for non-existent file', async () => {
			const result = await verifyZipFile(path.join(tmpDir, 'nonexistent.zip'));
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.errors.length, 1);
			assert.strictEqual(result.errors[0].code, ZipVerifyErrorCode.IOError);
		});

		test('returns error for empty file', async () => {
			const emptyPath = path.join(tmpDir, 'empty.zip');
			await fs.writeFile(emptyPath, Buffer.alloc(0));
			const result = await verifyZipFile(emptyPath);
			assert.strictEqual(result.valid, false);
		});

		test('returns error for file too small to be zip', async () => {
			const smallPath = path.join(tmpDir, 'small.zip');
			await fs.writeFile(smallPath, Buffer.from('not a zip'));
			const result = await verifyZipFile(smallPath);
			assert.strictEqual(result.valid, false);
		});

		test('returns error for truncated file', async () => {
			const truncPath = path.join(tmpDir, 'truncated.zip');
			// Write just the EOCD signature with incomplete data
			const buf = Buffer.alloc(22);
			buf.writeUInt32LE(0x06054b50, 0); // EOCD signature
			// Rest is zeros - central dir offset points to nothing valid
			await fs.writeFile(truncPath, buf);
			const result = await verifyZipFile(truncPath);
			// Should parse but find issues with central directory
			assert.strictEqual(result.fileCount, 0);
		});

		test('respects maxFileCount option', async () => {
			// Create a minimal valid zip with EOCD saying it has 100k files
			const buf = Buffer.alloc(22);
			buf.writeUInt32LE(0x06054b50, 0); // EOCD signature
			buf.writeUInt16LE(0, 4);  // disk number
			buf.writeUInt16LE(0, 6);  // central dir disk
			buf.writeUInt16LE(50000, 8);  // entries on disk
			buf.writeUInt16LE(50000, 10); // total entries
			buf.writeUInt32LE(0, 12);     // central dir size
			buf.writeUInt32LE(0, 16);     // central dir offset
			buf.writeUInt16LE(0, 20);     // comment length
			await fs.writeFile(path.join(tmpDir, 'many.zip'), buf);
			const result = await verifyZipFile(path.join(tmpDir, 'many.zip'), { maxFileCount: 100 });
			assert.ok(result.errors.some(e => e.code === ZipVerifyErrorCode.FileCountMismatch));
		});
	});

	suite('quickVerifyZip', () => {
		test('returns invalid for non-existent file', async () => {
			const result = await quickVerifyZip(path.join(tmpDir, 'nope.zip'));
			assert.strictEqual(result.valid, false);
			assert.ok(result.error);
		});

		test('returns invalid for too-small file', async () => {
			const tinyPath = path.join(tmpDir, 'tiny.zip');
			await fs.writeFile(tinyPath, Buffer.from('hi'));
			const result = await quickVerifyZip(tinyPath);
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes('too small'));
		});
	});

	test('verifyZipStream — succeeds on a small valid zip', async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zipverify-stream-'));
		const zipPath = path.join(tmpDir, 'tiny.zip');
		// Minimal empty-zip file: just an end-of-central-directory record.
		const eocd = Buffer.from([
			0x50, 0x4b, 0x05, 0x06, // EOCD signature
			0x00, 0x00, 0x00, 0x00, // disk numbers
			0x00, 0x00, 0x00, 0x00, // entries
			0x00, 0x00, 0x00, 0x00, // central directory size
			0x00, 0x00, 0x00, 0x00, // central directory offset
			0x00, 0x00              // comment length
		]);
		await fs.writeFile(zipPath, eocd);
		const result = await verifyZipStream(zipPath, 0);
		assert.strictEqual(result.valid, true, `expected valid, got errors: ${result.errors.join(', ')}`);
		await fs.rm(tmpDir, { recursive: true, force: true });
	});
});
