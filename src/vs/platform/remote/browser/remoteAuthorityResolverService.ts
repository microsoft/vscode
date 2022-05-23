/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { RemoteAuthorities } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRemoteAuthorityResolverService, IRemoteConnectionData, ResolvedAuthority, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { getRemoteServerRootPath } from 'vs/platform/remote/common/remoteHosts';

export class RemoteAuthorityResolverService extends Disposable implements IRemoteAuthorityResolverService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionData = this._register(new Emitter<void>());
	public readonly onDidChangeConnectionData = this._onDidChangeConnectionData.event;

	private readonly _cache: Map<string, ResolverResult>;
	private readonly _connectionToken: string | undefined;
	private readonly _connectionTokens: Map<string, string>;

	constructor(@IProductService productService: IProductService, connectionToken: string | undefined, resourceUriProvider: ((uri: URI) => URI) | undefined) {
		super();
		this._cache = new Map<string, ResolverResult>();
		this._connectionToken = connectionToken;
		this._connectionTokens = new Map<string, string>();
		if (resourceUriProvider) {
			RemoteAuthorities.setDelegate(resourceUriProvider);
		}
		RemoteAuthorities.setServerRootPath(getRemoteServerRootPath(productService));
	}

	async resolveAuthority(authority: string): Promise<ResolverResult> {
		if (!this._cache.has(authority)) {
			const result = this._doResolveAuthority(authority);
			RemoteAuthorities.set(authority, result.authority.host, result.authority.port);
			this._cache.set(authority, result);
			this._onDidChangeConnectionData.fire();
		}
		return this._cache.get(authority)!;
	}

	async getCanonicalURI(uri: URI): Promise<URI> {
		return uri;
	}

	getConnectionData(authority: string): IRemoteConnectionData | null {
		if (!this._cache.has(authority)) {
			return null;
		}
		const resolverResult = this._cache.get(authority)!;
		const connectionToken = this._connectionTokens.get(authority) || this._connectionToken;
		return {
			host: resolverResult.authority.host,
			port: resolverResult.authority.port,
			connectionToken: connectionToken
		};
	}

	private _doResolveAuthority(authority: string): ResolverResult {
		const connectionToken = this._connectionTokens.get(authority) || this._connectionToken;
		if (authority.indexOf(':') >= 0) {
			const pieces = authority.split(':');
			return { authority: { authority, host: pieces[0], port: parseInt(pieces[1], 10), connectionToken } };
		}
		const port = (/^https:/.test(window.location.href) ? 443 : 80);
		return { authority: { authority, host: authority, port: port, connectionToken } };
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
