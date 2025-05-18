/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Copyright (c) 2025 Incanus Technologies Ltd.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createReadStream, promises } from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import * as cookie from 'cookie';
import * as crypto from 'crypto';
import { isEqualOrParent } from '../../base/common/extpath.js';
import { getMediaMime } from '../../base/common/mime.js';
import { isLinux } from '../../base/common/platform.js';
import { ILogService, LogLevel } from '../../platform/log/common/log.js';
import { IServerEnvironmentService } from './serverEnvironmentService.js';
import { extname, dirname, join, normalize, posix } from '../../base/common/path.js';
import { FileAccess, connectionTokenCookieName, connectionTokenQueryName, Schemas, builtinExtensionsPath } from '../../base/common/network.js';
import { generateUuid } from '../../base/common/uuid.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { ServerConnectionToken, ServerConnectionTokenType } from './serverConnectionToken.js';
import { asTextOrError, IRequestService } from '../../platform/request/common/request.js';
import { IHeaders } from '../../base/parts/request/common/request.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { URI } from '../../base/common/uri.js';
import { streamToBuffer } from '../../base/common/buffer.js';
import { IProductConfiguration } from '../../base/common/product.js';
import { isString, Mutable } from '../../base/common/types.js';
import { getLocaleFromConfig, getBrowserNLSConfiguration } from './remoteLanguagePacks.js';
import { CharCode } from '../../base/common/charCode.js';
import { IExtensionManifest } from '../../platform/extensions/common/extensions.js';
import { ICSSDevelopmentService } from '../../platform/cssDev/node/cssDevService.js';

const textMimeType: { [ext: string]: string | undefined } = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
};

/**
 * Return an error to the client.
 */
export async function serveError(req: http.IncomingMessage, res: http.ServerResponse, errorCode: number, errorMessage: string): Promise<void> {
	res.writeHead(errorCode, { 'Content-Type': 'text/plain' });
	res.end(errorMessage);
}

export const enum CacheControl {
	NO_CACHING, ETAG, NO_EXPIRY
}

/**
 * Serve a file at a given path or 404 if the file is missing.
 */
export async function serveFile(filePath: string, cacheControl: CacheControl, logService: ILogService, req: http.IncomingMessage, res: http.ServerResponse, responseHeaders: Record<string, string>): Promise<void> {
	try {
		const stat = await promises.stat(filePath); // throws an error if file doesn't exist
		if (cacheControl === CacheControl.ETAG) {

			// Check if file modified since
			const etag = `W/"${[stat.ino, stat.size, stat.mtime.getTime()].join('-')}"`; // weak validator (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
			if (req.headers['if-none-match'] === etag) {
				res.writeHead(304);
				return void res.end();
			}

			responseHeaders['Etag'] = etag;
		} else if (cacheControl === CacheControl.NO_EXPIRY) {
			responseHeaders['Cache-Control'] = 'public, max-age=31536000';
		} else if (cacheControl === CacheControl.NO_CACHING) {
			responseHeaders['Cache-Control'] = 'no-store';
		}

		responseHeaders['Content-Type'] = textMimeType[extname(filePath)] || getMediaMime(filePath) || 'text/plain';

		res.writeHead(200, responseHeaders);

		// Data
		createReadStream(filePath).pipe(res);
	} catch (error) {
		if (error.code !== 'ENOENT') {
			logService.error(error);
			console.error(error.toString());
		} else {
			console.error(`File not found: ${filePath}`);
		}

		res.writeHead(404, { 'Content-Type': 'text/plain' });
		return void res.end('Not found');
	}
}

const APP_ROOT = dirname(FileAccess.asFileUri('').fsPath);

const STATIC_PATH = `/static`;
const CALLBACK_PATH = `/callback`;
const WEB_EXTENSION_PATH = `/web-extension-resource`;

export class WebClientServer {

	private readonly _webExtensionResourceUrlTemplate: URI | undefined;

	constructor(
		private readonly _connectionToken: ServerConnectionToken,
		private readonly _basePath: string,
		private readonly _productPath: string,
		@IServerEnvironmentService private readonly _environmentService: IServerEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IRequestService private readonly _requestService: IRequestService,
		@IProductService private readonly _productService: IProductService,
		@ICSSDevelopmentService private readonly _cssDevService: ICSSDevelopmentService
	) {
		this._webExtensionResourceUrlTemplate = this._productService.extensionsGallery?.resourceUrlTemplate ? URI.parse(this._productService.extensionsGallery.resourceUrlTemplate) : undefined;
	}

	/**
	 * Handle web resources (i.e. only needed by the web client).
	 * **NOTE**: This method is only invoked when the server has web bits.
	 * **NOTE**: This method is only invoked after the connection token has been validated.
	 * @param parsedUrl The URL to handle, including base and product path
	 * @param pathname The pathname of the URL, without base and product path
	 */
	async handle(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery, pathname: string): Promise<void> {
		try {
			if (pathname.startsWith(STATIC_PATH) && pathname.charCodeAt(STATIC_PATH.length) === CharCode.Slash) {
				return this._handleStatic(req, res, pathname.substring(STATIC_PATH.length));
			}
			if (pathname === '/') {
				return this._handleRoot(req, res, parsedUrl);
			}
			if (pathname === CALLBACK_PATH) {
				// callback support
				return this._handleCallback(res);
			}
			if (pathname.startsWith(WEB_EXTENSION_PATH) && pathname.charCodeAt(WEB_EXTENSION_PATH.length) === CharCode.Slash) {
				// extension resource support
				return this._handleWebExtensionResource(req, res, pathname.substring(WEB_EXTENSION_PATH.length));
			}

			return serveError(req, res, 404, 'Not found.');
		} catch (error) {
			this._logService.error(error);
			console.error(error.toString());

			return serveError(req, res, 500, 'Internal Server Error.');
		}
	}
	/**
	 * Handle HTTP requests for /static/*
	 * @param resourcePath The path after /static/
	 */
	private async _handleStatic(req: http.IncomingMessage, res: http.ServerResponse, resourcePath: string): Promise<void> {
		const headers: Record<string, string> = Object.create(null);

		// Strip the this._staticRoute from the path
		const normalizedPathname = decodeURIComponent(resourcePath); // support paths that are uri-encoded (e.g. spaces => %20)

		const filePath = join(APP_ROOT, normalizedPathname); // join also normalizes the path
		if (!isEqualOrParent(filePath, APP_ROOT, !isLinux)) {
			return serveError(req, res, 400, `Bad request.`);
		}

		return serveFile(filePath, this._environmentService.isBuilt ? CacheControl.NO_EXPIRY : CacheControl.ETAG, this._logService, req, res, headers);
	}

	private _getResourceURLTemplateAuthority(uri: URI): string | undefined {
		const index = uri.authority.indexOf('.');
		return index !== -1 ? uri.authority.substring(index + 1) : undefined;
	}

	/**
	 * Handle extension resources
	 * @param resourcePath The path after /web-extension-resource/
	 */
	private async _handleWebExtensionResource(req: http.IncomingMessage, res: http.ServerResponse, resourcePath: string): Promise<void> {
		if (!this._webExtensionResourceUrlTemplate) {
			return serveError(req, res, 500, 'No extension gallery service configured.');
		}

		const normalizedPathname = decodeURIComponent(resourcePath); // support paths that are uri-encoded (e.g. spaces => %20)
		const path = normalize(normalizedPathname);
		const uri = URI.parse(path).with({
			scheme: this._webExtensionResourceUrlTemplate.scheme,
			authority: path.substring(0, path.indexOf('/')),
			path: path.substring(path.indexOf('/') + 1)
		});

		if (this._getResourceURLTemplateAuthority(this._webExtensionResourceUrlTemplate) !== this._getResourceURLTemplateAuthority(uri)) {
			return serveError(req, res, 403, 'Request Forbidden');
		}

		const headers: IHeaders = {};
		const setRequestHeader = (header: string) => {
			const value = req.headers[header];
			if (value && (isString(value) || value[0])) {
				headers[header] = isString(value) ? value : value[0];
			} else if (header !== header.toLowerCase()) {
				setRequestHeader(header.toLowerCase());
			}
		};
		setRequestHeader('X-Client-Name');
		setRequestHeader('X-Client-Version');
		setRequestHeader('X-Machine-Id');
		setRequestHeader('X-Client-Commit');

		const context = await this._requestService.request({
			type: 'GET',
			url: uri.toString(true),
			headers
		}, CancellationToken.None);

		const status = context.res.statusCode || 500;
		if (status !== 200) {
			let text: string | null = null;
			try {
				text = await asTextOrError(context);
			} catch (error) {/* Ignore */ }
			return serveError(req, res, status, text || `Request failed with status ${status}`);
		}

		const responseHeaders: Record<string, string | string[]> = Object.create(null);
		const setResponseHeader = (header: string) => {
			const value = context.res.headers[header];
			if (value) {
				responseHeaders[header] = value;
			} else if (header !== header.toLowerCase()) {
				setResponseHeader(header.toLowerCase());
			}
		};
		setResponseHeader('Cache-Control');
		setResponseHeader('Content-Type');
		res.writeHead(200, responseHeaders);
		const buffer = await streamToBuffer(context.stream);
		return void res.end(buffer.buffer);
	}

	/**
	 * Handle HTTP requests for /
	 */
	private async _handleRoot(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.UrlWithParsedQuery): Promise<void> {

		const getFirstHeader = (headerName: string) => {
			const val = req.headers[headerName];
			return Array.isArray(val) ? val[0] : val;
		};

		// Prefix routes with basePath for clients
		const rootBase = relativeRoot(getOriginalUrl(req))
		const vscodeBase = relativePath(getOriginalUrl(req))
		const basePath = vscodeBase || getFirstHeader('x-forwarded-prefix') || this._basePath;

		const queryConnectionToken = parsedUrl.query[connectionTokenQueryName];
		if (typeof queryConnectionToken === 'string') {
			// We got a connection token as a query parameter.
			// We want to have a clean URL, so we strip it
			const responseHeaders: Record<string, string> = Object.create(null);
			responseHeaders['Set-Cookie'] = cookie.serialize(
				connectionTokenCookieName,
				queryConnectionToken,
				{
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 /* 1 week */
				}
			);

			const newQuery = Object.create(null);
			for (const key in parsedUrl.query) {
				if (key !== connectionTokenQueryName) {
					newQuery[key] = parsedUrl.query[key];
				}
			}
			const newLocation = url.format({ pathname: basePath, query: newQuery });
			responseHeaders['Location'] = newLocation;

			res.writeHead(302, responseHeaders);
			return void res.end();
		}

		const replacePort = (host: string, port: string) => {
			const index = host?.indexOf(':');
			if (index !== -1) {
				host = host?.substring(0, index);
			}
			host += `:${port}`;
			return host;
		};

		const useTestResolver = (!this._environmentService.isBuilt && this._environmentService.args['use-test-resolver']);
		// For now we are getting the remote authority from the client to avoid
		// needing specific configuration for reverse proxies to work.  Set this to
		// something invalid to make sure we catch code that is using this value
		// from the backend when it should not.
		let remoteAuthority = (
			useTestResolver
				? 'test+test'
				: 'remote'
		);
		if (!remoteAuthority) {
			return serveError(req, res, 400, `Bad request.`);
		}
		const forwardedPort = getFirstHeader('x-forwarded-port');
		if (forwardedPort) {
			remoteAuthority = replacePort(remoteAuthority, forwardedPort);
		}

		function asJSON(value: unknown): string {
			return JSON.stringify(value).replace(/"/g, '&quot;');
		}

		let _wrapWebWorkerExtHostInIframe: undefined | false = undefined;
		if (this._environmentService.args['enable-smoke-test-driver']) {
			// integration tests run at a time when the built output is not yet published to the CDN
			// so we must disable the iframe wrapping because the iframe URL will give a 404
			_wrapWebWorkerExtHostInIframe = false;
		}

		if (this._logService.getLevel() === LogLevel.Trace) {
			['x-original-host', 'x-forwarded-host', 'x-forwarded-port', 'host'].forEach(header => {
				const value = getFirstHeader(header);
				if (value) {
					this._logService.trace(`[WebClientServer] ${header}: ${value}`);
				}
			});
			this._logService.trace(`[WebClientServer] Request URL: ${req.url}, basePath: ${basePath}, remoteAuthority: ${remoteAuthority}`);
		}

		const staticRoute = posix.join(basePath, this._productPath, STATIC_PATH);
		const callbackRoute = posix.join(basePath, this._productPath, CALLBACK_PATH);

		const resolveWorkspaceURI = (defaultLocation?: string) => defaultLocation && URI.file(path.resolve(defaultLocation)).with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority });

		const filePath = FileAccess.asFileUri(`vs/code/browser/workbench/workbench${this._environmentService.isBuilt ? '' : '-dev'}.html`).fsPath;
		const authSessionInfo = !this._environmentService.isBuilt && this._environmentService.args['github-auth'] ? {
			id: generateUuid(),
			providerId: 'github',
			accessToken: this._environmentService.args['github-auth'],
			scopes: [['user:email'], ['repo']]
		} : undefined;

		const linkProtectionTrustedDomains: string[] = [];
		if (this._environmentService.args['link-protection-trusted-domains']) {
			linkProtectionTrustedDomains.push(...this._environmentService.args['link-protection-trusted-domains']);
		}
		if (this._productService.linkProtectionTrustedDomains) {
			linkProtectionTrustedDomains.push(...this._productService.linkProtectionTrustedDomains);
		}

		const productConfiguration: Partial<Mutable<IProductConfiguration>> = {
			codeServerVersion: this._productService.codeServerVersion,
			rootEndpoint: rootBase,
			updateEndpoint: !this._environmentService.args['disable-update-check'] ? rootBase + '/update/check' : undefined,
			logoutEndpoint: this._environmentService.args['auth'] && this._environmentService.args['auth'] !== "none" ? rootBase + '/logout' : undefined,
			proxyEndpointTemplate: process.env.VSCODE_PROXY_URI ?? rootBase + '/proxy/{{port}}/',
			serviceWorker: {
				scope: vscodeBase + '/',
				path: rootBase + '/_static/out/browser/serviceWorker.js',
			},
			enableTelemetry: this._productService.enableTelemetry,
			telemetryEndpoint: this._productService.telemetryEndpoint,
			embedderIdentifier: 'server-distro',
			extensionsGallery: this._productService.extensionsGallery,
			linkProtectionTrustedDomains,
			newtonboxQuestion: process.env.NEWTONBOX_QUESTION || '',
		};

		const proposedApi = this._environmentService.args['enable-proposed-api'];
		if (proposedApi?.length) {
			productConfiguration.extensionsEnabledWithApiProposalVersion ??= [];
			productConfiguration.extensionsEnabledWithApiProposalVersion.push(...proposedApi);
		}

		if (!this._environmentService.isBuilt) {
			try {
				const productOverrides = JSON.parse((await promises.readFile(join(APP_ROOT, 'product.overrides.json'))).toString());
				Object.assign(productConfiguration, productOverrides);
			} catch (err) {/* Ignore Error */ }
		}

		const workbenchWebConfiguration = {
			remoteAuthority,
			serverBasePath: basePath,
			webviewEndpoint: staticRoute + '/out/vs/workbench/contrib/webview/browser/pre',
			userDataPath: this._environmentService.userDataPath,
			isEnabledFileDownloads: !this._environmentService.args['disable-file-downloads'],
			isEnabledFileUploads: !this._environmentService.args['disable-file-uploads'],
			isEnabledCoderGettingStarted: !this._environmentService.args['disable-getting-started-override'],
			_wrapWebWorkerExtHostInIframe,
			developmentOptions: { enableSmokeTestDriver: this._environmentService.args['enable-smoke-test-driver'] ? true : undefined, logLevel: this._logService.getLevel() },
			settingsSyncOptions: !this._environmentService.isBuilt && this._environmentService.args['enable-sync'] ? { enabled: true } : undefined,
			enableWorkspaceTrust: !this._environmentService.args['disable-workspace-trust'],
			folderUri: resolveWorkspaceURI(this._environmentService.args['default-folder']),
			workspaceUri: resolveWorkspaceURI(this._environmentService.args['default-workspace']),
			productConfiguration,
			callbackRoute: callbackRoute
		};

		const cookies = cookie.parse(req.headers.cookie || '');
		const locale = this._environmentService.args.locale || await getLocaleFromConfig(this._environmentService.argvResource.fsPath) || cookies['vscode.nls.locale'] || req.headers['accept-language']?.split(',')[0]?.toLowerCase() || 'en';
		let WORKBENCH_NLS_BASE_URL: string | undefined;
		let WORKBENCH_NLS_URL: string;
		if (!locale.startsWith('en') && this._productService.nlsCoreBaseUrl) {
			WORKBENCH_NLS_BASE_URL = this._productService.nlsCoreBaseUrl;
			WORKBENCH_NLS_URL = `${WORKBENCH_NLS_BASE_URL}${this._productService.commit}/${this._productService.version}/${locale}/nls.messages.js`;
		} else {
			try {
				const nlsFile = await getBrowserNLSConfiguration(locale, this._environmentService.userDataPath);
				WORKBENCH_NLS_URL = nlsFile
					? `${vscodeBase}/vscode-remote-resource?path=${encodeURIComponent(nlsFile)}`
					: '';
			} catch (error) {
				console.error("Failed to generate translations", error);
				WORKBENCH_NLS_URL = '';
			}
		}

		const values: { [key: string]: string } = {
			WORKBENCH_WEB_CONFIGURATION: asJSON(workbenchWebConfiguration),
			WORKBENCH_AUTH_SESSION: authSessionInfo ? asJSON(authSessionInfo) : '',
			WORKBENCH_WEB_BASE_URL: staticRoute,
			WORKBENCH_NLS_URL,
			WORKBENCH_NLS_FALLBACK_URL: `${staticRoute}/out/nls.messages.js`,
			BASE: rootBase,
			VS_BASE: basePath,
		};

		// DEV ---------------------------------------------------------------------------------------
		// DEV: This is for development and enables loading CSS via import-statements via import-maps.
		// DEV: The server needs to send along all CSS modules so that the client can construct the
		// DEV: import-map.
		// DEV ---------------------------------------------------------------------------------------
		if (this._cssDevService.isEnabled) {
			const cssModules = await this._cssDevService.getCssModules();
			values['WORKBENCH_DEV_CSS_MODULES'] = JSON.stringify(cssModules);
		}

		if (useTestResolver) {
			const bundledExtensions: { extensionPath: string; packageJSON: IExtensionManifest }[] = [];
			for (const extensionPath of ['vscode-test-resolver', 'github-authentication']) {
				const packageJSON = JSON.parse((await promises.readFile(FileAccess.asFileUri(`${builtinExtensionsPath}/${extensionPath}/package.json`).fsPath)).toString());
				bundledExtensions.push({ extensionPath, packageJSON });
			}
			values['WORKBENCH_BUILTIN_EXTENSIONS'] = asJSON(bundledExtensions);
		}

		let data;
		try {
			const workbenchTemplate = (await promises.readFile(filePath)).toString();
			data = workbenchTemplate.replace(/\{\{([^}]+)\}\}/g, (_, key) => values[key] ?? 'undefined');
		} catch (e) {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return void res.end('Not found');
		}

		const webWorkerExtensionHostIframeScriptSHA = 'sha256-2Q+j4hfT09+1+imS46J2YlkCtHWQt0/BE79PXjJ0ZJ8=';

		const cspDirectives = [
			'default-src \'self\';',
			'img-src \'self\' https: data: blob:;',
			'media-src \'self\';',
			`script-src 'self' 'unsafe-eval' ${WORKBENCH_NLS_BASE_URL ?? ''} blob: 'nonce-1nline-m4p' ${this._getScriptCspHashes(data).join(' ')} '${webWorkerExtensionHostIframeScriptSHA}' 'sha256-/r7rqQ+yrxt57sxLuQ6AMYcy/lUpvAIzHjIJt/OeLWU=' ${useTestResolver ? '' : ``};`,  // the sha is the same as in src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html
			'child-src \'self\';',
			`frame-src 'self' https://*.vscode-cdn.net data:;`,
			'worker-src \'self\' data: blob:;',
			'style-src \'self\' \'unsafe-inline\';',
			'connect-src \'self\' ws: wss: https:;',
			'font-src \'self\' blob:;',
			'manifest-src \'self\';'
		].join(' ');

		const headers: http.OutgoingHttpHeaders = {
			'Content-Type': 'text/html',
			'Content-Security-Policy': cspDirectives
		};
		if (this._connectionToken.type !== ServerConnectionTokenType.None) {
			// At this point we know the client has a valid cookie
			// and we want to set it prolong it to ensure that this
			// client is valid for another 1 week at least
			headers['Set-Cookie'] = cookie.serialize(
				connectionTokenCookieName,
				this._connectionToken.value,
				{
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 /* 1 week */
				}
			);
		}

		res.writeHead(200, headers);
		return void res.end(data);
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
		const filePath = FileAccess.asFileUri('vs/code/browser/workbench/callback.html').fsPath;
		const data = (await promises.readFile(filePath)).toString();
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
		return void res.end(data);
	}
}

/**
 * Remove extra slashes in a URL.
 *
 * This is meant to fill the job of `path.join` so you can concatenate paths and
 * then normalize out any extra slashes.
 *
 * If you are using `path.join` you do not need this but note that `path` is for
 * file system paths, not URLs.
 */
export const normalizeUrlPath = (url: string, keepTrailing = false): string => {
	return url.replace(/\/\/+/g, "/").replace(/\/+$/, keepTrailing ? "/" : "")
}

/**
 * Get the relative path that will get us to the root of the page. For each
 * slash we need to go up a directory.  Will not have a trailing slash.
 *
 * For example:
 *
 * / => .
 * /foo => .
 * /foo/ => ./..
 * /foo/bar => ./..
 * /foo/bar/ => ./../..
 *
 * All paths must be relative in order to work behind a reverse proxy since we
 * we do not know the base path.  Anything that needs to be absolute (for
 * example cookies) must get the base path from the frontend.
 *
 * All relative paths must be prefixed with the relative root to ensure they
 * work no matter the depth at which they happen to appear.
 *
 * For Express `req.originalUrl` should be used as they remove the base from the
 * standard `url` property making it impossible to get the true depth.
 */
export const relativeRoot = (originalUrl: string): string => {
	const depth = (originalUrl.split("?", 1)[0].match(/\//g) || []).length
	return normalizeUrlPath("./" + (depth > 1 ? "../".repeat(depth - 1) : ""))
}

/**
 * Get the relative path to the current resource.
 *
 * For example:
 *
 * / => .
 * /foo => ./foo
 * /foo/ => .
 * /foo/bar => ./bar
 * /foo/bar/ => .
 */
export const relativePath = (originalUrl: string): string => {
	const parts = originalUrl.split("?", 1)[0].split("/")
	return normalizeUrlPath("./" + parts[parts.length - 1])
}

/**
 * code-server serves Code using Express.  Express removes the base from the url
 * and puts the original in `originalUrl` so we must use this to get the correct
 * depth.  Code is not aware it is behind Express so the types do not match.  We
 * may want to continue moving code into Code and eventually remove the Express
 * wrapper or move the web server back into code-server.
 */
export const getOriginalUrl = (req: http.IncomingMessage): string => {
	return (req as any).originalUrl || req.url
}
