/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on @sergeche's work on the emmet plugin for atom
// TODO: Move to https://github.com/emmetio/image-size

'use strict';

import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { parse as parseUrl } from 'url';
import * as sizeOf from 'image-size';

const reUrl = /^https?:/;

/**
 * Get size of given image file. Supports files from local filesystem,
 * as well as URLs
 * @param  {String} file Path to local file or URL
 * @return {Promise}
 */
export function getImageSize(file) {
	file = file.replace(/^file:\/\//, '');
	return reUrl.test(file) ? getImageSizeFromURL(file) : getImageSizeFromFile(file);
}

/**
 * Get image size from file on local file system
 * @param  {String} file
 * @return {Promise}
 */
function getImageSizeFromFile(file) {
	return new Promise((resolve, reject) => {
		const isDataUrl = file.match(/^data:.+?;base64,/);

		if (isDataUrl) {
			// NB should use sync version of `sizeOf()` for buffers
			try {
				const data = Buffer.from(file.slice(isDataUrl[0].length), 'base64');
				return resolve(sizeForFileName('', sizeOf(data)));
			} catch (err) {
				return reject(err);
			}
		}

		sizeOf(file, (err, size) => {
			if (err) {
				reject(err);
			} else {
				resolve(sizeForFileName(path.basename(file), size));
			}
		});
	});
}

/**
 * Get image size from given remove URL
 * @param  {String} url
 * @return {Promise}
 */
function getImageSizeFromURL(url) {
	return new Promise((resolve, reject) => {
		url = parseUrl(url);
		const getTransport = url.protocol === 'https:' ? https.get : http.get;

		getTransport(url, resp => {
			const chunks = [];
			let bufSize = 0;

			const trySize = chunks => {
				try {
					const size = sizeOf(Buffer.concat(chunks, bufSize));
					resp.removeListener('data', onData);
					resp.destroy(); // no need to read further
					resolve(sizeForFileName(path.basename(url.pathname), size));
				} catch (err) {
					// might not have enough data, skip error
				}
			};

			const onData = chunk => {
				bufSize += chunk.length;
				chunks.push(chunk);
				trySize(chunks);
			};

			resp
				.on('data', onData)
				.on('end', () => trySize(chunks))
				.once('error', err => {
					resp.removeListener('data', onData);
					reject(err);
				});
		})
			.once('error', reject);
	});
}

/**
 * Returns size object for given file name. If file name contains `@Nx` token,
 * the final dimentions will be downscaled by N
 * @param  {String} fileName
 * @param  {Object} size
 * @return {Object}
 */
function sizeForFileName(fileName, size) {
	const m = fileName.match(/@(\d+)x\./);
	const scale = m ? +m[1] : 1;

	return {
		realWidth: size.width,
		realHeight: size.height,
		width: Math.floor(size.width / scale),
		height: Math.floor(size.height / scale)
	};
}
