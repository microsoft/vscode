/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as errors from 'vs/base/common/errors';
import * as platform from 'vs/base/common/platform';
import { equalsIgnoreCase, startsWithIgnoreCase } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import * as paths from 'vs/base/common/path';

export namespace Schemas {

	/**
	 * A schema that is used for models that exist in memory
	 * only and that have no correspondence on a server or such.
	 */
	export const inMemory = 'inmemory';

	/**
	 * A schema that is used for setting files
	 */
	export const vscode = 'vscode';

	/**
	 * A schema that is used for internal private files
	 */
	export const internal = 'private';

	/**
	 * A walk-through document.
	 */
	export const walkThrough = 'walkThrough';

	/**
	 * An embedded code snippet.
	 */
	export const walkThroughSnippet = 'walkThroughSnippet';

	export const http = 'http';

	export const https = 'https';

	export const file = 'file';

	export const mailto = 'mailto';

	export const untitled = 'untitled';

	export const data = 'data';

	export const command = 'command';

	export const vscodeRemote = 'vscode-remote';

	export const vscodeRemoteResource = 'vscode-remote-resource';

	export const vscodeManagedRemoteResource = 'vscode-managed-remote-resource';

	export const vscodeUserData = 'vscode-userdata';

	export const vscodeCustomEditor = 'vscode-custom-editor';

	export const vscodeNotebookCell = 'vscode-notebook-cell';
	export const vscodeNotebookCellMetadata = 'vscode-notebook-cell-metadata';
	export const vscodeNotebookCellOutput = 'vscode-notebook-cell-output';
	export const vscodeInteractiveInput = 'vscode-interactive-input';

	export const vscodeSettings = 'vscode-settings';

	export const vscodeWorkspaceTrust = 'vscode-workspace-trust';

	export const vscodeTerminal = 'vscode-terminal';

	/** Scheme used for code blocks in chat. */
	export const vscodeChatCodeBlock = 'vscode-chat-code-block';
	/** Scheme used for the chat input editor. */
	export const vscodeChatSesssion = 'vscode-chat-editor';

	/**
	 * Scheme used internally for webviews that aren't linked to a resource (i.e. not custom editors)
	 */
	export const webviewPanel = 'webview-panel';

	/**
	 * Scheme used for loading the wrapper html and script in webviews.
	 */
	export const vscodeWebview = 'vscode-webview';

	/**
	 * Scheme used for extension pages
	 */
	export const extension = 'extension';

	/**
	 * Scheme used as a replacement of `file` scheme to load
	 * files with our custom protocol handler (desktop only).
	 */
	export const vscodeFileResource = 'vscode-file';

	/**
	 * Scheme used for temporary resources
	 */
	export const tmp = 'tmp';

	/**
	 * Scheme used vs live share
	 */
	export const vsls = 'vsls';

	/**
	 * Scheme used for the Source Control commit input's text document
	 */
	export const vscodeSourceControl = 'vscode-scm';

	/**
	 * Scheme used for special rendering of settings in the release notes
	 */
	export const codeSetting = 'code-setting';
}

export function matchesScheme(target: URI | string, scheme: string): boolean {
	if (URI.isUri(target)) {
		return equalsIgnoreCase(target.scheme, scheme);
	} else {
		return startsWithIgnoreCase(target, scheme + ':');
	}
}

export function matchesSomeScheme(target: URI | string, ...schemes: string[]): boolean {
	return schemes.some(scheme => matchesScheme(target, scheme));
}

export const connectionTokenCookieName = 'vscode-tkn';
export const connectionTokenQueryName = 'tkn';

class RemoteAuthoritiesImpl {
	private readonly _hosts: { [authority: string]: string | undefined } = Object.create(null);
	private readonly _ports: { [authority: string]: number | undefined } = Object.create(null);
	private readonly _connectionTokens: { [authority: string]: string | undefined } = Object.create(null);
	private _preferredWebSchema: 'http' | 'https' = 'http';
	private _delegate: ((uri: URI) => URI) | null = null;
	private _serverRootPath: string = '/';

	setPreferredWebSchema(schema: 'http' | 'https') {
		this._preferredWebSchema = schema;
	}

	setDelegate(delegate: (uri: URI) => URI): void {
		this._delegate = delegate;
	}

	setServerRootPath(product: { quality?: string; commit?: string }, serverBasePath: string | undefined): void {
		this._serverRootPath = getServerRootPath(product, serverBasePath);
	}

	getServerRootPath(): string {
		return this._serverRootPath;
	}

	private get _remoteResourcesPath(): string {
		return paths.posix.join(this._serverRootPath, Schemas.vscodeRemoteResource);
	}

	set(authority: string, host: string, port: number): void {
		this._hosts[authority] = host;
		this._ports[authority] = port;
	}

	setConnectionToken(authority: string, connectionToken: string): void {
		this._connectionTokens[authority] = connectionToken;
	}

	getPreferredWebSchema(): 'http' | 'https' {
		return this._preferredWebSchema;
	}

	rewrite(uri: URI): URI {
		if (this._delegate) {
			try {
				return this._delegate(uri);
			} catch (err) {
				errors.onUnexpectedError(err);
				return uri;
			}
		}
		const authority = uri.authority;
		let host = this._hosts[authority];
		if (host && host.indexOf(':') !== -1 && host.indexOf('[') === -1) {
			host = `[${host}]`;
		}
		const port = this._ports[authority];
		const connectionToken = this._connectionTokens[authority];
		let query = `path=${encodeURIComponent(uri.path)}`;
		if (typeof connectionToken === 'string') {
			query += `&${connectionTokenQueryName}=${encodeURIComponent(connectionToken)}`;
		}
		return URI.from({
			scheme: platform.isWeb ? this._preferredWebSchema : Schemas.vscodeRemoteResource,
			authority: `${host}:${port}`,
			path: this._remoteResourcesPath,
			query
		});
	}
}

export const RemoteAuthorities = new RemoteAuthoritiesImpl();

export function getServerRootPath(product: { quality?: string; commit?: string }, basePath: string | undefined): string {
	return paths.posix.join(basePath ?? '/', `${product.quality ?? 'oss'}-${product.commit ?? 'dev'}`);
}

/**
 * A string pointing to a path inside the app. It should not begin with ./ or ../
 */
export type AppResourcePath = (
	`a${string}` | `b${string}` | `c${string}` | `d${string}` | `e${string}` | `f${string}`
	| `g${string}` | `h${string}` | `i${string}` | `j${string}` | `k${string}` | `l${string}`
	| `m${string}` | `n${string}` | `o${string}` | `p${string}` | `q${string}` | `r${string}`
	| `s${string}` | `t${string}` | `u${string}` | `v${string}` | `w${string}` | `x${string}`
	| `y${string}` | `z${string}`
);

export const builtinExtensionsPath: AppResourcePath = 'vs/../../extensions';
export const nodeModulesPath: AppResourcePath = 'vs/../../node_modules';
export const nodeModulesAsarPath: AppResourcePath = 'vs/../../node_modules.asar';
export const nodeModulesAsarUnpackedPath: AppResourcePath = 'vs/../../node_modules.asar.unpacked';

export const VSCODE_AUTHORITY = 'vscode-app';

class FileAccessImpl {

	private static readonly FALLBACK_AUTHORITY = VSCODE_AUTHORITY;

	/**
	 * Returns a URI to use in contexts where the browser is responsible
	 * for loading (e.g. fetch()) or when used within the DOM.
	 *
	 * **Note:** use `dom.ts#asCSSUrl` whenever the URL is to be used in CSS context.
	 */
	asBrowserUri(resourcePath: AppResourcePath | ''): URI {
		const uri = this.toUri(resourcePath, require);
		return this.uriToBrowserUri(uri);
	}

	/**
	 * Returns a URI to use in contexts where the browser is responsible
	 * for loading (e.g. fetch()) or when used within the DOM.
	 *
	 * **Note:** use `dom.ts#asCSSUrl` whenever the URL is to be used in CSS context.
	 */
	uriToBrowserUri(uri: URI): URI {
		// Handle remote URIs via `RemoteAuthorities`
		if (uri.scheme === Schemas.vscodeRemote) {
			return RemoteAuthorities.rewrite(uri);
		}

		// Convert to `vscode-file` resource..
		if (
			// ...only ever for `file` resources
			uri.scheme === Schemas.file &&
			(
				// ...and we run in native environments
				platform.isNative ||
				// ...or web worker extensions on desktop
				(platform.webWorkerOrigin === `${Schemas.vscodeFileResource}://${FileAccessImpl.FALLBACK_AUTHORITY}`)
			)
		) {
			return uri.with({
				scheme: Schemas.vscodeFileResource,
				// We need to provide an authority here so that it can serve
				// as origin for network and loading matters in chromium.
				// If the URI is not coming with an authority already, we
				// add our own
				authority: uri.authority || FileAccessImpl.FALLBACK_AUTHORITY,
				query: null,
				fragment: null
			});
		}

		return uri;
	}

	/**
	 * Returns the `file` URI to use in contexts where node.js
	 * is responsible for loading.
	 */
	asFileUri(resourcePath: AppResourcePath | ''): URI {
		const uri = this.toUri(resourcePath, require);
		return this.uriToFileUri(uri);
	}

	/**
	 * Returns the `file` URI to use in contexts where node.js
	 * is responsible for loading.
	 */
	uriToFileUri(uri: URI): URI {
		// Only convert the URI if it is `vscode-file:` scheme
		if (uri.scheme === Schemas.vscodeFileResource) {
			return uri.with({
				scheme: Schemas.file,
				// Only preserve the `authority` if it is different from
				// our fallback authority. This ensures we properly preserve
				// Windows UNC paths that come with their own authority.
				authority: uri.authority !== FileAccessImpl.FALLBACK_AUTHORITY ? uri.authority : null,
				query: null,
				fragment: null
			});
		}

		return uri;
	}

	private toUri(uriOrModule: URI | string, moduleIdToUrl: { toUrl(moduleId: string): string }): URI {
		if (URI.isUri(uriOrModule)) {
			return uriOrModule;
		}

		return URI.parse(moduleIdToUrl.toUrl(uriOrModule));
	}
}

export const FileAccess = new FileAccessImpl();


export namespace COI {

	const coiHeaders = new Map<'3' | '2' | '1' | string, Record<string, string>>([
		['1', { 'Cross-Origin-Opener-Policy': 'same-origin' }],
		['2', { 'Cross-Origin-Embedder-Policy': 'require-corp' }],
		['3', { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }],
	]);

	export const CoopAndCoep = Object.freeze(coiHeaders.get('3'));

	const coiSearchParamName = 'vscode-coi';

	/**
	 * Extract desired headers from `vscode-coi` invocation
	 */
	export function getHeadersFromQuery(url: string | URI | URL): Record<string, string> | undefined {
		let params: URLSearchParams | undefined;
		if (typeof url === 'string') {
			params = new URL(url).searchParams;
		} else if (url instanceof URL) {
			params = url.searchParams;
		} else if (URI.isUri(url)) {
			params = new URL(url.toString(true)).searchParams;
		}
		const value = params?.get(coiSearchParamName);
		if (!value) {
			return undefined;
		}
		return coiHeaders.get(value);
	}

	/**
	 * Add the `vscode-coi` query attribute based on wanting `COOP` and `COEP`. Will be a noop when `crossOriginIsolated`
	 * isn't enabled the current context
	 */
	export function addSearchParam(urlOrSearch: URLSearchParams | Record<string, string>, coop: boolean, coep: boolean): void {
		if (!(<any>globalThis).crossOriginIsolated) {
			// depends on the current context being COI
			return;
		}
		const value = coop && coep ? '3' : coep ? '2' : '1';
		if (urlOrSearch instanceof URLSearchParams) {
			urlOrSearch.set(coiSearchParamName, value);
		} else {
			(<Record<string, string>>urlOrSearch)[coiSearchParamName] = value;
		}
	}
}
