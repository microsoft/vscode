/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readUInt16LE, VSBuffer } from '../../common/buffer.js';
import { createZip } from '../../common/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('createZip', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates an empty archive', () => {
		assert.deepStrictEqual([...createZip([]).buffer], [
			0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		]);
	});

	test('writes stored entries with UTF-8 names, checksums, and matching directory offsets', () => {
		const name = 'images/\u00e9.png';
		const nameLength = VSBuffer.fromString(name).byteLength;
		const contents = VSBuffer.fromString('_123456789_').slice(1, 10);
		const archive = createZip([{ path: name, contents }, { path: 'empty.png', contents: VSBuffer.alloc(0) }]);
		const secondOffset = 30 + nameLength + contents.byteLength;
		const centralOffset = secondOffset + 30 + 'empty.png'.length;
		const secondCentralOffset = centralOffset + 46 + nameLength;
		const end = archive.slice(-22);
		assert.deepStrictEqual({
			signature: archive.readUInt32LE(0),
			flags: readUInt16LE(archive.buffer, 6),
			compression: readUInt16LE(archive.buffer, 8),
			crc: archive.readUInt32LE(14) >>> 0,
			size: archive.readUInt32LE(18),
			uncompressedSize: archive.readUInt32LE(22),
			name: archive.slice(30, 30 + nameLength).toString(),
			contents: archive.slice(30 + nameLength, secondOffset).toString(),
			emptySignature: archive.readUInt32LE(secondOffset),
			emptyCrc: archive.readUInt32LE(secondOffset + 14),
			centralSignature: archive.readUInt32LE(centralOffset),
			centralMetadata: [...archive.slice(centralOffset + 6, centralOffset + 30).buffer],
			firstOffset: archive.readUInt32LE(centralOffset + 42),
			secondOffset: archive.readUInt32LE(secondCentralOffset + 42),
			endSignature: end.readUInt32LE(0),
			diskEntries: readUInt16LE(end.buffer, 8),
			totalEntries: readUInt16LE(end.buffer, 10),
			directorySize: end.readUInt32LE(12),
			directoryOffset: end.readUInt32LE(16),
		}, {
			signature: 0x04034b50,
			flags: 0x0800,
			compression: 0,
			crc: 0xcbf43926,
			size: 9,
			uncompressedSize: 9,
			name,
			contents: '123456789',
			emptySignature: 0x04034b50,
			emptyCrc: 0,
			centralSignature: 0x02014b50,
			centralMetadata: [...archive.slice(4, 28).buffer],
			firstOffset: 0,
			secondOffset,
			endSignature: 0x06054b50,
			diskEntries: 2,
			totalEntries: 2,
			directorySize: 2 * 46 + nameLength + 'empty.png'.length,
			directoryOffset: centralOffset,
		});
	});

	for (const path of ['', '/absolute.png', '../outside.png', 'images/../outside.png', './image.png', 'C:/image.png', 'images\\image.png', 'images//image.png', 'image\0.png']) {
		test(`rejects unsafe path ${JSON.stringify(path)}`, () => {
			assert.throws(() => createZip([{ path, contents: VSBuffer.alloc(0) }]), /relative file paths/);
		});
	}

	test('rejects duplicate paths', () => {
		const file = { path: 'image.png', contents: VSBuffer.alloc(0) };
		assert.throws(() => createZip([file, file]), /unique paths/);
	});

	test('checks the encoded filename length', () => {
		assert.throws(() => createZip([{ path: '\u00e9'.repeat(0x8000), contents: VSBuffer.alloc(0) }]), /path is too long/);
	});

	test('rejects entry counts requiring ZIP64', () => {
		assert.throws(() => createZip(Array.from({ length: 0xffff }, () => ({ path: 'image.png', contents: VSBuffer.alloc(0) }))), /Too many files/);
	});
});
