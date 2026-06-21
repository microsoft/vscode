/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as Platform from '../common/platform.js';

/** The libc family the current process is linked against. */
export type LibcFamily = 'glibc' | 'musl';

let _cached: LibcFamily | undefined;
let _cacheValid = false;

const MAX_HEAD_LENGTH = 2048;

/**
 * Reads up to `length` bytes from the start of a file, or `undefined` if the
 * file cannot be opened or read.
 */
function readFileHead(path: string, length: number): Buffer | undefined {
	let fd: number | undefined;
	try {
		fd = fs.openSync(path, 'r');
		const buffer = Buffer.alloc(length);
		const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
		return buffer.subarray(0, bytesRead);
	} catch {
		return undefined;
	} finally {
		if (fd !== undefined) {
			try {
				fs.closeSync(fd);
			} catch {
				// ignore
			}
		}
	}
}

/**
 * Reads a little-endian unsigned 64-bit integer expected to fit in a safe JS
 * integer, or `undefined` if the bytes are unavailable or the value is out of
 * range.
 */
function readSafeUInt64LE(buffer: Buffer, offset: number): number | undefined {
	if (offset < 0 || offset + 8 > buffer.length) {
		return undefined;
	}
	const value = buffer.readBigUInt64LE(offset);
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
		return undefined;
	}
	return Number(value);
}

/**
 * Extracts the `PT_INTERP` program interpreter (dynamic linker) path from the
 * head of a 64-bit little-endian ELF binary, or `undefined` if it cannot be
 * parsed from the bytes available.
 */
function elfInterpreterPath(elf: Buffer): string | undefined {
	if (elf.length < 64) {
		return undefined;
	}
	if (elf.readUInt32BE(0) !== 0x7F454C46) {
		return undefined; // not ELF magic
	}
	if (elf.readUInt8(4) !== 2) {
		return undefined; // not 64-bit (ELFCLASS64)
	}
	if (elf.readUInt8(5) !== 1) {
		return undefined; // not little-endian
	}
	// ELF64 header: e_phoff is a 64-bit file offset at byte 32; e_phentsize and
	// e_phnum are 16-bit at bytes 54 and 56. Each program header entry
	// (Elf64_Phdr) is at least 56 bytes, with the 64-bit p_offset at +8 and the
	// 64-bit p_filesz at +32.
	const programHeaderOffset = readSafeUInt64LE(elf, 32);
	const entrySize = elf.readUInt16LE(54);
	const entryCount = elf.readUInt16LE(56);
	if (programHeaderOffset === undefined || entrySize < 56) {
		return undefined;
	}
	const PT_INTERP = 3;
	for (let i = 0; i < entryCount; i++) {
		const headerOffset = programHeaderOffset + (i * entrySize);
		if (headerOffset + 40 > elf.length) {
			break;
		}
		if (elf.readUInt32LE(headerOffset) === PT_INTERP) {
			const fileOffset = readSafeUInt64LE(elf, headerOffset + 8);
			const fileSize = readSafeUInt64LE(elf, headerOffset + 32);
			if (fileOffset === undefined || fileSize === undefined) {
				return undefined;
			}
			return elf.subarray(fileOffset, fileOffset + fileSize).toString().replace(/\0.*$/, '');
		}
	}
	return undefined;
}

function familyFromInterpreterPath(path: string): LibcFamily | undefined {
	if (path.includes('/ld-musl-')) {
		return 'musl';
	}
	if (path.includes('/ld-linux-')) {
		return 'glibc';
	}
	return undefined;
}

/** Cheap probe: the dynamic linker named in this process's own ELF header. */
function familyFromSelfInterpreter(): LibcFamily | undefined {
	const elf = readFileHead('/proc/self/exe', MAX_HEAD_LENGTH);
	if (!elf) {
		return undefined;
	}
	const interpreter = elfInterpreterPath(elf);
	return interpreter ? familyFromInterpreterPath(interpreter) : undefined;
}

/** Cheap probe: the contents of the `ldd` script/binary. */
function familyFromLdd(): LibcFamily | undefined {
	const content = readFileHead('/usr/bin/ldd', MAX_HEAD_LENGTH)?.toString();
	if (!content) {
		return undefined;
	}
	if (content.includes('musl')) {
		return 'musl';
	}
	if (content.includes('GNU C Library')) {
		return 'glibc';
	}
	return undefined;
}

/**
 * Expensive fallback: Node's process report exposes `glibcVersionRuntime` in
 * its header on glibc builds and a musl loader among its shared objects on musl
 * builds. `excludeNetwork` is set so the report skips libuv/socket enumeration,
 * which is the part that can peg the CPU on busy hosts.
 */
function familyFromReport(): LibcFamily | undefined {
	// `excludeNetwork` is present at runtime (added in Node 22.13 / 23.3, and
	// verified present on the Node we ship) but is missing from the bundled
	// `@types/node`, so reach it through a narrow cast.
	const report = process.report as (NodeJS.ProcessReport & { excludeNetwork?: boolean }) | undefined;
	if (!report) {
		return undefined;
	}
	const previousExcludeNetwork = report.excludeNetwork;
	report.excludeNetwork = true;
	try {
		const data = report.getReport() as {
			header?: { glibcVersionRuntime?: string };
			sharedObjects?: string[];
		};
		if (data.header?.glibcVersionRuntime) {
			return 'glibc';
		}
		if (data.sharedObjects?.some(o => o.includes('libc.musl-') || o.includes('ld-musl-'))) {
			return 'musl';
		}
	} finally {
		report.excludeNetwork = previousExcludeNetwork;
	}
	return undefined;
}

/**
 * Returns the libc family of the running Node process on Linux, or `undefined`
 * on non-Linux platforms (where the question is meaningless).
 *
 * Detection tries cheap signals first — the dynamic linker named in this
 * process's ELF header (`/proc/self/exe`), then the `ldd` contents — and only
 * falls back to Node's (network-excluded) process report, which is expensive
 * because it serializes heap, native stack and libuv state. When nothing is
 * conclusive we assume `glibc`, the dominant Linux libc.
 *
 * Cached after first call; libc never changes mid-process.
 */
export function detectLibc(): LibcFamily | undefined {
	if (_cacheValid) {
		return _cached;
	}
	if (Platform.isLinux) {
		_cached = familyFromSelfInterpreter() ?? familyFromLdd() ?? familyFromReport() ?? 'glibc';
	} else {
		_cached = undefined;
	}
	_cacheValid = true;
	return _cached;
}
