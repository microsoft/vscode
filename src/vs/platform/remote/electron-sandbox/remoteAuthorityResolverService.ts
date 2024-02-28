/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//
import { DeferredPromise } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { RemoteAuthorities } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRemoteAuthorityResolverService, IRemoteConnectionData, RemoteConnectionType, ResolvedAuthority, ResolvedOptions, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ElectronRemoteResourceLoader } from 'vs/platform/remote/electron-sandbox/electronRemoteResourceLoader';

export class RemoteAuthorityResolverService extends Disposable implements IRemoteAuthorityResolverService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionData = this._register(new Emitter<void>());
	public readonly onDidChangeConnectionData = this._onDidChangeConnectionData.event;

	private readonly _resolveAuthorityRequests: Map<string, DeferredPromise<ResolverResult>>;
	private readonly _connectionTokens: Map<string, string>;
	private readonly _canonicalURIRequests: Map<string, { input: URI; result: DeferredPromise<URI> }>;
	private _canonicalURIProvider: ((uri: URI) => Promise<URI>) | null;

	constructor(@IProductService productService: IProductService, private readonly remoteResourceLoader: ElectronRemoteResourceLoader) {
		super();
		this._resolveAuthorityRequests = new Map<string, DeferredPromise<ResolverResult>>();
		this._connectionTokens = new Map<string, string>();
		this._canonicalURIRequests = new Map();
		this._canonicalURIProvider = null;

		RemoteAuthorities.setServerRootPath(productService, undefined); // on the desktop we don't support custom server base paths
	}

	resolveAuthority(authority: string): Promise<ResolverResult> {
		if (!this._resolveAuthorityRequests.has(authority)) {
			this._resolveAuthorityRequests.set(authority, new DeferredPromise());
		}
		return this._resolveAuthorityRequests.get(authority)!.p;
	}

	async getCanonicalURI(uri: URI): Promise<URI> {
		const key = uri.toString();
		const existing = this._canonicalURIRequests.get(key);
		if (existing) {
			return existing.result.p;
		}

		const result = new DeferredPromise<URI>();
		this._canonicalURIProvider?.(uri).then((uri) => result.complete(uri), (err) => result.error(err));
		this._canonicalURIRequests.set(key, { input: uri, result });
		return result.p;
	}

	getConnectionData(authority: string): IRemoteConnectionData | null {
		if (!this._resolveAuthorityRequests.has(authority)) {
			return null;
		}
		const request = this._resolveAuthorityRequests.get(authority)!;
		if (!request.isResolved) {
			return null;
		}
		const connectionToken = this._connectionTokens.get(authority);
		return {
			connectTo: request.value!.authority.connectTo,
			connectionToken: connectionToken
		};
	}

	_clearResolvedAuthority(authority: string): void {
		if (this._resolveAuthorityRequests.has(authority)) {
			this._resolveAuthorityRequests.get(authority)!.cancel();
			this._resolveAuthorityRequests.delete(authority);
		}
	}

	_setResolvedAuthority(resolvedAuthority: ResolvedAuthority, options?: ResolvedOptions): void {
		if (this._resolveAuthorityRequests.has(resolvedAuthority.authority)) {
			const request = this._resolveAuthorityRequests.get(resolvedAuthority.authority)!;
			if (resolvedAuthority.connectTo.type === RemoteConnectionType.WebSocket) {
				RemoteAuthorities.set(resolvedAuthority.authority, resolvedAuthority.connectTo.host, resolvedAuthority.connectTo.port);
			} else {
				RemoteAuthorities.setDelegate(this.remoteResourceLoader.getResourceUriProvider());
			}
			if (resolvedAuthority.connectionToken) {
				RemoteAuthorities.setConnectionToken(resolvedAuthority.authority, resolvedAuthority.connectionToken);
			}
			request.complete({ authority: resolvedAuthority, options });
			this._onDidChangeConnectionData.fire();
		}
	}

	_setResolvedAuthorityError(authority: string, err: any): void {
		if (this._resolveAuthorityRequests.has(authority)) {
			const request = this._resolveAuthorityRequests.get(authority)!;
			// Avoid that this error makes it to telemetry
			request.error(errors.ErrorNoTelemetry.fromError(err));
		}
	}

	_setAuthorityConnectionToken(authority: string, connectionToken: string): void {
		this._connectionTokens.set(authority, connectionToken);
		RemoteAuthorities.setConnectionToken(authority, connectionToken);
		this._onDidChangeConnectionData.fire();
	}

	_setCanonicalURIProvider(provider: (uri: URI) => Promise<URI>): void {
		this._canonicalURIProvider = provider;
		this._canonicalURIRequests.forEach(({ result, input }) => {
			this._canonicalURIProvider!(input).then((uri) => result.complete(uri), (err) => result.error(err));
		});
	}
}
