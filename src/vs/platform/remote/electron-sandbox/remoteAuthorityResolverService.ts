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
import { IRemoteAuthorityResolverService, IRemoteConnectionData, MessagePassingType, ResolvedAuthority, ResolvedOptions, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { getRemoteServerRootPath } from 'vs/platform/remote/common/remoteHosts';

export class RemoteAuthorityResolverService extends Disposable implements IRemoteAuthorityResolverService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionData = this._register(new Emitter<void>());
	public readonly onDidChangeConnectionData = this._onDidChangeConnectionData.event;

	private readonly _resolveAuthorityRequests: Map<string, DeferredPromise<ResolverResult>>;
	private readonly _connectionTokens: Map<string, string>;
	private readonly _canonicalURIRequests: Map<string, DeferredPromise<URI>>;
	private _canonicalURIProvider: ((uri: URI) => Promise<URI>) | null;

	constructor(@IProductService productService: IProductService) {
		super();
		this._resolveAuthorityRequests = new Map<string, DeferredPromise<ResolverResult>>();
		this._connectionTokens = new Map<string, string>();
		this._canonicalURIRequests = new Map<string, DeferredPromise<URI>>();
		this._canonicalURIProvider = null;

		RemoteAuthorities.setServerRootPath(getRemoteServerRootPath(productService));
	}

	resolveAuthority(authority: string): Promise<ResolverResult> {
		if (!this._resolveAuthorityRequests.has(authority)) {
			this._resolveAuthorityRequests.set(authority, new DeferredPromise());
		}
		return this._resolveAuthorityRequests.get(authority)!.p;
	}

	async getCanonicalURI(uri: URI): Promise<URI> {
		const key = uri.toString();
		if (!this._canonicalURIRequests.has(key)) {
			const request = new DeferredPromise<URI>();
			this._canonicalURIProvider?.(uri).then((uri) => request.complete(uri), (err) => request.error(err));
			this._canonicalURIRequests.set(key, request);
		}
		return this._canonicalURIRequests.get(key)!.p;
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
			connectTo: request.value!.authority.messaging,
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
			if (resolvedAuthority.messaging.type === MessagePassingType.WebSocket) {
				// todo@connor4312 need to implement some kind of loopback for ext host based messaging
				RemoteAuthorities.set(resolvedAuthority.authority, resolvedAuthority.messaging.host, resolvedAuthority.messaging.port);
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
		this._canonicalURIRequests.forEach((value, key) => {
			this._canonicalURIProvider!(URI.parse(key)).then((uri) => value.complete(uri), (err) => value.error(err));
		});
	}
}
