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
	private _webviewEndpoint: string | null;

	constructor(
		private readonly _connectionToken: string,
		private readonly _environmentService: EnvironmentService,
		private readonly _logService: ILogService
	) {
		super();
		this._webviewServer = null;
		this._webviewEndpoint = null;
	}

	dispose(): void {
		if (this._webviewServer) {
			this._webviewServer.close();
		}
		super.dispose();
	}

	async init(port: number): Promise<void> {
		const webviewPort = port > 0 ? await findFreePort(+port + 1, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */) : 0;
		this._webviewServer = this.spawnWebviewServer(webviewPort);
		const webviewServerAddress = this._webviewServer.address();
		this._webviewEndpoint = 'http://' + (typeof webviewServerAddress === 'string'
			? webviewServerAddress
			: (webviewServerAddress.address === '::' ? 'localhost' : webviewServerAddress.address) + ':' + webviewServerAddress.port);
	}

	async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		if (!req.url) {
			return this._serveError(req, res, 400, `Bad request.`);
		}

		try {
			const parsedUrl = url.parse(req.url, true);
			const pathname = parsedUrl.pathname;

			if (!pathname) {
				return this._serveError(req, res, 400, `Bad request.`);
			}

			if (pathname === '/') {
				return this._handleRoot(req, res, parsedUrl);
			}
			if (pathname === '/favicon.ico') {
				return this._serveFile(req, res, path.join(APP_ROOT, 'resources', 'server', 'favicon.ico'));
			}
			if (pathname === '/vscode-remote') {
				return this._handleVSCodeRemoteResource(req, res, parsedUrl);
			}
			if (pathname === '/vscode-remote2') {
				return this._handleVSCodeRemoteResource2(req, res, parsedUrl);
			}
			if (/^\/static\//.test(pathname)) {
				// This is a request for a static "core" resource
				return this._handleStatic(req, res, parsedUrl);
			}

			return this._serveError(req, res, 404, 'Not found.');
		} catch (error) {
			this._logService.error(error);
			console.error(error.toString());

			return this._serveError(req, res, 500, 'Internal Server Error.');
		}
	}

	/**
	 * Handle HTTP requests for /static/*
	 */
	private async _handleStatic(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		const headers: Record<string, string> = Object.create(null);
		// Allow all service worker requests to control the "max" scope
		// see: https://www.w3.org/TR/service-workers-1/#extended-http-headers
		if (req.headers['service-worker']) {
			headers['Service-Worker-Allowed'] = '/';
		}

		// Strip `/static/` from the path
		const relativeFilePath = path.normalize(parsedUrl.pathname!.substr('/static/'.length));

		const client = (this._environmentService.args as any)['client'];
		if (client && parsedUrl.pathname !== '/static/out/vs/code/browser/workbench/workbench.js') {
			// use provided path as client root
			const filePath = path.join(path.normalize(client), relativeFilePath);
			return this._serveFile(req, res, filePath, headers);
		}

		const filePath = path.join(APP_ROOT, relativeFilePath);
		if (!isEqualOrParent(filePath, APP_ROOT, !isLinux)) {
			return this._serveError(req, res, 400, `Bad request.`);
		}

		return this._serveFile(req, res, filePath, headers);
	}

	/**
	 * Handle HTTP requests for /
	 */
	private async _handleRoot(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		if (!req.headers.host) {
			return this._serveError(req, res, 400, `Bad request.`);
		}

		const remoteAuthority = req.headers.host;
		const transformer = createRemoteURITransformer(remoteAuthority);
		const webviewEndpoint = this._webviewEndpoint || '';
		const { workspacePath, isFolder } = await this._getWorkspace(parsedUrl);

		function escapeAttribute(value: string): string {
			return value.replace(/"/g, '&quot;');
		}

		const filePath = URI.parse(require.toUrl('vs/code/browser/workbench/workbench.html')).fsPath;
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

	/**
	 * Handle HTTP requests for resources rendered in the web client (images, fonts, etc.)
	 * These resources could be files shipped with extensions or even workspace files.
	 */
	private async _handleVSCodeRemoteResource(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		const { query } = url.parse(req.url!);
		if (typeof query !== 'string') {
			return this._serveError(req, res, 400, `Bad request.`);
		}

		let filePath: string;
		try {
			let queryData = JSON.parse(decodeURIComponent(query));
			filePath = URI.revive(queryData).fsPath;
		} catch (err) {
			return this._serveError(req, res, 400, `Bad request.`);
		}

		const responseHeaders: Record<string, string> = Object.create(null);
		if (isEqualOrParent(filePath, this._environmentService.builtinExtensionsPath, !isLinux)
			|| isEqualOrParent(filePath, this._environmentService.extensionsPath, !isLinux)
		) {
			responseHeaders['Cache-Control'] = 'public, max-age=31536000';
			responseHeaders['X-VSCode-Extension'] = 'true';
		}

		return this._serveFile(req, res, filePath, responseHeaders);
	}

	/**
	 * Handle HTTP requests for resources rendered in the rich client (images, fonts, etc.)
	 * These resources could be files shipped with extensions or even workspace files.
	 */
	private async _handleVSCodeRemoteResource2(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		if (parsedUrl.query['tkn'] !== this._connectionToken) {
			return this._serveError(req, res, 403, `Forbidden.`);
		}

		const desiredPath = parsedUrl.query['path'];
		if (typeof desiredPath !== 'string') {
			return this._serveError(req, res, 400, `Bad request.`);
		}

		let filePath: string;
		try {
			filePath = URI.from({ scheme: Schemas.file, path: desiredPath }).fsPath;
		} catch (err) {
			return this._serveError(req, res, 400, `Bad request.`);
		}

		return this._serveFile(req, res, filePath);
	}

	/**
	 * Return an error to the client.
	 */
	private async _serveError(req: http.IncomingMessage, res: http.ServerResponse, errorCode: number, errorMessage: string): Promise<void> {
		res.writeHead(errorCode, { 'Content-Type': 'text/plain' });
		res.end(errorMessage);
	}

	/**
	 * Serve a file at a given path or 404 if the file is missing.
	 */
	private async _serveFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, responseHeaders: Record<string, string> = Object.create(null)): Promise<void> {
		try {
			responseHeaders['Content-Type'] = textMimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain';
			res.writeHead(200, responseHeaders);
			const data = await util.promisify(fs.readFile)(filePath);
			return res.end(data);
		} catch (error) {
			this._logService.error(error);
			console.error(error.toString());

			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return res.end('Not found');
		}
	}

	private async _getWorkspace(parsedUrl: url.UrlWithParsedQuery): Promise<{ workspacePath?: string, isFolder?: boolean }> {

		// empty window requested?
		if (this._getFirstQueryValue(parsedUrl, 'ew') === 'true') {
			// empty window
			return {};
		}

		const cwd = process.env['VSCODE_CWD'] || process.cwd();
		const queryWorkspace = this._getFirstQueryValue(parsedUrl, 'workspace');
		const queryFolder = this._getFirstQueryValue(parsedUrl, 'folder');

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

	private _getFirstQueryValue(parsedUrl: url.UrlWithParsedQuery, key: string): string | undefined {
		const result = parsedUrl.query[key];
		return Array.isArray(result) ? result[0] : result;
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
