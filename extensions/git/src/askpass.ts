/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, window, InputBoxOptions } from 'vscode';
import { denodeify } from './util';
import * as path from 'path';
import * as http from 'http';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';

const randomBytes = denodeify<Buffer>(crypto.randomBytes);

export interface AskpassEnvironment {
	GIT_ASKPASS: string;
	ELECTRON_RUN_AS_NODE?: string;
	VSCODE_GIT_ASKPASS_NODE?: string;
	VSCODE_GIT_ASKPASS_MAIN?: string;
	VSCODE_GIT_ASKPASS_HANDLE?: string;
}

function getIPCHandlePath(nonce: string): string {
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\vscode-git-askpass-${nonce}-sock`;
	}

	if (process.env['XDG_RUNTIME_DIR']) {
		return path.join(process.env['XDG_RUNTIME_DIR'] as string, `vscode-git-askpass-${nonce}.sock`);
	}

	return path.join(os.tmpdir(), `vscode-git-askpass-${nonce}.sock`);
}

export class Askpass implements Disposable {

	private server: http.Server;
	private ipcHandlePathPromise: Promise<string>;
	private ipcHandlePath: string | undefined;
	private enabled = true;

	constructor() {
		this.server = http.createServer((req, res) => this.onRequest(req, res));
		this.ipcHandlePathPromise = this.setup().catch(err => {
			console.error(err);
			return '';
		});
	}

	private async setup(): Promise<string> {
		const buffer = await randomBytes(20);
		const nonce = buffer.toString('hex');
		const ipcHandlePath = getIPCHandlePath(nonce);
		this.ipcHandlePath = ipcHandlePath;

		try {
			this.server.listen(ipcHandlePath);
			this.server.on('error', err => console.error(err));
		} catch (err) {
			console.error('Could not launch git askpass helper.');
			this.enabled = false;
		}

		return ipcHandlePath;
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const chunks: string[] = [];
		req.setEncoding('utf8');
		req.on('data', (d: string) => chunks.push(d));
		req.on('end', () => {
			const { request, host } = JSON.parse(chunks.join(''));

			this.prompt(host, request).then(result => {
				res.writeHead(200);
				res.end(JSON.stringify(result));
			}, () => {
				res.writeHead(500);
				res.end();
			});
		});
	}

	private async prompt(host: string, request: string): Promise<string> {
		const options: InputBoxOptions = {
			password: /password/i.test(request),
			placeHolder: request,
			prompt: `Git: ${host}`,
			ignoreFocusOut: true
		};

		return await window.showInputBox(options) || '';
	}

	async getEnv(): Promise<AskpassEnvironment> {
		if (!this.enabled) {
			return {
				GIT_ASKPASS: path.join(__dirname, 'askpass-empty.sh')
			};
		}

		return {
			ELECTRON_RUN_AS_NODE: '1',
			GIT_ASKPASS: path.join(__dirname, 'askpass.sh'),
			VSCODE_GIT_ASKPASS_NODE: process.execPath,
			VSCODE_GIT_ASKPASS_MAIN: path.join(__dirname, 'askpass-main.js'),
			VSCODE_GIT_ASKPASS_HANDLE: await this.ipcHandlePathPromise
		};
	}

	dispose(): void {
		this.server.close();

		if (this.ipcHandlePath && process.platform !== 'win32') {
			fs.unlinkSync(this.ipcHandlePath);
		}
	}
}