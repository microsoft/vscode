/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as url from 'url';
import * as readline from 'readline';

import { localize } from 'vs/nls';
import { ILaunchChannel } from 'vs/code/electron-main/launch';
import { TPromise } from 'vs/base/common/winjs.base';
import product from 'vs/platform/node/product';

interface PostResult {
	readonly blob_id: string;
}

class Endpoint {
	private constructor(
		public readonly host: string,
		public readonly path: string
	) { }

	public static getFromProduct(): Endpoint | undefined {
		const logUploaderUrl = product.logUploaderUrl;
		if (!logUploaderUrl) {
			return undefined;
		}

		try {
			const parsed = url.parse(logUploaderUrl);
			return new Endpoint(parsed.host, parsed.path);
		} catch {
			return undefined;
		}
	}
}

export async function uploadLogs(
	channel: ILaunchChannel
): TPromise<any> {
	const endpoint = Endpoint.getFromProduct();
	if (!endpoint) {
		console.error(localize('invalidEndpoint', 'Invalid log uploader endpoint'));
		return;
	}

	const logsPath = await channel.call('get-logs-path', null);

	if (await promptUserToConfirmLogUplod(logsPath)) {
		const outZip = await zipLogs(logsPath);
		const result = await postLogs(endpoint, logsPath, outZip);
		console.log(localize('didUploadLogs', 'Uploaded logs ID: {0}', result.blob_id));
	} else {
		console.log(localize('userDeniedUpload', 'Canceled upload'));
	}
}

async function promptUserToConfirmLogUplod(
	logsPath: string
): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	return new TPromise<boolean>(resolve =>
		rl.question(
			localize('logUploadPromptHeader', 'Upload session logs to secure endpoint?')
			+ '\n\n' + localize('logUploadPromptBody', 'Please review your log files: \'{0}\'', logsPath)
			+ '\n\n' + localize('logUploadPromptKey', 'Enter \'y\' to confirm upload...'),
			(answer: string) => {
				rl.close();
				resolve(answer && answer.trim()[0].toLowerCase() === 'y');
			}));
}

function postLogs(
	endpoint: Endpoint,
	logsPath: string,
	outZip: string
): TPromise<PostResult> {
	return new TPromise((resolve, reject) => {
		const req = https.request({
			host: endpoint.host,
			path: endpoint.path,
			method: 'POST',
			headers: {
				'Content-Type': 'application/zip',
				'Content-Length': fs.statSync(logsPath).size
			}
		}, res => {
			const chunks: (Buffer)[] = [];
			res.on('data', (chunk: Buffer) => {
				chunks.push(chunk);
			});
			res.on('end', () => {
				const body = Buffer.concat(chunks);
				try {
					resolve(JSON.parse(body.toString()));
				} catch (e) {
					console.log(localize('parseError', 'Error parsing response'));
					reject(e);
				}
			});
			res.on('error', (e) => {
				console.log(localize('postError', 'Error posting logs: {0}', e));
				reject(e);
			});
		});
		fs.createReadStream(outZip).pipe(req);
	});
}

function zipLogs(
	logsPath: string
): TPromise<string> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-log-upload'));
	const outZip = path.join(tempDir, 'logs.zip');
	return new TPromise<string>((resolve, reject) => {
		doZip(logsPath, outZip, (err, stdout, stderr) => {
			if (err) {
				console.error(localize('zipError', 'Error zipping logs: {0}', err));
				reject(err);
			} else {
				resolve(outZip);
			}
		});
	});
}

function doZip(
	logsPath: string,
	outZip: string,
	callback: (error: Error, stdout: string, stderr: string) => void
) {
	switch (os.platform()) {
		case 'win32':
			return cp.execFile('powershell', ['-Command', `Compress-Archive -Path "${logsPath}" -DestinationPath ${outZip}`], { cwd: logsPath }, callback);

		default:
			return cp.execFile('zip', ['-r', outZip, '.'], { cwd: logsPath }, callback);
	}
}