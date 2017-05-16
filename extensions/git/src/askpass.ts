/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable, window, InputBoxOptions } from 'vscode';
import * as path from 'path';
import * as http from 'http';

export class Askpass implements Disposable {

	private server: http.Server;
	private portPromise: Promise<number>;
	private enabled = true;

	constructor() {
		this.server = http.createServer((req, res) => this.onRequest(req, res));

		try {
			this.server.listen(0);
			this.portPromise = new Promise<number>(c => this.server.on('listening', () => c(this.server.address().port)));
			this.server.on('error', err => console.error(err));
		} catch (err) {
			this.enabled = false;
		}
	}

	private onRequest(req: http.ServerRequest, res: http.ServerResponse): void {
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

	async getEnv(): Promise<any> {
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
			VSCODE_GIT_ASKPASS_PORT: String(await this.portPromise)
		};
	}

	dispose(): void {
		this.server.close();
	}
}