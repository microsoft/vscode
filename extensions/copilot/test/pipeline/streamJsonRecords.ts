/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export type JsonRecordFormat = 'array' | 'jsonl';

/**
 * Infers the record format of an input file from its extension:
 * - `.jsonl` / `.ndjson` → JSON Lines (one JSON value per line).
 * - anything else (e.g. `.json`) → a single JSON array.
 */
export function inferJsonRecordFormat(inputPath: string): JsonRecordFormat {
	const ext = path.extname(inputPath).toLowerCase();
	return ext === '.jsonl' || ext === '.ndjson' ? 'jsonl' : 'array';
}

/**
 * Streams the top-level records of a file without ever loading the whole file
 * into memory. The format is inferred from the file extension (see
 * {@link inferJsonRecordFormat}):
 *
 * - A single JSON array (`[ {...}, {...} ]`) — each top-level array element is
 *   yielded in order.
 * - JSON Lines / NDJSON (one JSON value per line) — each non-empty line is parsed
 *   and yielded in order.
 *
 * Node's `fs.readFile`/`fs.promises.readFile` reject files larger than 2 GiB and
 * V8 strings have a maximum length of ~512 MiB, so large inputs (e.g. multi-GB
 * recordings) cannot be read into a single string and parsed with `JSON.parse`.
 * Instead we read the file as a stream and parse each record individually. This
 * assumes each individual record is small enough to fit into a single string,
 * which holds for the row records used by the nes-datagen pipeline.
 *
 * @param inputPath path to a JSON-array or JSON-Lines file.
 * @yields each parsed top-level record in order.
 */
export async function* streamJsonRecords<T = unknown>(inputPath: string): AsyncGenerator<T> {
	const format = inferJsonRecordFormat(inputPath);
	const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });

	try {
		if (format === 'jsonl') {
			yield* streamJsonLines<T>(stream);
		} else {
			yield* streamJsonArray<T>(stream);
		}
	} finally {
		stream.destroy();
	}
}

function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
}

async function* streamJsonLines<T>(stream: NodeJS.ReadableStream): AsyncGenerator<T> {
	let line = '';
	for await (const chunk of stream) {
		const text = chunk as string;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (ch === '\n' || ch === '\r') {
				const trimmed = line.trim();
				line = '';
				if (trimmed.length > 0) {
					yield JSON.parse(trimmed) as T;
				}
			} else {
				line += ch;
			}
		}
	}
	const trimmed = line.trim();
	if (trimmed.length > 0) {
		yield JSON.parse(trimmed) as T;
	}
}

async function* streamJsonArray<T>(stream: NodeJS.ReadableStream): AsyncGenerator<T> {
	let arrayStarted = false;
	let arrayEnded = false;
	let depth = 0;
	let inString = false;
	let escaped = false;
	let current = '';
	let hasContent = false;
	let elementsYielded = 0;
	let pendingElement = false;
	let trailingChar = '';

	for await (const chunk of stream) {
		const text = chunk as string;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];

			if (!arrayStarted) {
				if (isWhitespace(ch)) {
					continue;
				}
				if (ch === '[') {
					arrayStarted = true;
					pendingElement = true;
					continue;
				}
				throw new Error(`Expected '[' at start of JSON array input, got '${ch}'`);
			}

			if (arrayEnded) {
				if (!isWhitespace(ch)) {
					trailingChar = ch;
					break;
				}
				continue;
			}

			if (inString) {
				current += ch;
				if (escaped) {
					escaped = false;
				} else if (ch === '\\') {
					escaped = true;
				} else if (ch === '"') {
					inString = false;
				}
				continue;
			}

			if (ch === '"') {
				inString = true;
				current += ch;
				hasContent = true;
				continue;
			}

			if (ch === '{' || ch === '[') {
				depth++;
				current += ch;
				hasContent = true;
				continue;
			}

			if (ch === '}' || ch === ']') {
				if (ch === ']' && depth === 0) {
					// Closing the outer array.
					const trimmed = current.trim();
					current = '';
					hasContent = false;
					if (trimmed.length > 0) {
						yield JSON.parse(trimmed) as T;
						elementsYielded++;
						pendingElement = false;
					} else if (pendingElement && elementsYielded > 0) {
						throw new Error('Unexpected \']\' after trailing comma in JSON array');
					}
					arrayEnded = true;
					continue;
				}
				depth--;
				current += ch;
				hasContent = true;
				continue;
			}

			if (ch === ',' && depth === 0) {
				const trimmed = current.trim();
				current = '';
				hasContent = false;
				if (trimmed.length === 0) {
					throw new Error('Unexpected \',\' (missing element) in JSON array');
				}
				yield JSON.parse(trimmed) as T;
				elementsYielded++;
				pendingElement = true;
				continue;
			}

			if (!hasContent && isWhitespace(ch)) {
				// Skip whitespace between elements so it doesn't accumulate.
				continue;
			}

			current += ch;
			if (!isWhitespace(ch)) {
				hasContent = true;
			}
		}

		if (arrayEnded && trailingChar) {
			break;
		}
	}

	if (!arrayStarted) {
		// Empty or whitespace-only file: no records.
		return;
	}

	if (!arrayEnded) {
		throw new Error('Unexpected end of input: JSON array was not closed');
	}

	if (trailingChar) {
		throw new Error(`Unexpected '${trailingChar}' after end of JSON array`);
	}
}
