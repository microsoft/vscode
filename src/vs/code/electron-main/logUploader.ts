/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { localize } from 'vs/nls';
import { ILaunchChannel } from 'vs/code/electron-main/launch';
import { TPromise } from 'vs/base/common/winjs.base';
import product from 'vs/platform/node/product';
import { IRequestService } from 'vs/platform/request/node/request';
import { IRequestContext } from 'vs/base/node/request';

interface PostResult {
	readonly blob_id: string;
}

class Endpoint {
	private constructor(
		public readonly url: string
	) { }

	public static getFromProduct(): Endpoint | undefined {
		const logUploaderUrl = product.logUploaderUrl;
		return logUploaderUrl ? new Endpoint(logUploaderUrl) : undefined;
	}
}

export async function uploadLogs(
	channel: ILaunchChannel,
	requestService: IRequestService
): TPromise<any> {
	const endpoint = Endpoint.getFromProduct();
	if (!endpoint) {
		console.error(localize('invalidEndpoint', 'Invalid log uploader endpoint'));
		return;
	}

	const logsPath = await channel.call('get-logs-path', null);

	if (await promptUserToConfirmLogUpload(logsPath)) {
		const outZip = await zipLogs(logsPath);
		const result = await postLogs(endpoint, outZip, requestService);
		console.log(localize('didUploadLogs', 'Uploaded logs ID: {0}', result.blob_id));
	} else {
		console.log(localize('userDeniedUpload', 'Canceled upload'));
	}
}

async function promptUserToConfirmLogUpload(
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

async function postLogs(
	endpoint: Endpoint,
	outZip: string,
	requestService: IRequestService
): TPromise<PostResult> {
	let result: IRequestContext;
	try {
		result = await requestService.request({
			url: endpoint.url,
			type: 'POST',
			data: fs.createReadStream(outZip),
			headers: {
				'Content-Type': 'application/zip',
				'Content-Length': fs.statSync(outZip).size
			}
		});
	} catch (e) {
		console.log(localize('postError', 'Error posting logs: {0}', e));
		throw e;
	}

	return new TPromise<PostResult>((res, reject) => {
		const parts: Buffer[] = [];
		result.stream.on('data', data => {
			parts.push(data);
		});

		result.stream.on('end', () => {
			try {
				const result = Buffer.concat(parts).toString('utf-8');
				res(JSON.parse(result));
			} catch (e) {
				console.log(localize('parseError', 'Error parsing response'));
				reject(e);
			}
		});
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