/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';
import * as util from 'util';
import * as cookie from 'cookie';
import * as crypto from 'crypto';
import { isEqualOrParent } from 'vs/base/common/extpath';
import { getMediaMime } from 'vs/base/common/mime';
import { isLinux } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';
import { IServerEnvironmentService } from 'vs/server/serverEnvironmentService';
import { extname, dirname, join, normalize } from 'vs/base/common/path';
import { FileAccess } from 'vs/base/common/network';
import { generateUuid } from 'vs/base/common/uuid';
import { IProductService } from 'vs/platform/product/common/productService';

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
		const stat = await util.promisify(fs.stat)(filePath);

		// Check if file modified since
		const etag = `W/"${[stat.ino, stat.size, stat.mtime.getTime()].join('-')}"`; // weak validator (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
		if (req.headers['if-none-match'] === etag) {
			res.writeHead(304);
			return res.end();
		}

		// Headers
		responseHeaders['Content-Type'] = textMimeType[extname(filePath)] || getMediaMime(filePath) || 'text/plain';
		responseHeaders['Etag'] = etag;

		res.writeHead(200, responseHeaders);

		// Data
		fs.createReadStream(filePath).pipe(res);
	} catch (error) {
		if (error.code !== 'ENOENT') {
			logService.error(error);
			console.error(error.toString());
		}

		res.writeHead(404, { 'Content-Type': 'text/plain' });
		return res.end('Not found');
	}
}

const APP_ROOT = dirname(FileAccess.asFileUri('', require).fsPath);

export class WebClientServer {

	constructor(
		private readonly _connectionToken: string,
		private readonly _environmentService: IServerEnvironmentService,
		private readonly _logService: ILogService,
		private readonly _productService: IProductService
	) { }

	async handle(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {
		try {
			const pathname = parsedUrl.pathname!;

			if (pathname === '/favicon.ico' || pathname === '/manifest.json' || pathname === '/code-192.png' || pathname === '/code-512.png') {
				// always serve icons/manifest, even without a token
				return serveFile(this._logService, req, res, join(APP_ROOT, 'resources', 'server', pathname.substr(1)));
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
				return this._handleCallback(res);
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

		// Strip `/static/` from the path
		const normalizedPathname = decodeURIComponent(parsedUrl.pathname!); // support paths that are uri-encoded (e.g. spaces => %20)
		const relativeFilePath = normalize(normalizedPathname.substr('/static/'.length));

		const filePath = join(APP_ROOT, relativeFilePath);
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
			responseHeaders['Set-Cookie'] = cookie.serialize('vscode-tkn', queryTkn, { sameSite: 'strict', maxAge: 60 * 60 * 24 * 7 /* 1 week */ });

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

		function escapeAttribute(value: string): string {
			return value.replace(/"/g, '&quot;');
		}

		let _wrapWebWorkerExtHostInIframe: undefined | false = undefined;
		if (this._environmentService.driverHandle) {
			// integration tests run at a time when the built output is not yet published to the CDN
			// so we must disable the iframe wrapping because the iframe URL will give a 404
			_wrapWebWorkerExtHostInIframe = false;
		}

		const filePath = FileAccess.asFileUri(this._environmentService.isBuilt ? 'vs/code/browser/workbench/workbench.html' : 'vs/code/browser/workbench/workbench-dev.html', require).fsPath;
		const authSessionInfo = !this._environmentService.isBuilt && this._environmentService.args['github-auth'] ? {
			id: generateUuid(),
			providerId: 'github',
			accessToken: this._environmentService.args['github-auth'],
			scopes: [['user:email'], ['repo']]
		} : undefined;
		const data = (await util.promisify(fs.readFile)(filePath)).toString()
			.replace('{{WORKBENCH_WEB_CONFIGURATION}}', escapeAttribute(JSON.stringify({
				remoteAuthority,
				_wrapWebWorkerExtHostInIframe,
				developmentOptions: { enableSmokeTestDriver: this._environmentService.driverHandle === 'web' ? true : undefined },
				settingsSyncOptions: !this._environmentService.isBuilt && this._environmentService.args['enable-sync'] ? { enabled: true } : undefined,
			})))
			.replace('{{WORKBENCH_AUTH_SESSION}}', () => authSessionInfo ? escapeAttribute(JSON.stringify(authSessionInfo)) : '');

		const cspDirectives = [
			'default-src \'self\';',
			'img-src \'self\' https: data: blob:;',
			'media-src \'self\';',
			`script-src 'self' 'unsafe-eval' ${this._getScriptCspHashes(data).join(' ')} 'sha256-9CevbjD7QdrWdGrVTVJD74tTH4eAhisvCOlLtWUn+Iw=' http://${remoteAuthority};`, // the sha is the same as in src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html
			'child-src \'self\';',
			`frame-src 'self' https://*.vscode-webview.net ${this._productService.webEndpointUrl || ''} data:;`,
			'worker-src \'self\' data:;',
			'style-src \'self\' \'unsafe-inline\';',
			'connect-src \'self\' ws: wss: https:;',
			'font-src \'self\' blob:;',
			'manifest-src \'self\';'
		].join(' ');

		res.writeHead(200, {
			'Content-Type': 'text/html',
			// At this point we know the client has a valid cookie
			// and we want to set it prolong it to ensure that this
			// client is valid for another 1 week at least
			'Set-Cookie': cookie.serialize('vscode-tkn', this._connectionToken, { sameSite: 'strict', maxAge: 60 * 60 * 24 * 7 /* 1 week */ }),
			'Content-Security-Policy': cspDirectives
		});
		return res.end(data);
	}

	private _getScriptCspHashes(content: string): string[] {
		// Compute the CSP hashes for line scripts. Uses regex
		// which means it isn't 100% good.
		const regex = /<script>([\s\S]+?)<\/script>/img;
		const result: string[] = [];
		let match: RegExpExecArray | null;
		while (match = regex.exec(content)) {
			const hasher = crypto.createHash('sha256');
			// This only works on Windows if we strip `\r` from `\r\n`.
			const script = match[1].replace(/\r\n/g, '\n');
			const hash = hasher
				.update(Buffer.from(script))
				.digest().toString('base64');

			result.push(`'sha256-${hash}'`);
		}
		return result;
	}

	/**
	 * Handle HTTP requests for /callback
	 */
	private async _handleCallback(res: http.ServerResponse): Promise<void> {
		const filePath = FileAccess.asFileUri('vs/code/browser/workbench/callback.html', require).fsPath;
		const data = (await util.promisify(fs.readFile)(filePath)).toString();
		const cspDirectives = [
			'default-src \'self\';',
			'img-src \'self\' https: data: blob:;',
			'media-src \'none\';',
			`script-src 'self' ${this._getScriptCspHashes(data).join(' ')};`,
			'style-src \'self\' \'unsafe-inline\';',
			'font-src \'self\' blob:;'
		].join(' ');

		res.writeHead(200, {
			'Content-Type': 'text/html',
			'Content-Security-Policy': cspDirectives
		});
		return res.end(data);
	}
}
