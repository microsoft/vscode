/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import stream = require('stream');

/**
 * Reads up to total bytes from the provided stream.
 */
export function readExactlyByStream(stream: stream.Readable, totalBytes: number, callback: (err: Error, buffer: NodeBuffer, bytesRead: number) => void): void {
	let done = false;
	let buffer = new Buffer(totalBytes);
	let bytesRead = 0;

	stream.on('data', (data: NodeBuffer) => {
		let bytesToRead = Math.min(totalBytes - bytesRead, data.length);
		data.copy(buffer, bytesRead, 0, bytesToRead);
		bytesRead += bytesToRead;

		if (bytesRead === totalBytes) {
			stream.destroy(); // Will trigger the close event eventually
		}
	});

	stream.on('error', (e: Error) => {
		if (!done) {
			done = true;
			callback(e, null, null);
		}
	});

	let onSuccess = () => {
		if (!done) {
			done = true;
			callback(null, buffer, bytesRead);
		}
	};

	stream.on('close', onSuccess);
}

/**
 * Reads totalBytes from the provided file.
 */
export function readExactlyByFile(file: string, totalBytes: number, callback: (error: Error, buffer: NodeBuffer, bytesRead: number) => void): void {
	fs.open(file, 'r', null, (err, fd) => {
		if (err) {
			return callback(err, null, 0);
		}

		function end(err: Error, resultBuffer: NodeBuffer, bytesRead: number): void {
			fs.close(fd, (closeError: Error) => {
				if (closeError) {
					return callback(closeError, null, bytesRead);
				}

				if (err && (<any>err).code === 'EISDIR') {
					return callback(err, null, bytesRead); // we want to bubble this error up (file is actually a folder)
				}

				return callback(null, resultBuffer, bytesRead);
			});
		}

		let buffer = new Buffer(totalBytes);
		let bytesRead = 0;
		let zeroAttempts = 0;
		function loop(): void {
			fs.read(fd, buffer, bytesRead, totalBytes - bytesRead, null, (err, moreBytesRead) => {
				if (err) {
					return end(err, null, 0);
				}

				// Retry up to N times in case 0 bytes where read
				if (moreBytesRead === 0) {
					if (++zeroAttempts === 10) {
						return end(null, buffer, bytesRead);
					}

					return loop();
				}

				bytesRead += moreBytesRead;

				if (bytesRead === totalBytes) {
					return end(null, buffer, bytesRead);
				}

				return loop();
			});
		}

		loop();
	});
}

/**
 * Reads a file until a matching string is found.
 *
 * @param file The file to read.
 * @param matchingString The string to search for.
 * @param chunkBytes The number of bytes to read each iteration.
 * @param maximumBytesToRead The maximum number of bytes to read before giving up.
 * @param callback The finished callback.
 */
export function readToMatchingString(file: string, matchingString: string, chunkBytes: number, maximumBytesToRead: number, callback: (error: Error, result: string) => void): void {
	fs.open(file, 'r', null, (err, fd) => {
		if (err) {
			return callback(err, null);
		}

		function end(err: Error, result: string): void {
			fs.close(fd, (closeError: Error) => {
				if (closeError) {
					return callback(closeError, null);
				}

				if (err && (<any>err).code === 'EISDIR') {
					return callback(err, null); // we want to bubble this error up (file is actually a folder)
				}

				return callback(null, result);
			});
		}

		let buffer = new Buffer(maximumBytesToRead);
		let bytesRead = 0;
		let zeroAttempts = 0;
		function loop(): void {
			fs.read(fd, buffer, bytesRead, chunkBytes, null, (err, moreBytesRead) => {
				if (err) {
					return end(err, null);
				}

				// Retry up to N times in case 0 bytes where read
				if (moreBytesRead === 0) {
					if (++zeroAttempts === 10) {
						return end(null, null);
					}

					return loop();
				}

				bytesRead += moreBytesRead;

				const newLineIndex = buffer.indexOf(matchingString);
				if (newLineIndex >= 0) {
					return end(null, buffer.toString('utf8').substr(0, newLineIndex));
				}

				if (bytesRead >= maximumBytesToRead) {
					return end(new Error(`Could not find ${matchingString} in first ${maximumBytesToRead} bytes of ${file}`), null);
				}

				return loop();
			});
		}

		loop();
	});
}