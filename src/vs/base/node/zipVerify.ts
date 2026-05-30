/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createReadStream } from 'fs';
import { promises as fs } from 'fs';

// CRC32 lookup table (IEEE polynomial 0xEDB88320)
const CRC32_TABLE: Uint32Array = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let crc = i;
		for (let j = 0; j < 8; j++) {
			crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
		}
		table[i] = crc;
	}
	return table;
})();

export function crc32(data: Buffer): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function crc32Stream(filePath: string): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		let crc = 0xFFFFFFFF;
		const stream = createReadStream(filePath);
		stream.on('data', (chunk: Buffer) => {
			for (let i = 0; i < chunk.length; i++) {
				crc = CRC32_TABLE[(crc ^ chunk[i]) & 0xFF] ^ (crc >>> 8);
			}
		});
		stream.on('end', () => {
			resolve((crc ^ 0xFFFFFFFF) >>> 0);
		});
		stream.on('error', (err) => {
			reject(err);
		});
	});
}

// Zip local file header signature
const ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;
// Zip central directory file header signature
const ZIP_CENTRAL_DIR_SIG = 0x02014b50;
// Zip end of central directory signature
const ZIP_END_OF_CENTRAL_DIR_SIG = 0x06054b50;

export const enum ZipVerifyErrorCode {
	CorruptHeader = 'CorruptHeader',
	BadCRC = 'BadCRC',
	FileCountMismatch = 'FileCountMismatch',
	SizeLimitExceeded = 'SizeLimitExceeded',
	TruncatedArchive = 'TruncatedArchive',
	InvalidSignature = 'InvalidSignature',
	MissingEndOfCentralDir = 'MissingEndOfCentralDir',
	UnsupportedCompression = 'UnsupportedCompression',
	IOError = 'IOError',
}

export class ZipVerifyError extends Error {
	constructor(
		public readonly code: ZipVerifyErrorCode,
		message: string,
		public readonly details?: ZipCorruptionDetail
	) {
		super(message);
		this.name = 'ZipVerifyError';
	}
}

export interface ZipCorruptionDetail {
	readonly entryIndex?: number;
	readonly entryName?: string;
	readonly expectedCrc?: number;
	readonly actualCrc?: number;
	readonly offset?: number;
}

export interface ZipVerifyOptions {
	/** Maximum allowed total uncompressed size in bytes. Default: 4GB */
	maxTotalSize?: number;
	/** Maximum allowed number of files. Default: 65535 */
	maxFileCount?: number;
	/** Whether to verify CRC32 of stored (uncompressed) entries. Default: true */
	verifyCrc?: boolean;
	/** Maximum allowed individual file size. Default: 2GB */
	maxIndividualFileSize?: number;
}

export interface ZipVerifyResult {
	readonly valid: boolean;
	readonly fileCount: number;
	readonly totalUncompressedSize: number;
	readonly totalCompressedSize: number;
	readonly errors: ZipVerifyError[];
	readonly entries: ZipEntryInfo[];
}

export interface ZipEntryInfo {
	readonly name: string;
	readonly compressedSize: number;
	readonly uncompressedSize: number;
	readonly crc32: number;
	readonly compressionMethod: number;
	readonly offset: number;
}

const DEFAULT_MAX_TOTAL_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const DEFAULT_MAX_FILE_COUNT = 65535;
const DEFAULT_MAX_INDIVIDUAL_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

/**
 * Find the End of Central Directory record in a zip file buffer.
 * Scans backwards from the end of the buffer.
 */
function findEndOfCentralDirectory(buffer: Buffer): number {
	// EOCD is at least 22 bytes, and the comment can be up to 65535 bytes
	const minOffset = Math.max(0, buffer.length - 65557);
	for (let i = buffer.length - 22; i >= minOffset; i--) {
		if (buffer.readUInt32LE(i) === ZIP_END_OF_CENTRAL_DIR_SIG) {
			return i;
		}
	}
	return -1;
}

/**
 * Parse the End of Central Directory record.
 */
function parseEndOfCentralDirectory(buffer: Buffer, offset: number): {
	diskNumber: number;
	centralDirDisk: number;
	entriesOnDisk: number;
	totalEntries: number;
	centralDirSize: number;
	centralDirOffset: number;
} {
	return {
		diskNumber: buffer.readUInt16LE(offset + 4),
		centralDirDisk: buffer.readUInt16LE(offset + 6),
		entriesOnDisk: buffer.readUInt16LE(offset + 8),
		totalEntries: buffer.readUInt16LE(offset + 10),
		centralDirSize: buffer.readUInt32LE(offset + 12),
		centralDirOffset: buffer.readUInt32LE(offset + 16),
	};
}

/**
 * Parse entries from the central directory.
 */
function parseCentralDirectory(buffer: Buffer, offset: number, count: number): ZipEntryInfo[] {
	const entries: ZipEntryInfo[] = [];
	let pos = offset;

	for (let i = 0; i < count; i++) {
		if (pos + 46 > buffer.length) {
			break;
		}

		const sig = buffer.readUInt32LE(pos);
		if (sig !== ZIP_CENTRAL_DIR_SIG) {
			break;
		}

		const compressionMethod = buffer.readUInt16LE(pos + 10);
		const crc = buffer.readUInt32LE(pos + 16);
		const compressedSize = buffer.readUInt32LE(pos + 20);
		const uncompressedSize = buffer.readUInt32LE(pos + 24);
		const nameLen = buffer.readUInt16LE(pos + 28);
		const extraLen = buffer.readUInt16LE(pos + 30);
		const commentLen = buffer.readUInt16LE(pos + 32);
		const localHeaderOffset = buffer.readUInt32LE(pos + 42);

		const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);

		entries.push({
			name,
			compressedSize,
			uncompressedSize,
			crc32: crc,
			compressionMethod,
			offset: localHeaderOffset,
		});

		pos += 46 + nameLen + extraLen + commentLen;
	}

	return entries;
}

/**
 * Validate a local file header at the given offset.
 */
function validateLocalFileHeader(buffer: Buffer, offset: number): { valid: boolean; nameLen: number; extraLen: number } {
	if (offset + 30 > buffer.length) {
		return { valid: false, nameLen: 0, extraLen: 0 };
	}

	const sig = buffer.readUInt32LE(offset);
	if (sig !== ZIP_LOCAL_FILE_HEADER_SIG) {
		return { valid: false, nameLen: 0, extraLen: 0 };
	}

	const nameLen = buffer.readUInt16LE(offset + 26);
	const extraLen = buffer.readUInt16LE(offset + 28);
	return { valid: true, nameLen, extraLen };
}

/**
 * Verify a zip file's integrity from a file path. Reads the entire file into
 * memory for header + per-entry CRC validation. Use {@link verifyZipStream}
 * for true stream-based verification of very large archives.
 */
export async function verifyZipFile(zipPath: string, options: ZipVerifyOptions = {}): Promise<ZipVerifyResult> {
	const maxTotalSize = options.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
	const maxFileCount = options.maxFileCount ?? DEFAULT_MAX_FILE_COUNT;
	const verifyCrc = options.verifyCrc ?? true;
	const maxIndividualFileSize = options.maxIndividualFileSize ?? DEFAULT_MAX_INDIVIDUAL_FILE_SIZE;

	const errors: ZipVerifyError[] = [];
	const entries: ZipEntryInfo[] = [];

	let buffer: Buffer;
	try {
		buffer = await fs.readFile(zipPath);
	} catch (err) {
		return {
			valid: false,
			fileCount: 0,
			totalUncompressedSize: 0,
			totalCompressedSize: 0,
			errors: [new ZipVerifyError(ZipVerifyErrorCode.IOError, `Failed to read zip file: ${(err as Error).message}`)],
			entries: [],
		};
	}

	// Find EOCD
	const eocdOffset = findEndOfCentralDirectory(buffer);
	if (eocdOffset < 0) {
		errors.push(new ZipVerifyError(
			ZipVerifyErrorCode.MissingEndOfCentralDir,
			'End of Central Directory record not found'
		));
		return { valid: false, fileCount: 0, totalUncompressedSize: 0, totalCompressedSize: 0, errors, entries };
	}

	// Parse EOCD
	const eocd = parseEndOfCentralDirectory(buffer, eocdOffset);

	// Check file count
	if (eocd.totalEntries > maxFileCount) {
		errors.push(new ZipVerifyError(
			ZipVerifyErrorCode.FileCountMismatch,
			`Zip contains ${eocd.totalEntries} files, exceeding limit of ${maxFileCount}`
		));
	}

	// Parse central directory
	if (eocd.centralDirOffset + eocd.centralDirSize > buffer.length) {
		errors.push(new ZipVerifyError(
			ZipVerifyErrorCode.TruncatedArchive,
			'Central directory extends past end of file'
		));
		return { valid: false, fileCount: eocd.totalEntries, totalUncompressedSize: 0, totalCompressedSize: 0, errors, entries };
	}

	const parsedEntries = parseCentralDirectory(buffer, eocd.centralDirOffset, eocd.totalEntries);
	entries.push(...parsedEntries);

	// Verify parsed entry count matches EOCD
	if (parsedEntries.length !== eocd.totalEntries) {
		errors.push(new ZipVerifyError(
			ZipVerifyErrorCode.FileCountMismatch,
			`Expected ${eocd.totalEntries} entries but parsed ${parsedEntries.length}`,
		));
	}

	// Compute totals and validate sizes
	let totalUncompressedSize = 0;
	let totalCompressedSize = 0;

	for (let i = 0; i < parsedEntries.length; i++) {
		const entry = parsedEntries[i];
		totalUncompressedSize += entry.uncompressedSize;
		totalCompressedSize += entry.compressedSize;

		// Check individual file size
		if (entry.uncompressedSize > maxIndividualFileSize) {
			errors.push(new ZipVerifyError(
				ZipVerifyErrorCode.SizeLimitExceeded,
				`Entry "${entry.name}" uncompressed size ${entry.uncompressedSize} exceeds limit of ${maxIndividualFileSize}`,
				{ entryIndex: i, entryName: entry.name }
			));
		}

		// Validate local file header
		const localHeader = validateLocalFileHeader(buffer, entry.offset);
		if (!localHeader.valid) {
			errors.push(new ZipVerifyError(
				ZipVerifyErrorCode.InvalidSignature,
				`Invalid local file header for entry "${entry.name}" at offset ${entry.offset}`,
				{ entryIndex: i, entryName: entry.name, offset: entry.offset }
			));
			continue;
		}

		// CRC verification for stored (uncompressed, method=0) entries
		if (verifyCrc && entry.compressionMethod === 0 && entry.uncompressedSize > 0) {
			const dataOffset = entry.offset + 30 + localHeader.nameLen + localHeader.extraLen;
			if (dataOffset + entry.uncompressedSize <= buffer.length) {
				const data = buffer.subarray(dataOffset, dataOffset + entry.uncompressedSize);
				const computedCrc = crc32(data);
				if (computedCrc !== entry.crc32) {
					errors.push(new ZipVerifyError(
						ZipVerifyErrorCode.BadCRC,
						`CRC32 mismatch for entry "${entry.name}": expected 0x${entry.crc32.toString(16)}, got 0x${computedCrc.toString(16)}`,
						{ entryIndex: i, entryName: entry.name, expectedCrc: entry.crc32, actualCrc: computedCrc }
					));
				}
			}
		}
	}

	// Check total size
	if (totalUncompressedSize > maxTotalSize) {
		errors.push(new ZipVerifyError(
			ZipVerifyErrorCode.SizeLimitExceeded,
			`Total uncompressed size ${totalUncompressedSize} exceeds limit of ${maxTotalSize}`
		));
	}

	return {
		valid: errors.length === 0,
		fileCount: parsedEntries.length,
		totalUncompressedSize,
		totalCompressedSize,
		errors,
		entries,
	};
}

/**
 * Quick validation: checks only the zip structure (signatures, EOCD)
 * without reading file data or verifying CRCs. Useful for fast checks.
 */
export async function quickVerifyZip(zipPath: string): Promise<{ valid: boolean; fileCount: number; error?: string }> {
	try {
		const stat = await fs.stat(zipPath);
		if (stat.size < 22) {
			return { valid: false, fileCount: 0, error: 'File too small to be a valid zip' };
		}

		// Read the last 65KB to find EOCD (covers max comment size)
		const readSize = Math.min(stat.size, 65558);
		const fd = await fs.open(zipPath, 'r');
		try {
			const buffer = Buffer.alloc(readSize);
			await fd.read(buffer, 0, readSize, stat.size - readSize);

			const eocdOffset = findEndOfCentralDirectory(buffer);
			if (eocdOffset < 0) {
				return { valid: false, fileCount: 0, error: 'End of Central Directory record not found' };
			}

			const eocd = parseEndOfCentralDirectory(buffer, eocdOffset);
			return { valid: true, fileCount: eocd.totalEntries };
		} finally {
			await fd.close();
		}
	} catch (err) {
		return { valid: false, fileCount: 0, error: `IO error: ${(err as Error).message}` };
	}
}

/**
 * Verify a zip file using stream-based reading for very large files.
 * Only validates structure and entry count without full CRC verification.
 */
export function verifyZipStream(zipPath: string, expectedFileCount?: number): Promise<{ valid: boolean; errors: string[] }> {
	return new Promise((resolve) => {
		const errors: string[] = [];
		let bytesRead = 0;
		let localFileHeaders = 0;

		const stream = createReadStream(zipPath);
		const chunks: Buffer[] = [];

		// Tail of the previous chunk (last 3 bytes) so we can detect signatures
		// that straddle chunk boundaries. Without this, a 4-byte signature split
		// across two `data` events would be missed and produce false-negative counts.
		let tail = Buffer.alloc(0);

		stream.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
			bytesRead += chunk.length;

			// Build a small scan window: up to 3 bytes of tail + the new chunk.
			const window = tail.length === 0 ? chunk : Buffer.concat([tail, chunk]);

			// Scan for local file header signatures in the joined window.
			for (let i = 0; i <= window.length - 4; i++) {
				if (window.readUInt32LE(i) === ZIP_LOCAL_FILE_HEADER_SIG) {
					localFileHeaders++;
				}
			}

			// Preserve the trailing 3 bytes for the next iteration. If the chunk
			// itself is shorter than 3 bytes, just keep the entire window tail.
			tail = window.length >= 3 ? window.subarray(window.length - 3) : window;
		});

		stream.on('end', () => {
			if (bytesRead < 22) {
				errors.push('File too small to be a valid zip');
			}

			if (expectedFileCount !== undefined && localFileHeaders !== expectedFileCount) {
				errors.push(`Expected ${expectedFileCount} files but found ${localFileHeaders} local headers`);
			}

			// Verify EOCD exists at end
			const fullBuffer = Buffer.concat(chunks);
			const eocdOffset = findEndOfCentralDirectory(fullBuffer);
			if (eocdOffset < 0) {
				errors.push('End of Central Directory record not found');
			}

			resolve({ valid: errors.length === 0, errors });
		});

		stream.on('error', (err) => {
			errors.push(`Stream error: ${err.message}`);
			resolve({ valid: false, errors });
		});
	});
}
