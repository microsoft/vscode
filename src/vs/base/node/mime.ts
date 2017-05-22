/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import streams = require('stream');

import mime = require('vs/base/common/mime');
import { TPromise } from 'vs/base/common/winjs.base';

import stream = require('vs/base/node/stream');
import encoding = require('vs/base/node/encoding');

/**
 * Lots of binary file types exists where the type can be determined by matching the first few bytes against some "magic patterns".
 * E.g. PDF files always start with %PDF- and the rest of the file contains mostly text, but sometimes binary data (for fonts and images).
 * In order to detect these types correctly (and independently from the file's extension), the content base mime type detection must be performed
 * on any file, not only on text files.
 *
 * Here is the original mime type detection in pseudocode:
 *
 * let mimes = [];
 *
 * read file extension
 *
 * if (file extension matches) {
 * 	if (file extension is bogus) {
 * 		// ignore.
 * 		// this covers *.manifest files which can contain arbitrary content, so the extension is of no value.
 * 		// a consequence of this is that the content based mime type becomes the most specific type in the array
 * 	} else {
 * 		mimes.push(associated mime type)	  // first element: most specific
 * 	}
 * }
 *
 * read file contents
 *
 * if (content based match found) {	// this is independent from text or binary
 * 	mimes.push(associated mime type)
 * 	if (a second mime exists for the match) {   // should be rare; text/plain should never be included here
 * 		// e.g. for svg: ['image/svg+xml', 'application/xml']
 * 		mimes.push(second mime)
 * 	}
 * }
 *
 * if (content == text)
 * 	mimes.push('text/plain')   // last element: least specific
 * else
 * 	mimes.push('application/octet-stream')    // last element: least specific
 */

const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512; // number of bytes to look at to decide about a file being binary or not

const NO_GUESS_BUFFER_MAX_LEN = 512; 		// when not auto guessing the encoding, small number of bytes are enough
const AUTO_GUESS_BUFFER_MAX_LEN = 512 * 8; // with auto guessing we want a lot more content to be read for guessing

function maxBufferLen(arg1?: DetectMimesOption | boolean): number {
	let autoGuessEncoding: boolean;
	if (typeof arg1 === 'boolean') {
		autoGuessEncoding = arg1;
	} else {
		autoGuessEncoding = arg1 && arg1.autoGuessEncoding;
	}

	return autoGuessEncoding ? AUTO_GUESS_BUFFER_MAX_LEN : NO_GUESS_BUFFER_MAX_LEN;
}

export interface IMimeAndEncoding {
	encoding: string;
	mimes: string[];
}

export interface DetectMimesOption {
	autoGuessEncoding?: boolean;
}

function doDetectMimesFromStream(instream: streams.Readable, option?: DetectMimesOption): TPromise<IMimeAndEncoding> {
	return stream.readExactlyByStream(instream, maxBufferLen(option)).then((readResult: stream.ReadResult) => {
		return detectMimeAndEncodingFromBuffer(readResult, option && option.autoGuessEncoding);
	});
}

function doDetectMimesFromFile(absolutePath: string, option?: DetectMimesOption): TPromise<IMimeAndEncoding> {
	return stream.readExactlyByFile(absolutePath, maxBufferLen(option)).then((readResult: stream.ReadResult) => {
		return detectMimeAndEncodingFromBuffer(readResult, option && option.autoGuessEncoding);
	});
}

export function detectMimeAndEncodingFromBuffer({ buffer, bytesRead }: stream.ReadResult, autoGuessEncoding?: boolean): IMimeAndEncoding {
	let enc = encoding.detectEncodingByBOMFromBuffer(buffer, bytesRead);

	// Detect 0 bytes to see if file is binary (ignore for UTF 16 though)
	let isText = true;
	if (enc !== encoding.UTF16be && enc !== encoding.UTF16le) {
		for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
			if (buffer.readInt8(i) === 0) {
				isText = false;
				break;
			}
		}
	}

	if (autoGuessEncoding && isText && !enc) {
		enc = encoding.guessEncodingByBuffer(buffer.slice(0, bytesRead));
	}

	return {
		mimes: isText ? [mime.MIME_TEXT] : [mime.MIME_BINARY],
		encoding: enc
	};
}

function filterAndSortMimes(detectedMimes: string[], guessedMimes: string[]): string[] {
	const mimes = detectedMimes;

	// Add extension based mime as first element as this is the desire of whoever created the file.
	// Never care about application/octet-stream or application/unknown as guessed mime, as this is the fallback of the guess which is never accurate
	const guessedMime = guessedMimes[0];
	if (guessedMime !== mime.MIME_BINARY && guessedMime !== mime.MIME_UNKNOWN) {
		mimes.unshift(guessedMime);
	}

	// Remove duplicate elements from array and sort unspecific mime to the end
	const uniqueSortedMimes = mimes.filter((element, position) => {
		return element && mimes.indexOf(element) === position;
	}).sort((mimeA, mimeB) => {
		if (mimeA === mime.MIME_BINARY) { return 1; }
		if (mimeB === mime.MIME_BINARY) { return -1; }
		if (mimeA === mime.MIME_TEXT) { return 1; }
		if (mimeB === mime.MIME_TEXT) { return -1; }

		return 0;
	});

	return uniqueSortedMimes;
}

/**
 * Opens the given stream to detect its mime type. Returns an array of mime types sorted from most specific to unspecific.
 * @param instream the readable stream to detect the mime types from.
 * @param nameHint an additional hint that can be used to detect a mime from a file extension.
 */
export function detectMimesFromStream(instream: streams.Readable, nameHint: string, option?: DetectMimesOption): TPromise<IMimeAndEncoding> {
	return doDetectMimesFromStream(instream, option).then(encoding =>
		handleMimeResult(nameHint, encoding)
	);
}

/**
 * Opens the given file to detect its mime type. Returns an array of mime types sorted from most specific to unspecific.
 * @param absolutePath the absolute path of the file.
 */
export function detectMimesFromFile(absolutePath: string, option?: DetectMimesOption): TPromise<IMimeAndEncoding> {
	return doDetectMimesFromFile(absolutePath, option).then(encoding =>
		handleMimeResult(absolutePath, encoding)
	);
}

function handleMimeResult(nameHint: string, result: IMimeAndEncoding): IMimeAndEncoding {
	const filterAndSortedMimes = filterAndSortMimes(result.mimes, mime.guessMimeTypes(nameHint));
	result.mimes = filterAndSortedMimes;

	return result;
}