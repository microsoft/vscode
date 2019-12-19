/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as iconv from 'iconv-lite';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { exec } from 'child_process';
import { Readable, Writable } from 'stream';
import { VSBuffer } from 'vs/base/common/buffer';

export const UTF8 = 'utf8';
export const UTF8_with_bom = 'utf8bom';
export const UTF16be = 'utf16be';
export const UTF16le = 'utf16le';

export type UTF_ENCODING = typeof UTF8 | typeof UTF8_with_bom | typeof UTF16be | typeof UTF16le;

export function isUTFEncoding(encoding: string): encoding is UTF_ENCODING {
	return [UTF8, UTF8_with_bom, UTF16be, UTF16le].some(utfEncoding => utfEncoding === encoding);
}

export const UTF16be_BOM = [0xFE, 0xFF];
export const UTF16le_BOM = [0xFF, 0xFE];
export const UTF8_BOM = [0xEF, 0xBB, 0xBF];

const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512; // number of bytes to look at to decide about a file being binary or not
const NO_GUESS_BUFFER_MAX_LEN = 512; 			// when not auto guessing the encoding, small number of bytes are enough
const AUTO_GUESS_BUFFER_MAX_LEN = 512 * 8; 		// with auto guessing we want a lot more content to be read for guessing

export interface IDecodeStreamOptions {
	guessEncoding: boolean;
	minBytesRequiredForDetection?: number;

	overwriteEncoding(detectedEncoding: string | null): string;
}

export interface IDecodeStreamResult {
	stream: NodeJS.ReadableStream;
	detected: IDetectedEncodingResult;
}

export function toDecodeStream(readable: Readable, options: IDecodeStreamOptions): Promise<IDecodeStreamResult> {
	if (!options.minBytesRequiredForDetection) {
		options.minBytesRequiredForDetection = options.guessEncoding ? AUTO_GUESS_BUFFER_MAX_LEN : NO_GUESS_BUFFER_MAX_LEN;
	}

	return new Promise<IDecodeStreamResult>((resolve, reject) => {
		const writer = new class extends Writable {
			private decodeStream: NodeJS.ReadWriteStream | undefined;
			private decodeStreamPromise: Promise<void> | undefined;

			private bufferedChunks: Buffer[] = [];
			private bytesBuffered = 0;

			_write(chunk: Buffer, encoding: string, callback: (error: Error | null) => void): void {
				if (!Buffer.isBuffer(chunk)) {
					return callback(new Error('toDecodeStream(): data must be a buffer'));
				}

				// if the decode stream is ready, we just write directly
				if (this.decodeStream) {
					this.decodeStream.write(chunk, callback);

					return;
				}

				// otherwise we need to buffer the data until the stream is ready
				this.bufferedChunks.push(chunk);
				this.bytesBuffered += chunk.byteLength;

				// waiting for the decoder to be ready
				if (this.decodeStreamPromise) {
					this.decodeStreamPromise.then(() => callback(null), error => callback(error));
				}

				// buffered enough data for encoding detection, create stream and forward data
				else if (typeof options.minBytesRequiredForDetection === 'number' && this.bytesBuffered >= options.minBytesRequiredForDetection) {
					this._startDecodeStream(callback);
				}

				// only buffering until enough data for encoding detection is there
				else {
					callback(null);
				}
			}

			_startDecodeStream(callback: (error: Error | null) => void): void {

				// detect encoding from buffer
				this.decodeStreamPromise = Promise.resolve(detectEncodingFromBuffer({
					buffer: Buffer.concat(this.bufferedChunks),
					bytesRead: this.bytesBuffered
				}, options.guessEncoding)).then(detected => {

					// ensure to respect overwrite of encoding
					detected.encoding = options.overwriteEncoding(detected.encoding);

					// decode and write buffer
					this.decodeStream = decodeStream(detected.encoding);
					this.decodeStream.write(Buffer.concat(this.bufferedChunks), callback);
					this.bufferedChunks.length = 0;

					// signal to the outside our detected encoding
					// and final decoder stream
					resolve({ detected, stream: this.decodeStream });
				}, error => {
					this.emit('error', error);

					callback(error);
				});
			}

			_final(callback: () => void) {

				// normal finish
				if (this.decodeStream) {
					this.decodeStream.end(callback);
				}

				// we were still waiting for data to do the encoding
				// detection. thus, wrap up starting the stream even
				// without all the data to get things going
				else {
					this._startDecodeStream(() => {
						if (this.decodeStream) {
							this.decodeStream.end(callback);
						}
					});
				}
			}
		};

		// errors
		readable.on('error', reject);

		// pipe through
		readable.pipe(writer);
	});
}

export function decode(buffer: Buffer, encoding: string): string {
	return iconv.decode(buffer, toNodeEncoding(encoding));
}

export function encode(content: string | Buffer, encoding: string, options?: { addBOM?: boolean }): Buffer {
	return iconv.encode(content as string /* TODO report into upstream typings */, toNodeEncoding(encoding), options);
}

export function encodingExists(encoding: string): boolean {
	return iconv.encodingExists(toNodeEncoding(encoding));
}

function decodeStream(encoding: string | null): NodeJS.ReadWriteStream {
	return iconv.decodeStream(toNodeEncoding(encoding));
}

export function encodeStream(encoding: string, options?: { addBOM?: boolean }): NodeJS.ReadWriteStream {
	return iconv.encodeStream(toNodeEncoding(encoding), options);
}

function toNodeEncoding(enc: string | null): string {
	if (enc === UTF8_with_bom || enc === null) {
		return UTF8; // iconv does not distinguish UTF 8 with or without BOM, so we need to help it
	}

	return enc;
}

export function detectEncodingByBOMFromBuffer(buffer: Buffer | VSBuffer | null, bytesRead: number): typeof UTF8_with_bom | typeof UTF16le | typeof UTF16be | null {
	if (!buffer || bytesRead < UTF16be_BOM.length) {
		return null;
	}

	const b0 = buffer.readUInt8(0);
	const b1 = buffer.readUInt8(1);

	// UTF-16 BE
	if (b0 === UTF16be_BOM[0] && b1 === UTF16be_BOM[1]) {
		return UTF16be;
	}

	// UTF-16 LE
	if (b0 === UTF16le_BOM[0] && b1 === UTF16le_BOM[1]) {
		return UTF16le;
	}

	if (bytesRead < UTF8_BOM.length) {
		return null;
	}

	const b2 = buffer.readUInt8(2);

	// UTF-8
	if (b0 === UTF8_BOM[0] && b1 === UTF8_BOM[1] && b2 === UTF8_BOM[2]) {
		return UTF8_with_bom;
	}

	return null;
}

// we explicitly ignore a specific set of encodings from auto guessing
// - ASCII: we never want this encoding (most UTF-8 files would happily detect as
//          ASCII files and then you could not type non-ASCII characters anymore)
// - UTF-16: we have our own detection logic for UTF-16
// - UTF-32: we do not support this encoding in VSCode
const IGNORE_ENCODINGS = ['ascii', 'utf-16', 'utf-32'];

/**
 * Guesses the encoding from buffer.
 */
async function guessEncodingByBuffer(buffer: Buffer): Promise<string | null> {
	const jschardet = await import('jschardet');

	const guessed = jschardet.detect(buffer);
	if (!guessed || !guessed.encoding) {
		return null;
	}

	const enc = guessed.encoding.toLowerCase();
	if (0 <= IGNORE_ENCODINGS.indexOf(enc)) {
		return null; // see comment above why we ignore some encodings
	}

	return toIconvLiteEncoding(guessed.encoding);
}

const JSCHARDET_TO_ICONV_ENCODINGS: { [name: string]: string } = {
	'ibm866': 'cp866',
	'big5': 'cp950'
};

function toIconvLiteEncoding(encodingName: string): string {
	const normalizedEncodingName = encodingName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
	const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];

	return mapped || normalizedEncodingName;
}

/**
 * The encodings that are allowed in a settings file don't match the canonical encoding labels specified by WHATWG.
 * See https://encoding.spec.whatwg.org/#names-and-labels
 * Iconv-lite strips all non-alphanumeric characters, but ripgrep doesn't. For backcompat, allow these labels.
 */
export function toCanonicalName(enc: string): string {
	switch (enc) {
		case 'shiftjis':
			return 'shift-jis';
		case 'utf16le':
			return 'utf-16le';
		case 'utf16be':
			return 'utf-16be';
		case 'big5hkscs':
			return 'big5-hkscs';
		case 'eucjp':
			return 'euc-jp';
		case 'euckr':
			return 'euc-kr';
		case 'koi8r':
			return 'koi8-r';
		case 'koi8u':
			return 'koi8-u';
		case 'macroman':
			return 'x-mac-roman';
		case 'utf8bom':
			return 'utf8';
		default:
			const m = enc.match(/windows(\d+)/);
			if (m) {
				return 'windows-' + m[1];
			}

			return enc;
	}
}

export interface IDetectedEncodingResult {
	encoding: string | null;
	seemsBinary: boolean;
}

export interface IReadResult {
	buffer: Buffer | null;
	bytesRead: number;
}

export function detectEncodingFromBuffer(readResult: IReadResult, autoGuessEncoding?: false): IDetectedEncodingResult;
export function detectEncodingFromBuffer(readResult: IReadResult, autoGuessEncoding?: boolean): Promise<IDetectedEncodingResult>;
export function detectEncodingFromBuffer({ buffer, bytesRead }: IReadResult, autoGuessEncoding?: boolean): Promise<IDetectedEncodingResult> | IDetectedEncodingResult {

	// Always first check for BOM to find out about encoding
	let encoding = detectEncodingByBOMFromBuffer(buffer, bytesRead);

	// Detect 0 bytes to see if file is binary or UTF-16 LE/BE
	// unless we already know that this file has a UTF-16 encoding
	let seemsBinary = false;
	if (encoding !== UTF16be && encoding !== UTF16le && buffer) {
		let couldBeUTF16LE = true; // e.g. 0xAA 0x00
		let couldBeUTF16BE = true; // e.g. 0x00 0xAA
		let containsZeroByte = false;

		// This is a simplified guess to detect UTF-16 BE or LE by just checking if
		// the first 512 bytes have the 0-byte at a specific location. For UTF-16 LE
		// this would be the odd byte index and for UTF-16 BE the even one.
		// Note: this can produce false positives (a binary file that uses a 2-byte
		// encoding of the same format as UTF-16) and false negatives (a UTF-16 file
		// that is using 4 bytes to encode a character).
		for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
			const isEndian = (i % 2 === 1); // assume 2-byte sequences typical for UTF-16
			const isZeroByte = (buffer.readInt8(i) === 0);

			if (isZeroByte) {
				containsZeroByte = true;
			}

			// UTF-16 LE: expect e.g. 0xAA 0x00
			if (couldBeUTF16LE && (isEndian && !isZeroByte || !isEndian && isZeroByte)) {
				couldBeUTF16LE = false;
			}

			// UTF-16 BE: expect e.g. 0x00 0xAA
			if (couldBeUTF16BE && (isEndian && isZeroByte || !isEndian && !isZeroByte)) {
				couldBeUTF16BE = false;
			}

			// Return if this is neither UTF16-LE nor UTF16-BE and thus treat as binary
			if (isZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
				break;
			}
		}

		// Handle case of 0-byte included
		if (containsZeroByte) {
			if (couldBeUTF16LE) {
				encoding = UTF16le;
			} else if (couldBeUTF16BE) {
				encoding = UTF16be;
			} else {
				seemsBinary = true;
			}
		}
	}

	// Auto guess encoding if configured
	if (autoGuessEncoding && !seemsBinary && !encoding && buffer) {
		return guessEncodingByBuffer(buffer.slice(0, bytesRead)).then(guessedEncoding => {
			return {
				seemsBinary: false,
				encoding: guessedEncoding
			};
		});
	}

	return { seemsBinary, encoding };
}

// https://ss64.com/nt/chcp.html
const windowsTerminalEncodings = {
	'437': 'cp437', // United States
	'850': 'cp850', // Multilingual(Latin I)
	'852': 'cp852', // Slavic(Latin II)
	'855': 'cp855', // Cyrillic(Russian)
	'857': 'cp857', // Turkish
	'860': 'cp860', // Portuguese
	'861': 'cp861', // Icelandic
	'863': 'cp863', // Canadian - French
	'865': 'cp865', // Nordic
	'866': 'cp866', // Russian
	'869': 'cp869', // Modern Greek
	'936': 'cp936', // Simplified Chinese
	'1252': 'cp1252' // West European Latin
};

export async function resolveTerminalEncoding(verbose?: boolean): Promise<string> {
	let rawEncodingPromise: Promise<string>;

	// Support a global environment variable to win over other mechanics
	const cliEncodingEnv = process.env['VSCODE_CLI_ENCODING'];
	if (cliEncodingEnv) {
		if (verbose) {
			console.log(`Found VSCODE_CLI_ENCODING variable: ${cliEncodingEnv}`);
		}

		rawEncodingPromise = Promise.resolve(cliEncodingEnv);
	}

	// Linux/Mac: use "locale charmap" command
	else if (isLinux || isMacintosh) {
		rawEncodingPromise = new Promise<string>(resolve => {
			if (verbose) {
				console.log('Running "locale charmap" to detect terminal encoding...');
			}

			exec('locale charmap', (err, stdout, stderr) => resolve(stdout));
		});
	}

	// Windows: educated guess
	else {
		rawEncodingPromise = new Promise<string>(resolve => {
			if (verbose) {
				console.log('Running "chcp" to detect terminal encoding...');
			}

			exec('chcp', (err, stdout, stderr) => {
				if (stdout) {
					const windowsTerminalEncodingKeys = Object.keys(windowsTerminalEncodings) as Array<keyof typeof windowsTerminalEncodings>;
					for (const key of windowsTerminalEncodingKeys) {
						if (stdout.indexOf(key) >= 0) {
							return resolve(windowsTerminalEncodings[key]);
						}
					}
				}

				return resolve(undefined);
			});
		});
	}

	const rawEncoding = await rawEncodingPromise;
	if (verbose) {
		console.log(`Detected raw terminal encoding: ${rawEncoding}`);
	}

	if (!rawEncoding || rawEncoding.toLowerCase() === 'utf-8' || rawEncoding.toLowerCase() === UTF8) {
		return UTF8;
	}

	const iconvEncoding = toIconvLiteEncoding(rawEncoding);
	if (iconv.encodingExists(iconvEncoding)) {
		return iconvEncoding;
	}

	if (verbose) {
		console.log('Unsupported terminal encoding, falling back to UTF-8.');
	}

	return UTF8;
}
