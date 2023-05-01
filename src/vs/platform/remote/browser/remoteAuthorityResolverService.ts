/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { RemoteAuthorities } from 'vs/base/common/network';
import * as performance from 'vs/base/common/performance';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRemoteAuthorityResolverService, IRemoteConnectionData, ResolvedAuthority, ResolverResult, getRemoteAuthorityPrefix } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { getRemoteServerRootPath, parseAuthorityWithOptionalPort } from 'vs/platform/remote/common/remoteHosts';

export class RemoteAuthorityResolverService extends Disposable implements IRemoteAuthorityResolverService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionData = this._register(new Emitter<void>());
	public readonly onDidChangeConnectionData = this._onDidChangeConnectionData.event;

	private readonly _promiseCache = new Map<string, Promise<ResolverResult>>();
	private readonly _cache = new Map<string, ResolverResult>();
	private readonly _connectionToken: Promise<string> | string | undefined;
	private readonly _connectionTokens: Map<string, string>;

	constructor(
		connectionToken: Promise<string> | string | undefined,
		resourceUriProvider: ((uri: URI) => URI) | undefined,
		@IProductService productService: IProductService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._connectionToken = connectionToken;
		this._connectionTokens = new Map<string, string>();
		if (resourceUriProvider) {
			RemoteAuthorities.setDelegate(resourceUriProvider);
		}
		RemoteAuthorities.setServerRootPath(getRemoteServerRootPath(productService));
	}

	async resolveAuthority(authority: string): Promise<ResolverResult> {
		let result = this._promiseCache.get(authority);
		if (!result) {
			result = this._doResolveAuthority(authority);
			this._promiseCache.set(authority, result);
		}
		return result;
	}

	async getCanonicalURI(uri: URI): Promise<URI> {
		return uri;
	}

	getConnectionData(authority: string): IRemoteConnectionData | null {
		if (!this._cache.has(authority)) {
			return null;
		}
		const resolverResult = this._cache.get(authority)!;
		const connectionToken = this._connectionTokens.get(authority) || resolverResult.authority.connectionToken;
		return {
			host: resolverResult.authority.host,
			port: resolverResult.authority.port,
			connectionToken: connectionToken
		};
	}

	private async _doResolveAuthority(authority: string): Promise<ResolverResult> {
		const authorityPrefix = getRemoteAuthorityPrefix(authority);
		const sw = StopWatch.create(false);
		this._logService.info(`Resolving connection token (${authorityPrefix})...`);
		performance.mark(`code/willResolveConnectionToken/${authorityPrefix}`);
		const connectionToken = await Promise.resolve(this._connectionTokens.get(authority) || this._connectionToken);
		performance.mark(`code/didResolveConnectionToken/${authorityPrefix}`);
		this._logService.info(`Resolved connection token (${authorityPrefix}) after ${sw.elapsed()} ms`);
		const defaultPort = (/^https:/.test(window.location.href) ? 443 : 80);
		const { host, port } = parseAuthorityWithOptionalPort(authority, defaultPort);
		const result: ResolverResult = { authority: { authority, host: host, port: port, connectionToken } };
		RemoteAuthorities.set(authority, result.authority.host, result.authority.port);
		this._cache.set(authority, result);
		this._onDidChangeConnectionData.fire();
		return result;
	}

	_clearResolvedAuthority(authority: string): void {
	}

	_setResolvedAuthority(resolvedAuthority: ResolvedAuthority) {
	}

	_setResolvedAuthorityError(authority: string, err: any): void {
	}

	_setAuthorityConnectionToken(authority: string, connectionToken: string): void {
		this._connectionTokens.set(authority, connectionToken);
		RemoteAuthorities.setConnectionToken(authority, connectionToken);
		this._onDidChangeConnectionData.fire();
	}

	_setCanonicalURIProvider(provider: (uri: URI) => Promise<URI>): void {
	}
}
