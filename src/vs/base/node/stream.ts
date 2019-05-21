/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

/**
 * Reads a file until a matching string is found.
 *
 * @param file The file to read.
 * @param matchingString The string to search for.
 * @param chunkBytes The number of bytes to read each iteration.
 * @param maximumBytesToRead The maximum number of bytes to read before giving up.
 * @param callback The finished callback.
 */
export function readToMatchingString(file: string, matchingString: string, chunkBytes: number, maximumBytesToRead: number): Promise<string | null> {
	return new Promise<string | null>((resolve, reject) =>
		fs.open(file, 'r', null, (err, fd) => {
			if (err) {
				return reject(err);
			}

			function end(err: Error | null, result: string | null): void {
				fs.close(fd, closeError => {
					if (closeError) {
						return reject(closeError);
					}

					if (err && (<any>err).code === 'EISDIR') {
						return reject(err); // we want to bubble this error up (file is actually a folder)
					}

					return resolve(result);
				});
			}

			const buffer = Buffer.allocUnsafe(maximumBytesToRead);
			let offset = 0;

			function readChunk(): void {
				fs.read(fd, buffer, offset, chunkBytes, null, (err, bytesRead) => {
					if (err) {
						return end(err, null);
					}

					if (bytesRead === 0) {
						return end(null, null);
					}

					offset += bytesRead;

					const newLineIndex = buffer.indexOf(matchingString);
					if (newLineIndex >= 0) {
						return end(null, buffer.toString('utf8').substr(0, newLineIndex));
					}

					if (offset >= maximumBytesToRead) {
						return end(new Error(`Could not find ${matchingString} in first ${maximumBytesToRead} bytes of ${file}`), null);
					}

					return readChunk();
				});
			}

			readChunk();
		})
	);
}