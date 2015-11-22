/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import streams = require('stream');

import strings = require('vs/base/common/strings');
import mime = require('vs/base/common/mime');

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
 * var mimes = [];
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

export interface IMimeAndEncoding {
	encoding: string;
	mimes: string[];
}

function doDetectMimesFromStream(instream: streams.Readable, callback: (error: Error, result: IMimeAndEncoding) => void): void {
	stream.readExactlyByStream(instream, 512, (err, buffer, bytesRead) => {
		handleReadResult(err, buffer, bytesRead, callback);
	});
}

function doDetectMimesFromFile(absolutePath: string, callback: (error: Error, result: IMimeAndEncoding) => void): void {
	stream.readExactlyByFile(absolutePath, 512, (err, buffer, bytesRead) => {
		handleReadResult(err, buffer, bytesRead, callback);
	});
}

function handleReadResult(err: Error, buffer: NodeBuffer, bytesRead: number, callback: (error: Error, result: IMimeAndEncoding) => void): void {
	if (err) {
		return callback(err, null);
	}

	return callback(null, doDetectMimesFromBuffer(buffer, bytesRead));
}

function doDetectMimesFromBuffer(buffer: NodeBuffer, bytesRead: number): IMimeAndEncoding {
	var enc = encoding.detectEncodingByBOMFromBuffer(buffer, bytesRead);
	var mimes = doDetectMimesFromContent(enc, buffer, bytesRead);

	var isText = true;

	// Detect 0 bytes to see if file is binary (ignore for UTF 16 though)
	if (enc !== encoding.UTF16be && enc !== encoding.UTF16le) {
		for (var i = 0; i < bytesRead; i++) {
			if (buffer.readInt8(i) === 0) {
				isText = false;
				break;
			}
		}
	}

	mimes.push(isText ? mime.MIME_TEXT : mime.MIME_BINARY);

	return {
		mimes: mimes,
		encoding: enc
	};
}

function doDetectMimesFromContent(enc: string, buffer: NodeBuffer, bytesRead: number): string[] {
	if (bytesRead === 0 || !buffer) {
		return [];
	}

	// check for utf8 BOM
	var startpos = 0;
	if (enc !== null) {
		if (enc === encoding.UTF8) {
			startpos = 3; // prepare for skipping BOM
		} else {
			return []; // we don't auto detect from other encodings yet
		}
	}

	return [];
}

function filterAndSortMimes(detectedMimes: string[], guessedMimes: string[]): string[] {
	var mimes = detectedMimes;

	// Add extension based mime as first element as this is the desire of whoever created the file.
	// Never care about application/octet-stream or application/unknown as guessed mime, as this is the fallback of the guess which is never accurate
	var guessedMime = guessedMimes[0];
	if (guessedMime !== mime.MIME_BINARY && guessedMime !== mime.MIME_UNKNOWN) {
		mimes.unshift(guessedMime);
	}

	// Remove duplicate elements from array and sort unspecific mime to the end
	var uniqueSortedMimes = mimes.filter((element, position) => {
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
export function detectMimesFromStream(instream: streams.Readable, nameHint: string, callback: (error: Error, result: IMimeAndEncoding) => void): void {
	doDetectMimesFromStream(instream, (error: Error, result: IMimeAndEncoding) => {
		handleMimeResult(nameHint, error, result, callback);
	});
}

/**
 * Opens the given file to detect its mime type. Returns an array of mime types sorted from most specific to unspecific.
 * @param absolutePath the absolute path of the file.
 */
export function detectMimesFromFile(absolutePath: string, callback: (error: Error, result: IMimeAndEncoding) => void): void {
	doDetectMimesFromFile(absolutePath, (error: Error, result: IMimeAndEncoding) => {
		handleMimeResult(absolutePath, error, result, callback);
	});
}

function handleMimeResult(nameHint: string, error: Error, result: IMimeAndEncoding, callback: (error: Error, result: IMimeAndEncoding) => void): void {
	if (error) {
		return callback(error, null);
	}

	var filterAndSortedMimes = filterAndSortMimes(result.mimes, mime.guessMimeTypes(nameHint));
	result.mimes = filterAndSortedMimes;

	callback(null, result);
}