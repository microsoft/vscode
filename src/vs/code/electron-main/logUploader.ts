/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { localize } from 'vs/nls';
import { ILaunchChannel } from 'vs/code/electron-main/launch';
import { TPromise } from 'vs/base/common/winjs.base';
import product from 'vs/platform/node/product';
import { IRequestService } from 'vs/platform/request/node/request';
import { IRequestContext } from 'vs/base/node/request';
import { IChoiceService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';

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
	requestService: IRequestService,
	choiceService: IChoiceService
): TPromise<any> {
	const endpoint = Endpoint.getFromProduct();
	if (!endpoint) {
		console.error(localize('invalidEndpoint', 'Invalid log uploader endpoint'));
		return;
	}

	const logsPath = await channel.call('get-logs-path', null);

	if (await promptUserToConfirmLogUpload(logsPath, choiceService)) {
		console.log(localize('beginUploading', 'Uploading...'));
		const outZip = await zipLogs(logsPath);
		const result = await postLogs(endpoint, outZip, requestService);
		console.log(localize('didUploadLogs', 'Uploaded logs ID: {0}', result.blob_id));
	} else {
		console.log(localize('userDeniedUpload', 'Canceled upload'));
	}
}

async function promptUserToConfirmLogUpload(
	logsPath: string,
	choiceService: IChoiceService
): Promise<boolean> {
	const message = localize('logUploadPromptHeader', 'Upload session logs to secure endpoint?')
		+ '\n\n' + localize('logUploadPromptBody', 'Please review your log files here: \'{0}\'', logsPath)
		+ '\n\n' + localize('logUploadPromptBodyDetails', 'Logs may contain personal information such as full paths and file contents.')
		+ '\n\n';
	const choice = await choiceService.choose(Severity.Info, message, [
		localize('logUploadPromptKey', 'I have reviewed my logs. Proceed with upload...'),
		localize('logUploadPromptCancel', 'Cancel'),
	], 1);
	return choice === 0;
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
			data: new Buffer(fs.readFileSync(outZip)).toString('base64'),
			headers: {
				'Content-Type': 'application/zip'
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
				const response = Buffer.concat(parts).toString('utf-8');
				if (result.res.statusCode === 200) {
					res(JSON.parse(response));
				} else {
					const errorMessage = localize('responseError', 'Error posting logs. Got {0}', result.res.statusCode);
					console.log(errorMessage);
					reject(new Error(errorMessage));
				}
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