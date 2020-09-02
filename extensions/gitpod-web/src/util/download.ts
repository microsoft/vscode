/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { basename } from 'path';
import { URL } from 'url';
import { createGunzip } from 'zlib';
import * as stream from 'stream';
import * as vscode from 'vscode';

export function download(url: string, dest: string, token: vscode.CancellationToken, timeout?: number): Promise<void> {
	const uri = new URL(url);
	if (!dest) {
		dest = basename(uri.pathname);
	}
	const pkg = url.toLowerCase().startsWith('https:') ? https : http;

	return new Promise((resolve, reject) => {
		const request = pkg.get(uri.href).on('response', (res: http.IncomingMessage) => {
			if (res.statusCode === 200) {
				const file = fs.createWriteStream(dest, { flags: 'wx' });
				res.on('end', () => {
					file.end();
					// console.log(`${uri.pathname} downloaded to: ${path}`)
					resolve();
				}).on('error', (err: any) => {
					file.destroy();
					fs.unlink(dest, () => reject(err));
				});

				let dataStream: stream.Readable = res;
				if (res.headers['content-encoding'] === 'gzip') {
					dataStream = res.pipe(createGunzip());
				}
				dataStream.pipe(file);
			} else if (res.statusCode === 302 || res.statusCode === 301) {
				// Recursively follow redirects, only a 200 will resolve.
				download(res.headers.location!, dest, token, timeout).then(() => resolve());
			} else {
				reject(new Error(`Download request failed, response status: ${res.statusCode} ${res.statusMessage}`));
			}
		});

		if (timeout) {
			request.setTimeout(timeout, () => {
				request.abort();
				reject(new Error(`Request timeout after ${timeout / 1000.0}s`));
			});
		}

		token.onCancellationRequested(() => {
			request.abort();
			reject(new Error(`Request cancelled`));
		});
	});
}
