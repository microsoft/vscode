/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRandomIPCHandle } from '../../../base/parts/ipc/node/ipc.net.js';
import * as http from 'http';
import * as fs from 'fs';
import { IExtHostCommands } from '../common/extHostCommands.js';
import { IWindowOpenable, IOpenWindowOptions } from '../../../platform/window/common/window.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { hasWorkspaceFileExtension } from '../../../platform/workspace/common/workspace.js';

export interface OpenCommandPipeArgs {
	type: 'open';
	fileURIs?: string[];
	folderURIs?: string[];
	forceNewWindow?: boolean;
	diffMode?: boolean;
	mergeMode?: boolean;
	addMode?: boolean;
	gotoLineMode?: boolean;
	forceReuseWindow?: boolean;
	waitMarkerFilePath?: string;
	remoteAuthority?: string | null;
}

export interface OpenExternalCommandPipeArgs {
	type: 'openExternal';
	uris: string[];
}

export interface StatusPipeArgs {
	type: 'status';
}

export interface ExtensionManagementPipeArgs {
	type: 'extensionManagement';
	list?: { showVersions?: boolean; category?: string };
	install?: string[];
	uninstall?: string[];
	force?: boolean;
}

export type PipeCommand = OpenCommandPipeArgs | StatusPipeArgs | OpenExternalCommandPipeArgs | ExtensionManagementPipeArgs;

export interface ICommandsExecuter {
	executeCommand<T>(id: string, ...args: any[]): Promise<T>;
}

export class CLIServerBase {
	private readonly _server: http.Server;

	constructor(
		private readonly _commands: ICommandsExecuter,
		private readonly logService: ILogService,
		private readonly _ipcHandlePath: string,
	) {
		this._server = http.createServer((req, res) => this.onRequest(req, res));
		this.setup().catch(err => {
			logService.error(err);
			return '';
		});
	}

	public get ipcHandlePath() {
		return this._ipcHandlePath;
	}

	private async setup(): Promise<string> {
		try {
			this._server.listen(this.ipcHandlePath);
			this._server.on('error', err => this.logService.error(err));
		} catch (err) {
			this.logService.error('Could not start open from terminal server.');
		}

		return this._ipcHandlePath;
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const sendResponse = (statusCode: number, returnObj: string | undefined) => {
			res.writeHead(statusCode, { 'content-type': 'application/json' });
			res.end(JSON.stringify(returnObj || null), (err?: any) => err && this.logService.error(err)); // CodeQL [SM01524] Only the message portion of errors are passed in.
		};

		const chunks: string[] = [];
		req.setEncoding('utf8');
		req.on('data', (d: string) => chunks.push(d));
		req.on('end', async () => {
			try {
				const data: PipeCommand | any = JSON.parse(chunks.join(''));
				let returnObj: string | undefined;
				switch (data.type) {
					case 'open':
						returnObj = await this.open(data);
						break;
					case 'openExternal':
						returnObj = await this.openExternal(data);
						break;
					case 'status':
						returnObj = await this.getStatus(data);
						break;
					case 'extensionManagement':
						returnObj = await this.manageExtensions(data);
						break;
					default:
						sendResponse(404, `Unknown message type: ${data.type}`);
						break;
				}
				sendResponse(200, returnObj);
			} catch (e) {
				const message = e instanceof Error ? e.message : JSON.stringify(e);
				sendResponse(500, message);
				this.logService.error('Error while processing pipe request', e);
			}
		});
	}

	private async open(data: OpenCommandPipeArgs): Promise<undefined> {
		const { fileURIs, folderURIs, forceNewWindow, diffMode, mergeMode, addMode, forceReuseWindow, gotoLineMode, waitMarkerFilePath, remoteAuthority } = data;
		const urisToOpen: IWindowOpenable[] = [];
		if (Array.isArray(folderURIs)) {
			for (const s of folderURIs) {
				try {
					urisToOpen.push({ folderUri: URI.parse(s) });
				} catch (e) {
					// ignore
				}
			}
		}
		if (Array.isArray(fileURIs)) {
			for (const s of fileURIs) {
				try {
					if (hasWorkspaceFileExtension(s)) {
						urisToOpen.push({ workspaceUri: URI.parse(s) });
					} else {
						urisToOpen.push({ fileUri: URI.parse(s) });
					}
				} catch (e) {
					// ignore
				}
			}
		}
		const waitMarkerFileURI = waitMarkerFilePath ? URI.file(waitMarkerFilePath) : undefined;
		const preferNewWindow = !forceReuseWindow && !waitMarkerFileURI && !addMode;
		const windowOpenArgs: IOpenWindowOptions = { forceNewWindow, diffMode, mergeMode, addMode, gotoLineMode, forceReuseWindow, preferNewWindow, waitMarkerFileURI, remoteAuthority };
		this._commands.executeCommand('_remoteCLI.windowOpen', urisToOpen, windowOpenArgs);
	}

	private async openExternal(data: OpenExternalCommandPipeArgs): Promise<undefined> {
		for (const uriString of data.uris) {
			const uri = URI.parse(uriString);
			const urioOpen = uri.scheme === 'file' ? uri : uriString; // workaround for #112577
			await this._commands.executeCommand('_remoteCLI.openExternal', urioOpen);
		}
	}

	private async manageExtensions(data: ExtensionManagementPipeArgs): Promise<string | undefined> {
		const toExtOrVSIX = (inputs: string[] | undefined) => inputs?.map(input => /\.vsix$/i.test(input) ? URI.parse(input) : input);
		const commandArgs = {
			list: data.list,
			install: toExtOrVSIX(data.install),
			uninstall: toExtOrVSIX(data.uninstall),
			force: data.force
		};
		return await this._commands.executeCommand<string | undefined>('_remoteCLI.manageExtensions', commandArgs);
	}

	private async getStatus(data: StatusPipeArgs): Promise<string | undefined> {
		return await this._commands.executeCommand<string | undefined>('_remoteCLI.getSystemStatus');
	}

	dispose(): void {
		this._server.close();

		if (this._ipcHandlePath && process.platform !== 'win32' && fs.existsSync(this._ipcHandlePath)) {
			fs.unlinkSync(this._ipcHandlePath);
		}
	}
}

export class CLIServer extends CLIServerBase {
	constructor(
		@IExtHostCommands commands: IExtHostCommands,
		@ILogService logService: ILogService
	) {
		super(commands, logService, createRandomIPCHandle());
	}
}
