/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { closeSync, openSync, readSync, statSync } from 'fs';

export const defaultTopLevelTokens = [
	'"meta"',
	'"nodes"',
	'"edges"',
	'"trace_function_infos"',
	'"trace_tree"',
	'"samples"',
	'"locations"',
	'"strings"'
];

export function formatBytes(bytes) {
	if (Math.abs(bytes) < 1024) {
		return `${bytes} B`;
	}
	if (Math.abs(bytes) < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function findTokenOffsets(path, tokens = defaultTopLevelTokens, options = {}) {
	const stat = statSync(path);
	const fd = openSync(path, 'r');
	const chunkSize = options.chunkSize ?? 8 * 1024 * 1024;
	const overlap = options.overlap ?? 256;
	const found = new Map();
	let previous = Buffer.alloc(0);
	let position = 0;

	try {
		while (position < stat.size && found.size < tokens.length) {
			const toRead = Math.min(chunkSize, stat.size - position);
			const chunk = Buffer.allocUnsafe(toRead);
			const bytesRead = readSync(fd, chunk, 0, toRead, position);
			if (bytesRead <= 0) {
				break;
			}

			const combined = Buffer.concat([previous, chunk.subarray(0, bytesRead)]);

			for (const token of tokens) {
				if (found.has(token)) {
					continue;
				}

				const index = combined.indexOf(token);
				if (index !== -1) {
					found.set(token, position - previous.length + index);
				}
			}

			previous = combined.subarray(Math.max(0, combined.length - overlap));
			position += bytesRead;
		}
	} finally {
		closeSync(fd);
	}

	return { size: stat.size, offsets: found };
}

export function readRange(path, start, length) {
	const fd = openSync(path, 'r');
	const buffer = Buffer.allocUnsafe(length);
	let offset = 0;

	try {
		while (offset < length) {
			const bytesRead = readSync(fd, buffer, offset, length - offset, start + offset);
			if (bytesRead === 0) {
				return buffer.subarray(0, offset);
			}
			offset += bytesRead;
		}
		return buffer;
	} finally {
		closeSync(fd);
	}
}

export function parseMeta(path, options = {}) {
	const maxBytes = options.maxBytes ?? 1024 * 1024;
	const buffer = readRange(path, 0, maxBytes);
	const metaPosition = buffer.indexOf(Buffer.from('"meta"'));
	if (metaPosition === -1) {
		throw new Error('Unable to find snapshot meta section');
	}

	const start = buffer.indexOf(Buffer.from('{'), metaPosition);
	if (start === -1) {
		throw new Error('Unable to find snapshot meta object start');
	}

	let depth = 0;
	for (let i = start; i < buffer.length; i++) {
		if (buffer[i] === 0x22) {
			i++;
			while (i < buffer.length) {
				if (buffer[i] === 0x5c) {
					i += 2;
					continue;
				}
				if (buffer[i] === 0x22) {
					break;
				}
				i++;
			}
			continue;
		}

		if (buffer[i] === 0x7b) {
			depth++;
		} else if (buffer[i] === 0x7d) {
			depth--;
			if (depth === 0) {
				return JSON.parse(buffer.subarray(start, i + 1).toString('utf8'));
			}
		}
	}

	throw new Error(`Unable to parse snapshot meta within first ${formatBytes(maxBytes)}`);
}

export function findArrayStart(path, tokenOffset, options = {}) {
	const windowSize = options.windowSize ?? 4096;
	const buffer = readRange(path, tokenOffset, windowSize);
	const bracket = buffer.indexOf(Buffer.from('['));
	if (bracket === -1) {
		throw new Error(`Unable to find array start near offset ${tokenOffset}`);
	}
	return tokenOffset + bracket + 1;
}

export function streamNumberArray(path, start, end, onNumber, options = {}) {
	const fd = openSync(path, 'r');
	const chunkSize = options.chunkSize ?? 16 * 1024 * 1024;
	const buffer = Buffer.allocUnsafe(chunkSize);
	let position = start;
	let number = 0;
	let inNumber = false;
	let numberIndex = 0;

	try {
		while (position < end) {
			const toRead = Math.min(chunkSize, end - position);
			const bytesRead = readSync(fd, buffer, 0, toRead, position);
			if (bytesRead <= 0) {
				break;
			}

			for (let i = 0; i < bytesRead; i++) {
				const code = buffer[i];
				if (code >= 0x30 && code <= 0x39) {
					number = number * 10 + code - 0x30;
					inNumber = true;
				} else if (inNumber) {
					onNumber(number, numberIndex++);
					number = 0;
					inNumber = false;
					if (code === 0x5d) {
						return numberIndex;
					}
				} else if (code === 0x5d) {
					return numberIndex;
				}
			}

			position += bytesRead;
		}

		if (inNumber) {
			onNumber(number, numberIndex++);
		}
		return numberIndex;
	} finally {
		closeSync(fd);
	}
}

/**
 * Streams fixed-size tuples from a number array.
 *
 * By default, the same mutable tuple array instance is reused for each callback
 * invocation to avoid per-tuple allocations. Callers must not retain that array
 * reference after onTuple returns unless options.copyTuple is enabled.
 */
export function streamNumberTuples(path, start, end, tupleSize, onTuple, options = {}) {
	const tuple = new Array(tupleSize);
	const copyTuple = options.copyTuple === true;
	let tupleIndex = 0;
	let fieldIndex = 0;

	const numberCount = streamNumberArray(path, start, end, value => {
		tuple[fieldIndex++] = value;
		if (fieldIndex === tupleSize) {
			onTuple(copyTuple ? tuple.slice() : tuple, tupleIndex++);
			fieldIndex = 0;
		}
	}, options);

	if (fieldIndex !== 0) {
		throw new Error(`Number array ended with an incomplete tuple: ${fieldIndex}/${tupleSize}`);
	}

	return { numberCount, tupleCount: tupleIndex };
}

export function parseStrings(path, stringsTokenOffset, options = {}) {
	const normalizedOptions = typeof options === 'number' ? { fileSize: options } : options;
	const fileSize = normalizedOptions.fileSize ?? statSync(path).size;
	const length = fileSize - stringsTokenOffset;
	const maxBytes = normalizedOptions.maxBytes ?? 512 * 1024 * 1024;

	if (length > maxBytes) {
		throw new Error(`Refusing to parse ${formatBytes(length)} strings section into one Buffer. Pass a larger maxBytes value only if this is intentional.`);
	}

	const buffer = readRange(path, stringsTokenOffset, length);
	const start = buffer.indexOf(Buffer.from('['));
	if (start === -1) {
		throw new Error(`Unable to find strings array near offset ${stringsTokenOffset}`);
	}

	let depth = 0;
	for (let i = start; i < buffer.length; i++) {
		if (buffer[i] === 0x22) {
			i++;
			while (i < buffer.length) {
				if (buffer[i] === 0x5c) {
					i += 2;
					continue;
				}
				if (buffer[i] === 0x22) {
					break;
				}
				i++;
			}
			continue;
		}

		if (buffer[i] === 0x5b) {
			depth++;
		} else if (buffer[i] === 0x5d) {
			depth--;
			if (depth === 0) {
				return JSON.parse(buffer.subarray(start, i + 1).toString('utf8'));
			}
		}
	}

	throw new Error('Unable to parse strings array');
}
