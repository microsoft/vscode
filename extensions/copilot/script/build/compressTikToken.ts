/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { parseTikTokenBinary } from '../../src/platform/tokenizer/node/parseTikTokens';
import { writeVariableLengthQuantity } from '../../src/util/common/variableLengthQuantity';

/**
 * Compresses a `.tiktoken` file into a much more compact binary format.
 *
 * A tiktoken file is a list of base64 encoded terms, followed by a space
 * and (rather unnecessarily) by their index, like
 * ```
 * IQ== 0
 * Ig== 1
 * Iw== 2
 * JA== 3
 * JQ== 4
 * Jg== 5
 * Jw== 6
 * KA== 7
 * ```
 *
 * This compression takes advantage of the fact that term lengths increase
 * monotonically with their index. Each term is represented by a VLQ-encoded
 * length followed by the term itself.
 *
 * I explored doing a fancier format with "runs" of certain lengths, however
 * the difference was only a byte or two in exchange for much higher complexity.
 */
export async function compressTikToken(inputFile: string, outputFile: string) {
	const raw = await readFile(inputFile, 'utf-8');
	const terms: Buffer[] = [];
	for (const line of raw.split('\n')) {
		if (!line) {
			continue;
		}

		const [base64, iStr] = line.split(' ');
		const i = Number(iStr);
		if (isNaN(Number(i))) {
			throw new Error(`malformed line ${line}`);
		}
		if (i !== terms.length) {
			throw new Error('non-monotonic index');
		}

		terms.push(Buffer.from(base64, 'base64'));
	}

	const output: Uint8Array[] = [];

	for (const term of terms) {
		output.push(writeVariableLengthQuantity(term.length).buffer);
		output.push(term);
	}

	await mkdir(path.dirname(outputFile), { recursive: true });
	await writeFile(outputFile, Buffer.concat(output));
	assertOk(outputFile, terms);
}

function assertOk(outputFile: string, terms: Buffer[]) {
	const parsed = parseTikTokenBinary(outputFile);
	const actual: string[] = [];

	for (const [term, index] of parsed) {
		actual[index] = Buffer.from(term).toString('base64');
	}

	assert.deepStrictEqual(actual, terms.map(t => t.toString('base64')));
}
