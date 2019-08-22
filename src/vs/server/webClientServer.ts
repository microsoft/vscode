/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import * as util from 'util';
import * as cookie from 'cookie';
import { isEqualOrParent, sanitizeFilePath } from 'vs/base/common/extpath';
import { Disposable } from 'vs/base/common/lifecycle';
import { getMediaMime } from 'vs/base/common/mime';
import { isLinux } from 'vs/base/common/platform';
import { URI, UriComponents } from 'vs/base/common/uri';
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

/**
 * Return an error to the client.
 */
export async function serveError(req: http.IncomingMessage, res: http.ServerResponse, errorCode: number, errorMessage: string): Promise<void> {
	res.writeHead(errorCode, { 'Content-Type': 'text/plain' });
	res.end(errorMessage);
}

/**
 * Serve a file at a given path or 404 if the file is missing.
 */
export async function serveFile(logService: ILogService, req: http.IncomingMessage, res: http.ServerResponse, filePath: string, responseHeaders: Record<string, string> = Object.create(null)): Promise<void> {
	try {
		responseHeaders['Content-Type'] = textMimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain';
		res.writeHead(200, responseHeaders);
		const data = await util.promisify(fs.readFile)(filePath);
		return res.end(data);
	} catch (error) {
		logService.error(error);
		console.error(error.toString());

		res.writeHead(404, { 'Content-Type': 'text/plain' });
		return res.end('Not found');
	}
}

const APP_ROOT = path.dirname(URI.parse(require.toUrl('')).fsPath);

export class WebClientServer extends Disposable {

	private _webviewServer: http.Server | null;
	private _webviewEndpoint: string | null;
	private _mapCallbackUriToRequestId: Map<string, UriComponents> = new Map();

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

	async handle(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		try {
			const pathname = parsedUrl.pathname!;

			if (pathname === '/favicon.ico') {
				// always server favicon, even without a token
				return serveFile(this._logService, req, res, path.join(APP_ROOT, 'resources', 'server', 'favicon.ico'));
			}
			if (/^\/static\//.test(pathname)) {
				// always serve static requests, even without a token
				return this._handleStatic(req, res, parsedUrl);
			}
			if (pathname === '/') {
				// the token handling is done inside the handler
				return this._handleRoot(req, res, parsedUrl);
			}
			if (pathname === '/callback') {
				// callback support
				return this._handleCallback(req, res, parsedUrl);
			}
			if (pathname === '/fetch-callback') {
				// callback fetch support
				return this._handleFetchCallback(req, res, parsedUrl);
			}

			return serveError(req, res, 404, 'Not found.');
		} catch (error) {
			this._logService.error(error);
			console.error(error.toString());

			return serveError(req, res, 500, 'Internal Server Error.');
		}
	}

	private _hasCorrectTokenCookie(req: http.IncomingMessage): boolean {
		const cookies = cookie.parse(req.headers.cookie || '');
		return (cookies['vscode-tkn'] === this._connectionToken);
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
			return serveFile(this._logService, req, res, filePath, headers);
		}

		const filePath = path.join(APP_ROOT, relativeFilePath);
		if (!isEqualOrParent(filePath, APP_ROOT, !isLinux)) {
			return serveError(req, res, 400, `Bad request.`);
		}

		return serveFile(this._logService, req, res, filePath, headers);
	}

	/**
	 * Handle HTTP requests for /
	 */
	private async _handleRoot(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		if (!req.headers.host) {
			return serveError(req, res, 400, `Bad request.`);
		}

		const queryTkn = parsedUrl.query['tkn'];
		if (typeof queryTkn === 'string') {
			// tkn came in via a query string
			// => set a cookie and redirect to url without tkn
			const responseHeaders: Record<string, string> = Object.create(null);
			responseHeaders['Set-Cookie'] = cookie.serialize('vscode-tkn', queryTkn, { maxAge: 60 * 60 * 24 * 7 /* 1 week */ });

			const newQuery = Object.create(null);
			for (let key in parsedUrl.query) {
				if (key !== 'tkn') {
					newQuery[key] = parsedUrl.query[key];
				}
			}
			const newLocation = url.format({ pathname: '/', query: newQuery });
			responseHeaders['Location'] = newLocation;

			res.writeHead(302, responseHeaders);
			return res.end();
		}

		if (this._environmentService.isBuilt && !this._hasCorrectTokenCookie(req)) {
			return serveError(req, res, 403, `Forbidden.`);
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

	private _getFirstQueryValues(parsedUrl: url.UrlWithParsedQuery, ignoreKeys?: string[]): Map<string, string> {
		const queryValues = new Map<string, string>();

		for (const key in parsedUrl.query) {
			if (ignoreKeys && ignoreKeys.indexOf(key) >= 0) {
				continue;
			}

			const value = this._getFirstQueryValue(parsedUrl, key);
			if (typeof value === 'string') {
				queryValues.set(key, value);
			}
		}

		return queryValues;
	}

	/**
	 * Handle HTTP requests for /callback
	 */
	private async _handleCallback(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		const wellKnownKeys = ['vscode-requestId', 'vscode-scheme', 'vscode-authority', 'vscode-path', 'vscode-query', 'vscode-fragment'];
		const [requestId, vscodeScheme, vscodeAuthority, vscodePath, vscodeQuery, vscodeFragment] = wellKnownKeys.map(key => {
			const value = this._getFirstQueryValue(parsedUrl, key);
			if (value) {
				return decodeURIComponent(value);
			}

			return value;
		});

		if (!requestId) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			return res.end(`Bad request.`);
		}

		// merge over additional query values that we got
		let query: string | undefined = vscodeQuery;
		let index = 0;
		this._getFirstQueryValues(parsedUrl, wellKnownKeys).forEach((value, key) => {
			if (!query) {
				query = '';
			}

			const prefix = (index++ === 0) ? '' : '&';
			query = `${prefix}${key}=${value}`;
		});

		// add to map of known callbacks
		this._mapCallbackUriToRequestId.set(requestId, URI.from({ scheme: vscodeScheme || product.urlProtocol, authority: vscodeAuthority, path: vscodePath, query, fragment: vscodeFragment }).toJSON());

		res.writeHead(200, { 'Content-Type': 'text/html' });
		return res.end('Please close this browser tab.');
	}

	/**
	 * Handle HTTP requests for /fetch-callback
	 */
	private async _handleFetchCallback(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		const requestId = this._getFirstQueryValue(parsedUrl, 'vscode-requestId')!;
		if (!requestId) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			return res.end(`Bad request.`);
		}

		const knownCallbackUri = this._mapCallbackUriToRequestId.get(requestId);
		if (knownCallbackUri) {
			this._mapCallbackUriToRequestId.delete(requestId);
		}

		res.writeHead(200, { 'Content-Type': 'text/json' });
		return res.end(JSON.stringify(knownCallbackUri));
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
