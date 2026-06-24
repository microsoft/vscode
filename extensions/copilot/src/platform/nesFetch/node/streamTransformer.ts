/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Completion } from '../common/completionsAPI';

/**
 * @throws if data line cannot be parsed as JSON or if it contains an error field.
 */
export async function* jsonlStreamToCompletions(jsonlStream: AsyncIterable<string>): AsyncGenerator<Completion> {
	for await (const line of jsonlStream) {
		if (line.trim() === 'data: [DONE]') {
			continue;
		}

		if (line.startsWith('data: ')) {
			const message: Completion & { error?: { message: string } } = JSON.parse(line.substring('data: '.length));

			if (message.error) {
				throw new Error(message.error.message);
			}

			yield message;
		}
	}
}

// function replaceBytes(s: string): string {
// 	if (!s.startsWith('bytes:')) {
// 		return s;
// 	}
// 	const bytes: number[] = [];
// 	let i = 'bytes:'.length;
// 	const textEncoder = new TextEncoder();
// 	while (i < s.length) {
// 		if (s.slice(i, i + 3) === '\\\\x') {
// 			bytes.push(parseInt(s.slice(i + 3, i + 5), 16));
// 			i += 5;
// 		} else if (s.slice(i, i + 2) === '\\x') {
// 			bytes.push(parseInt(s.slice(i + 2, i + 4), 16));
// 			i += 4;
// 		} else {
// 			const encoded = textEncoder.encode(s.slice(i, i + 1));
// 			for (const b of encoded) {
// 				bytes.push(b);
// 			}
// 			i += 1;
// 		}
// 	}
// 	return new TextDecoder('utf8', { fatal: false }).decode(
// 		new Uint8Array(bytes)
// 	);
// }
