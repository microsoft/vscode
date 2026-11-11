/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, writeUInt16LE } from './buffer.js';
import { Lazy } from './lazy.js';

const crcTable = new Lazy(() => Uint32Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	return value >>> 0;
}));

function crc32(contents: VSBuffer): number {
	const table = crcTable.value;
	let crc = 0xffffffff;
	for (const byte of contents.buffer) {
		crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** Creates an uncompressed ZIP for in-memory files, without requiring Node.js. ZIP64 is not supported. */
export function createZip(files: readonly { readonly path: string; readonly contents: VSBuffer }[]): VSBuffer {
	if (files.length >= 0xffff) {
		throw new Error('Too many files for a ZIP archive without ZIP64 support.');
	}

	const paths = new Set<string>();
	let totalLength = 22;
	const entries = files.map(file => {
		if (/[\\:\0]/.test(file.path) || file.path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
			throw new Error('ZIP entries must have relative file paths.');
		}
		if (paths.has(file.path)) {
			throw new Error('ZIP entries must have unique paths.');
		}
		paths.add(file.path);
		const name = VSBuffer.fromString(file.path);
		if (name.byteLength > 0xffff) {
			throw new Error('ZIP entry path is too long.');
		}
		totalLength += 30 + 46 + 2 * name.byteLength + file.contents.byteLength;
		if (totalLength >= 0xffffffff) {
			throw new Error('ZIP archive is too large without ZIP64 support.');
		}
		return { name, contents: file.contents };
	});

	const now = new Date();
	const year = Math.max(1980, Math.min(2107, now.getFullYear()));
	const modifiedDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
	const modifiedTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >>> 1);
	const localFiles: VSBuffer[] = [];
	const centralDirectory: VSBuffer[] = [];
	let offset = 0;
	let centralDirectoryLength = 0;
	for (const { name, contents } of entries) {
		const header = VSBuffer.wrap(new Uint8Array(30));
		header.writeUInt32LE(0x04034b50, 0);
		writeUInt16LE(header.buffer, 20, 4);
		writeUInt16LE(header.buffer, 0x0800, 6); // UTF-8 filenames.
		writeUInt16LE(header.buffer, modifiedTime, 10);
		writeUInt16LE(header.buffer, modifiedDate, 12);
		header.writeUInt32LE(crc32(contents), 14);
		header.writeUInt32LE(contents.byteLength, 18);
		header.writeUInt32LE(contents.byteLength, 22);
		writeUInt16LE(header.buffer, name.byteLength, 26);
		localFiles.push(header, name, contents);

		const centralHeader = VSBuffer.wrap(new Uint8Array(46));
		centralHeader.writeUInt32LE(0x02014b50, 0);
		writeUInt16LE(centralHeader.buffer, 20, 4);
		centralHeader.set(header.slice(4, 28), 6);
		centralHeader.writeUInt32LE(offset, 42);
		centralDirectory.push(centralHeader, name);
		centralDirectoryLength += centralHeader.byteLength + name.byteLength;
		offset += header.byteLength + name.byteLength + contents.byteLength;
	}

	const end = VSBuffer.wrap(new Uint8Array(22));
	end.writeUInt32LE(0x06054b50, 0);
	writeUInt16LE(end.buffer, files.length, 8);
	writeUInt16LE(end.buffer, files.length, 10);
	end.writeUInt32LE(centralDirectoryLength, 12);
	end.writeUInt32LE(offset, 16);
	return VSBuffer.concat([...localFiles, ...centralDirectory, end], totalLength);
}
