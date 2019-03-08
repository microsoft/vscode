/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

function ensureDir(filepath: string) {
	if (!fs.existsSync(filepath)) {
		ensureDir(path.dirname(filepath));
		fs.mkdirSync(filepath);
	}
}

function download(options: https.RequestOptions, destination: string): Promise<void> {
	ensureDir(path.dirname(destination));

	return new Promise<void>((c, e) => {
		const fd = fs.openSync(destination, 'w');
		const req = https.get(options, (res) => {
			res.on('data', (chunk) => {
				fs.writeSync(fd, chunk);
			});
			res.on('end', () => {
				fs.closeSync(fd);
				c();
			});
		});
		req.on('error', (reqErr) => {
			console.error(`request to ${options.host}${options.path} failed.`);
			console.error(reqErr);
			e(reqErr);
		});
	});
}

const MARKER_ARGUMENT = `_download_fork_`;

function base64encode(str: string): string {
	return Buffer.from(str, 'utf8').toString('base64');
}

function base64decode(str: string): string {
	return Buffer.from(str, 'base64').toString('utf8');
}

export interface IDownloadRequestOptions {
	host: string;
	path: string;
}

export interface IDownloadOptions {
	requestOptions: IDownloadRequestOptions;
	destinationPath: string;
}

export function downloadInExternalProcess(options: IDownloadOptions): Promise<void> {
	const url = `https://${options.requestOptions.host}${options.requestOptions.path}`;
	console.log(`Downloading ${url}...`);
	return new Promise<void>((c, e) => {
		const child = cp.fork(
			__filename,
			[MARKER_ARGUMENT, base64encode(JSON.stringify(options))],
			{
				stdio: ['pipe', 'pipe', 'pipe', 'ipc']
			}
		);
		let stderr: Buffer[] = [];
		child.stderr.on('data', (chunk) => {
			stderr.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
		});
		child.on('exit', (code) => {
			if (code === 0) {
				// normal termination
				console.log(`Finished downloading ${url}.`);
				c();
			} else {
				// abnormal termination
				console.error(Buffer.concat(stderr).toString());
				e(new Error(`Download of ${url} failed.`));
			}
		});
	});
}

function _downloadInExternalProcess() {
	let options: IDownloadOptions;
	try {
		options = JSON.parse(base64decode(process.argv[3]));
	} catch (err) {
		console.error(`Cannot read arguments`);
		console.error(err);
		process.exit(-1);
		return;
	}

	download(options.requestOptions, options.destinationPath).then(() => {
		process.exit(0);
	}, (err) => {
		console.error(err);
		process.exit(-2);
	});
}

if (process.argv.length >= 4 && process.argv[2] === MARKER_ARGUMENT) {
	// running as forked download script
	_downloadInExternalProcess();
}
