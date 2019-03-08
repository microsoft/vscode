/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateRandomPipeName } from 'vs/base/parts/ipc/node/ipc.net';
import * as http from 'http';
import * as fs from 'fs';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { IURIToOpen, URIType } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';
import { hasWorkspaceFileExtension } from 'vs/platform/workspaces/common/workspaces';


export class CLIServer {

	private _server: http.Server;
	private _ipcHandlePath: string | undefined;

	constructor(private _commands: ExtHostCommands) {
		this._server = http.createServer((req, res) => this.onRequest(req, res));
		this.setup().catch(err => {
			console.error(err);
			return '';
		});
	}

	public get ipcHandlePath() {
		return this._ipcHandlePath;
	}

	private async setup(): Promise<string> {
		this._ipcHandlePath = generateRandomPipeName();

		try {
			this._server.listen(this.ipcHandlePath);
			this._server.on('error', err => console.error(err));
		} catch (err) {
			console.error('Could not start open from terminal server.');
		}

		return this._ipcHandlePath;
	}
	private collectURIToOpen(strs: string[], typeHint: URIType, result: IURIToOpen[]): void {
		if (Array.isArray(strs)) {
			for (const s of strs) {
				try {
					result.push({ uri: URI.parse(s), typeHint });
				} catch (e) {
					// ignore
				}
			}
		}
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const chunks: string[] = [];
		req.setEncoding('utf8');
		req.on('data', (d: string) => chunks.push(d));
		req.on('end', () => {
			const data = JSON.parse(chunks.join(''));
			switch (data.type) {
				case 'open':
					this.open(data, res);
					break;
				default:
					res.writeHead(404);
					res.write(`Unkown message type: ${data.type}`, err => {
						if (err) {
							console.error(err);
						}
					});
					res.end();
					break;
			}
		});
	}

	private open(data: any, res: http.ServerResponse) {
		let { fileURIs, folderURIs, forceNewWindow, diffMode, addMode, forceReuseWindow } = data;
		if (folderURIs && folderURIs.length || fileURIs && fileURIs.length) {
			const urisToOpen: IURIToOpen[] = [];
			this.collectURIToOpen(folderURIs, 'folder', urisToOpen);
			this.collectURIToOpen(fileURIs, 'file', urisToOpen);
			if (!forceReuseWindow && urisToOpen.some(o => o.typeHint === 'folder' || (o.typeHint === 'file' && hasWorkspaceFileExtension(o.uri.path)))) {
				forceNewWindow = true;
			}
			this._commands.executeCommand('_files.windowOpen', { urisToOpen, forceNewWindow, diffMode, addMode, forceReuseWindow });
		}
		res.writeHead(200);
		res.end();
	}

	dispose(): void {
		this._server.close();

		if (this._ipcHandlePath && process.platform !== 'win32' && fs.existsSync(this._ipcHandlePath)) {
			fs.unlinkSync(this._ipcHandlePath);
		}
	}
}
