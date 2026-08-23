/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session } from 'electron';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { COI, FileAccess, Schemas, CacheControlheaders, DocumentPolicyheaders } from '../../../base/common/network.js';
import { basename, extname, normalize } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { IIPCObjectUrl, IProtocolMainService } from './protocol.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';

type ProtocolCallback = { (result: string | Electron.FilePathWithHeaders | { error: number }): void };

const mimeTypes = new Map<string, string>([
	['.js', 'text/javascript'],
	['.mjs', 'text/javascript'],
	['.css', 'text/css'],
	['.html', 'text/html'],
	['.json', 'application/json'],
	['.svg', 'image/svg+xml'],
	['.png', 'image/png'],
	['.jpg', 'image/jpeg'],
	['.jpeg', 'image/jpeg'],
	['.gif', 'image/gif'],
	['.bmp', 'image/bmp'],
	['.webp', 'image/webp'],
	['.mp4', 'video/mp4'],
	['.otf', 'font/otf'],
	['.ttf', 'font/ttf'],
	['.wasm', 'application/wasm'],
	['.map', 'application/json']
]);

interface IByteRange {
	readonly start: number;
	readonly end: number;
}

export class ProtocolMainService extends Disposable implements IProtocolMainService {

	declare readonly _serviceBrand: undefined;

	private readonly validRoots = TernarySearchTree.forPaths<boolean>(!isLinux);
	private readonly validExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.mp4', '.otf', '.ttf']); // https://github.com/microsoft/vscode/issues/119384

	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.addValidFileRoot(environmentService.appRoot);
		this.addValidFileRoot(environmentService.extensionsPath);
		this.addValidFileRoot(userDataProfilesService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath);
		this.addValidFileRoot(environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath);
		this.handleProtocols();
	}

	private handleProtocols(): void {
		const { defaultSession } = session;

		defaultSession.protocol.handle(Schemas.vscodeFileResource, request => this.handleResourceRequest(request));
		defaultSession.protocol.interceptFileProtocol(Schemas.file, (request, callback) => this.handleFileRequest(request, callback));
		this._register(toDisposable(() => {
			defaultSession.protocol.unhandle(Schemas.vscodeFileResource);
			defaultSession.protocol.uninterceptProtocol(Schemas.file);
		}));
	}

	addValidFileRoot(root: string): IDisposable {
		const normalizedRoot = normalize(root);
		if (!this.validRoots.get(normalizedRoot)) {
			this.validRoots.set(normalizedRoot, true);
			return toDisposable(() => this.validRoots.delete(normalizedRoot));
		}
		return Disposable.None;
	}

	//#region file://

	private handleFileRequest(request: Electron.ProtocolRequest, callback: ProtocolCallback) {
		const uri = URI.parse(request.url);
		this.logService.error(`Refused to load resource ${uri.fsPath} from ${Schemas.file}: protocol (original URL: ${request.url})`);
		return callback({ error: -3 /* ABORTED */ });
	}

	//#endregion

	//#region vscode-file://

	private async handleResourceRequest(request: Request): Promise<Response> {
		const path = this.requestToNormalizedFilePath(request);
		const pathBasename = basename(path);
		const headers = this.getResponseHeaders(request, pathBasename);

		if (!this.validRoots.findSubstr(path) && !this.validExtensions.has(extname(path).toLowerCase())) {
			this.logService.error(`${Schemas.vscodeFileResource}: Refused to load resource ${path} from ${Schemas.vscodeFileResource}: protocol (original URL: ${request.url})`);
			return new Response(null, { status: 403, headers });
		}

		let fileSize: number;
		try {
			const fileStat = await stat(path);
			if (!fileStat.isFile()) {
				return new Response(null, { status: 404, headers });
			}
			fileSize = fileStat.size;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			const status = code === 'EACCES' || code === 'EPERM' ? 403 : 404;
			this.logService.error(`${Schemas.vscodeFileResource}: Failed to stat resource ${path} from ${Schemas.vscodeFileResource}: protocol (original URL: ${request.url})`, error);
			return new Response(null, { status, headers });
		}

		const rangeHeader = request.headers.get('range');
		const range = rangeHeader ? parseByteRange(rangeHeader, fileSize) : undefined;
		if (rangeHeader && !range) {
			headers.set('accept-ranges', 'bytes');
			headers.set('content-range', `bytes */${fileSize}`);
			return new Response(null, { status: 416, headers });
		}

		const start = range?.start ?? 0;
		const end = range?.end ?? Math.max(0, fileSize - 1);
		const contentLength = fileSize === 0 ? 0 : end - start + 1;
		headers.set('content-length', String(contentLength));
		headers.set('accept-ranges', 'bytes');
		if (range) {
			headers.set('content-range', `bytes ${start}-${end}/${fileSize}`);
		}

		if (request.method === 'HEAD' || fileSize === 0) {
			return new Response(null, { status: range ? 206 : 200, headers });
		}

		try {
			const stream = Readable.toWeb(createReadStream(path, { start, end }));
			return new Response(stream as unknown as BodyInit, { status: range ? 206 : 200, headers });
		} catch (error) {
			this.logService.error(`${Schemas.vscodeFileResource}: Failed to stream resource ${path} from ${Schemas.vscodeFileResource}: protocol (original URL: ${request.url})`, error);
			return new Response(null, { status: 404, headers });
		}
	}

	private getResponseHeaders(request: Request, pathBasename: string): Headers {
		const headers = new Headers({ 'content-type': mimeTypes.get(extname(this.requestToNormalizedFilePath(request)).toLowerCase()) || 'application/octet-stream' });
		if (this.environmentService.crossOriginIsolated) {
			const coiHeaders = pathBasename === 'workbench.html' || pathBasename === 'workbench-dev.html' ? COI.CoopAndCoep : COI.getHeadersFromQuery(request.url);
			if (coiHeaders) {
				Object.entries(coiHeaders).forEach(([key, value]) => headers.set(key, String(value)));
			}
		}
		if (!this.environmentService.isBuilt) {
			Object.entries(CacheControlheaders).forEach(([key, value]) => headers.set(key, String(value)));
		}
		if (pathBasename === 'workbench.html' || pathBasename === 'workbench-dev.html') {
			Object.entries(DocumentPolicyheaders).forEach(([key, value]) => headers.set(key, String(value)));
		}
		return headers;
	}

	private requestToNormalizedFilePath(request: Request): string {
		const requestUri = URI.parse(request.url);
		const unnormalizedFileUri = FileAccess.uriToFileUri(requestUri);
		return normalize(unnormalizedFileUri.fsPath);
	}

	//#endregion

	//#region IPC Object URLs

	createIPCObjectUrl<T>(): IIPCObjectUrl<T> {
		let obj: T | undefined = undefined;
		const resource = URI.from({ scheme: 'vscode', path: generateUuid() });
		const channel = resource.toString();
		const handler = async (): Promise<T | undefined> => obj;
		validatedIpcMain.handle(channel, handler);
		this.logService.trace(`IPC Object URL: Registered new channel ${channel}.`);
		return {
			resource,
			update: updatedObj => obj = updatedObj,
			dispose: () => {
				this.logService.trace(`IPC Object URL: Removed channel ${channel}.`);
				validatedIpcMain.removeHandler(channel);
			}
		};
	}

	//#endregion
}

function parseByteRange(value: string, size: number): IByteRange | undefined {
	if (size === 0 || !/^bytes=\d*-\d*$/.test(value)) {
		return undefined;
	}
	const [startText, endText] = value.slice('bytes='.length).split('-');
	let start: number;
	let end: number;
	if (!startText) {
		const suffixLength = Number(endText);
		if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
			return undefined;
		}
		start = Math.max(0, size - suffixLength);
		end = size - 1;
	} else {
		start = Number(startText);
		end = endText ? Number(endText) : size - 1;
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
			return undefined;
		}
		end = Math.min(end, size - 1);
	}
	return { start, end };
}
