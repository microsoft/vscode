/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

/**
 * Streams the top-level records of a file without ever loading the whole file
 * into memory. Two input formats are auto-detected from the first non-whitespace
 * character:
 *
 * - A single JSON array (`[ {...}, {...} ]`) when the first character is `[`.
 *   Each top-level array element is yielded in order.
 * - JSON Lines / NDJSON (one JSON value per line) otherwise. Each non-empty line
 *   is parsed and yielded in order.
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
	const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });

	const isWhitespace = (ch: string): boolean => ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';

	let mode: 'unknown' | 'array' | 'jsonl' = 'unknown';

	// JSON-array parsing state.
	let arrayEnded = false;
	let depth = 0;
	let inString = false;
	let escaped = false;
	let current = '';
	let hasContent = false;

	// JSON-Lines parsing state.
	let line = '';

	try {
		for await (const chunk of stream) {
			for (let i = 0; i < chunk.length; i++) {
				const ch = chunk[i];

				if (mode === 'unknown') {
					if (isWhitespace(ch)) {
						continue;
					}
					if (ch === '[') {
						mode = 'array';
						continue;
					}
					// Anything else is treated as the first character of a JSON-Lines record.
					mode = 'jsonl';
					// Fall through so this character is handled by the JSON-Lines branch below.
				}

				if (mode === 'array') {
					if (arrayEnded) {
						break;
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
						if (trimmed.length > 0) {
							yield JSON.parse(trimmed) as T;
						}
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
				} else {
					// JSON-Lines mode.
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

			if (arrayEnded) {
				break;
			}
		}
	} finally {
		stream.destroy();
	}

	if (mode === 'jsonl') {
		const trimmed = line.trim();
		if (trimmed.length > 0) {
			yield JSON.parse(trimmed) as T;
		}
	}
}
