/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import * as util from 'util';
import { isEqualOrParent, sanitizeFilePath } from 'vs/base/common/extpath';
import { Disposable } from 'vs/base/common/lifecycle';
import { getMediaMime } from 'vs/base/common/mime';
import { isLinux } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { findFreePort } from 'vs/base/node/ports';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { createRemoteURITransformer } from 'vs/server/remoteUriTransformer';
import { ILogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import product from 'vs/platform/product/node/product';

const textMimeType = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
} as { [ext: string]: string | undefined };

const APP_ROOT = path.dirname(URI.parse(require.toUrl('')).fsPath);

export class WebUIServer extends Disposable {

	private _webviewServer: http.Server | null;

	constructor(
		private readonly _connectionToken: string,
		private readonly _environmentService: EnvironmentService,
		private readonly _logService: ILogService
	) {
		super();
		this._webviewServer = null;
	}

	async init(port: number): Promise<void> {
		const webviewPort = port > 0 ? await findFreePort(+port + 1, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */) : 0;
		this._webviewServer = this.spawnWebviewServer(webviewPort);
	}

	async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {


		// Workbench
		try {
			const headers: Record<string, string> = Object.create(null);
			const parsedUrl = url.parse(req.url!, true);
			const pathname = url.parse(req.url!).pathname;
			let validatePath = true;

			let filePath: string;
			if (pathname === '/') {
				filePath = URI.parse(require.toUrl('vs/code/browser/workbench/workbench.html')).fsPath;

				const remoteAuthority = req.headers.host!; // TODO@web this is localhost when opening 127.0.0.1 and is possibly undefined, does it matter?
				const transformer = createRemoteURITransformer(remoteAuthority);

				const { workspacePath, isFolder } = await this._getWorkspace(req.url);

				const webviewServerAddress = this._webviewServer!.address();
				const webviewEndpoint = 'http://' + (typeof webviewServerAddress === 'string'
					? webviewServerAddress
					: (webviewServerAddress.address === '::' ? 'localhost' : webviewServerAddress.address) + ':' + webviewServerAddress.port);

				function escapeAttribute(value: string): string {
					return value.replace(/"/g, '&quot;');
				}

				const data = (await util.promisify(fs.readFile)(filePath)).toString()
					.replace('{{WORKBENCH_WEB_CONGIGURATION}}', escapeAttribute(JSON.stringify({
						folderUri: (workspacePath && isFolder) ? transformer.transformOutgoing(URI.file(workspacePath)) : undefined,
						workspaceUri: (workspacePath && !isFolder) ? transformer.transformOutgoing(URI.file(workspacePath)) : undefined,
						remoteAuthority,
						webviewEndpoint,
						driver: this._environmentService.driverHandle === 'web' ? true : undefined,
					})))
					.replace('{{WEBVIEW_ENDPOINT}}', webviewEndpoint)
					.replace('{{PRODUCT_CONFIGURATION}}', escapeAttribute(JSON.stringify(product)))
					.replace('{{REMOTE_USER_DATA_URI}}', escapeAttribute(JSON.stringify(transformer.transformOutgoing(this._environmentService.webUserDataHome))));

				res.writeHead(200, { 'Content-Type': textMimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain' });
				return res.end(data);
			}

			// Favicon
			else if (pathname === '/favicon.ico') {
				filePath = path.join(APP_ROOT, 'resources', 'server', 'favicon.ico');
			}

			// Extension/Workspace resources
			else if (pathname === '/vscode-remote') {
				const { query } = url.parse(req.url!);
				if (typeof query !== 'string') {
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					res.end(`Bad request.`);
					return;
				}
				try {
					let queryData = JSON.parse(decodeURIComponent(query));
					filePath = URI.revive(queryData).fsPath;
					validatePath = false;
				} catch (err) {
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					res.end(`Bad request.\n${err}`);
					return;
				}

				if (isEqualOrParent(filePath, this._environmentService.builtinExtensionsPath, !isLinux)
					|| isEqualOrParent(filePath, this._environmentService.extensionsPath, !isLinux)
				) {
					headers['Cache-Control'] = 'public, max-age=31536000';
					headers['X-VSCode-Extension'] = 'true';
				}
			}

			// Extension/Workspace resources
			else if (pathname === '/vscode-remote2') {
				if (parsedUrl.query['tkn'] !== this._connectionToken) {
					res.writeHead(403, { 'Content-Type': 'text/plain' });
					res.end(`Forbidden.`);
					return;
				}
				const desiredPath = parsedUrl.query['path'];
				if (typeof desiredPath !== 'string') {
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					res.end(`Bad request.`);
					return;
				}
				try {
					filePath = URI.from({ scheme: Schemas.file, path: desiredPath }).fsPath;
					validatePath = false;
				} catch (err) {
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					res.end(`Bad request.\n${err}`);
					return;
				}

				return this._serveFile(req, res, filePath, headers);
			}

			// Anything else
			else {
				const client = (this._environmentService.args as any)['client'];
				let clientRoot;
				if (!client || pathname! === '/out/vs/code/browser/workbench/workbench.js') {
					clientRoot = APP_ROOT;
				} else {
					clientRoot = path.normalize(client); // use provided path as client root
					validatePath = false; // do not validate path as such
				}

				filePath = path.join(clientRoot, path.normalize(pathname!));
			}

			if (validatePath && !isEqualOrParent(filePath, APP_ROOT, !isLinux)) {
				throw new Error(`Invalid path ${pathname}`); // prevent navigation outside root
			}

			const stat = await util.promisify(fs.stat)(filePath);
			if (stat.isDirectory()) {
				filePath += '/index.html';
			}

			// Allow all service worker requests to control the "max" scope
			// see: https://www.w3.org/TR/service-workers-1/#extended-http-headers
			if (req.headers['service-worker']) {
				headers['Service-Worker-Allowed'] = '/';
			}

			headers['Content-Type'] = textMimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain';
			res.writeHead(200, headers);
			const data = await util.promisify(fs.readFile)(filePath);
			return res.end(data);
		} catch (error) {
			this._logService.error(error);
			console.error(error.toString());

			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return res.end('Not found');
		}
	}

	private async _serveFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, headers: Record<string, string>): Promise<void> {
		try {
			headers['Content-Type'] = textMimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain';
			res.writeHead(200, headers);
			const data = await util.promisify(fs.readFile)(filePath);
			return res.end(data);
		} catch (error) {
			this._logService.error(error);
			console.error(error.toString());

			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return res.end('Not found');
		}
	}

	private async _getWorkspace(url: string | undefined): Promise<{ workspacePath?: string, isFolder?: boolean }> {

		// empty window requested?
		if (this._getQueryValue(url, 'ew') === 'true') {
			// empty window
			return {};
		}

		const cwd = process.env['VSCODE_CWD'] || process.cwd();

		const queryWorkspace = this._getQueryValue(url, 'workspace');
		const queryFolder = this._getQueryValue(url, 'folder');

		// check for workspace argument
		if (queryWorkspace || !queryFolder /* queries always have higher priority */) {
			let workspaceCandidate: string;
			if (queryWorkspace) {
				workspaceCandidate = URI.from({ scheme: Schemas.file, path: queryWorkspace }).fsPath;
			} else {
				workspaceCandidate = (this._environmentService.args as any)['workspace'];
			}

			if (workspaceCandidate && workspaceCandidate.length > 0) {
				const workspace = sanitizeFilePath(workspaceCandidate, cwd);
				if (await util.promisify(fs.exists)(workspace)) {
					return { workspacePath: workspace };
				}
			}
		}

		// check for folder argument
		let folderCandidate: string;
		if (queryFolder) {
			folderCandidate = URI.from({ scheme: Schemas.file, path: queryFolder }).fsPath;
		} else {
			folderCandidate = (this._environmentService.args as any)['folder'];
		}

		if (folderCandidate && folderCandidate.length > 0) {
			const folder = sanitizeFilePath(folderCandidate, cwd);
			if (await util.promisify(fs.exists)(folder)) {
				return { workspacePath: folder, isFolder: true };
			}
		}

		// empty window otherwise
		return {};
	}

	private _getQueryValue(url: string | undefined, key: string): string | undefined {
		if (url === undefined) {
			return undefined;
		}
		const queryString = url.split('?')[1];
		if (queryString) {
			const args = queryString.split('&');
			for (let i = 0; i < args.length; i++) {
				const split = args[i].split('=');
				if (split[0] === key) {
					return decodeURIComponent(split[1]);
				}
			}
		}
		return undefined;
	}

	private spawnWebviewServer(webviewPort: number): http.Server {
		const webviewServer = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
			// Only serve GET requests
			if (req.method !== 'GET') {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				return res.end(`Unsupported method ${req.method}`);
			}
			const rootPath = URI.parse(require.toUrl('vs/workbench/contrib/webview/browser/pre')).fsPath;
			const resourceWhitelist = new Set([
				'/index.html',
				'/',
				'/fake.html',
				'/main.js',
				'/host.js',
				'/service-worker.js'
			]);
			try {
				const requestUrl = url.parse(req.url!);
				if (!resourceWhitelist.has(requestUrl.pathname!)) {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
					return res.end('Not found');
				}
				const filePath = rootPath + (requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
				const data = await util.promisify(fs.readFile)(filePath);
				res.writeHead(200, { 'Content-Type': textMimeType[path.extname(filePath)] || 'text/plain' });
				return res.end(data);
			}
			catch (error) {
				console.error(error.toString());
				this._logService.error(error);
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				return res.end('Not found');
			}
		});
		webviewServer.on('error', (err) => {
			this._logService.error(`Error occurred in webviewServer`, err);
			console.error(`Error occurred in webviewServer`);
			console.error(err);
		});
		webviewServer.listen(webviewPort, () => {
			const address = webviewServer.address();
			// Do not change this line. VS Code looks for this in
			// the output.
			console.log(`webview server listening on ${typeof address === 'string' ? address : address.port}`);
			this._logService.trace(`webview server listening on ${typeof address === 'string' ? address : address.port}`);
		});
		this._register({ dispose: () => webviewServer.close() });
		return webviewServer;
	}
}
