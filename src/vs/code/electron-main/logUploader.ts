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
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

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
	environmentService: IEnvironmentService
): TPromise<any> {
	const endpoint = Endpoint.getFromProduct();
	if (!endpoint) {
		console.error(localize('invalidEndpoint', 'Invalid log uploader endpoint'));
		return;
	}

	const logsPath = await channel.call('get-logs-path', null);

	if (await promptUserToConfirmLogUpload(logsPath, environmentService)) {
		console.log(localize('beginUploading', 'Uploading...'));
		const outZip = await zipLogs(logsPath);
		const result = await postLogs(endpoint, outZip, requestService);
		console.log(localize('didUploadLogs', 'Upload successful! Log file ID: {0}', result.blob_id));
	}
}

function promptUserToConfirmLogUpload(
	logsPath: string,
	environmentService: IEnvironmentService
): boolean {
	const confirmKey = 'iConfirmLogsUpload';
	if ((environmentService.args['upload-logs'] || '').toLowerCase() === confirmKey.toLowerCase()) {
		return true;
	} else {
		const message = localize('logUploadPromptHeader', 'You are about to upload your session logs to a secure Microsoft endpoint that only Microsoft\'s members of the VS Code team can access.')
			+ '\n\n' + localize('logUploadPromptBody', 'Session logs may contain personal information such as full paths or file contents. Please review and redact your session log files here: \'{0}\'', logsPath)
			+ '\n\n' + localize('logUploadPromptBodyDetails', 'By continuing you confirm that you have reviewed and redacted your session log files and that you agree to Microsoft using them to debug VS Code.')
			+ '\n\n' + localize('logUploadPromptAcceptInstructions', 'Please run code with \'--upload-logs={0}\' to proceed with upload', confirmKey);
		console.log(message);
		return false;
	}
}

async function postLogs(
	endpoint: Endpoint,
	outZip: string,
	requestService: IRequestService
): TPromise<PostResult> {
	const dotter = setInterval(() => console.log('.'), 5000);
	let result: IRequestContext;
	try {
		result = await requestService.request({
			url: endpoint.url,
			type: 'POST',
			data: Buffer.from(fs.readFileSync(outZip)).toString('base64'),
			headers: {
				'Content-Type': 'application/zip'
			}
		});
	} catch (e) {
		clearInterval(dotter);
		console.log(localize('postError', 'Error posting logs: {0}', e));
		throw e;
	}

	return new TPromise<PostResult>((res, reject) => {
		const parts: Buffer[] = [];
		result.stream.on('data', data => {
			parts.push(data);
		});

		result.stream.on('end', () => {
			clearInterval(dotter);
			try {
				const response = Buffer.concat(parts).toString('utf-8');
				if (result.res.statusCode === 200) {
					res(JSON.parse(response));
				} else {
					const errorMessage = localize('responseError', 'Error posting logs. Got {0} — {1}', result.res.statusCode, response);
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
		doZip(logsPath, outZip, tempDir, (err, stdout, stderr) => {
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
	tempDir: string,
	callback: (error: Error, stdout: string, stderr: string) => void
) {
	switch (os.platform()) {
		case 'win32':
			// Copy directory first to avoid file locking issues
			const sub = path.join(tempDir, 'sub');
			return cp.execFile('powershell', ['-Command',
				`[System.IO.Directory]::CreateDirectory("${sub}"); Copy-Item -recurse "${logsPath}" "${sub}"; Compress-Archive -Path "${sub}" -DestinationPath "${outZip}"`],
				{ cwd: logsPath },
				callback);
		default:
			return cp.execFile('zip', ['-r', outZip, '.'], { cwd: logsPath }, callback);
	}
}