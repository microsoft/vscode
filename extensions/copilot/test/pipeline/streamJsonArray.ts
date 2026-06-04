/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

/**
 * Streams the top-level elements of a JSON array file without ever loading the
 * whole file into memory.
 *
 * Node's `fs.readFile`/`fs.promises.readFile` reject files larger than 2 GiB and
 * V8 strings have a maximum length of ~512 MiB, so large inputs (e.g. multi-GB
 * recordings) cannot be read into a single string and parsed with `JSON.parse`.
 * Instead we read the file as a stream, split it at the top-level array element
 * boundaries, and parse each element individually. This assumes each individual
 * element is small enough to fit into a single string, which holds for the row
 * records used by the nes-datagen pipeline.
 *
 * @param inputPath path to a file whose contents are a single JSON array.
 * @yields each parsed top-level array element in order.
 */
export async function* streamJsonArrayElements<T = unknown>(inputPath: string): AsyncGenerator<T> {
	const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });

	let arrayStarted = false;
	let arrayEnded = false;
	let depth = 0;
	let inString = false;
	let escaped = false;
	let current = '';
	let hasContent = false;

	const flush = function* (): Generator<T> {
		const trimmed = current.trim();
		current = '';
		hasContent = false;
		if (trimmed.length > 0) {
			yield JSON.parse(trimmed) as T;
		}
	};

	for await (const chunk of stream) {
		for (let i = 0; i < chunk.length; i++) {
			const ch = chunk[i];

			if (!arrayStarted) {
				if (ch === '[') {
					arrayStarted = true;
				} else if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
					continue;
				} else {
					throw new Error(`Expected '[' at start of JSON array input, got '${ch}'`);
				}
				continue;
			}

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
					yield* flush();
					arrayEnded = true;
					continue;
				}
				depth--;
				current += ch;
				hasContent = true;
				continue;
			}

			if (ch === ',' && depth === 0) {
				yield* flush();
				continue;
			}

			if (!hasContent && (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t')) {
				// Skip whitespace between elements so it doesn't accumulate.
				continue;
			}

			current += ch;
			if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') {
				hasContent = true;
			}
		}

		if (arrayEnded) {
			break;
		}
	}

	stream.destroy();

	if (!arrayStarted) {
		throw new Error('Input did not contain a JSON array');
	}
}
