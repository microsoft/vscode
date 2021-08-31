/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//
import * as errors from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { RemoteAuthorities } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IRemoteAuthorityResolverService, IRemoteConnectionData, ResolvedAuthority, ResolvedOptions, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';

class PendingPromise<I, R> {
	public readonly promise: Promise<R>;
	public readonly input: I;
	public result: R | null;
	private _resolve!: (value: R) => void;
	private _reject!: (err: any) => void;

	constructor(request: I) {
		this.input = request;
		this.promise = new Promise<R>((resolve, reject) => {
			this._resolve = resolve;
			this._reject = reject;
		});
		this.result = null;
	}

	resolve(result: R): void {
		this.result = result;
		this._resolve(this.result);
	}

	reject(err: any): void {
		this._reject(err);
	}
}

export class RemoteAuthorityResolverService extends Disposable implements IRemoteAuthorityResolverService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionData = this._register(new Emitter<void>());
	public readonly onDidChangeConnectionData = this._onDidChangeConnectionData.event;

	private readonly _resolveAuthorityRequests: Map<string, PendingPromise<string, ResolverResult>>;
	private readonly _connectionTokens: Map<string, string>;
	private readonly _canonicalURIRequests: Map<string, PendingPromise<URI, URI>>;
	private _canonicalURIProvider: ((uri: URI) => Promise<URI>) | null;

	constructor() {
		super();
		this._resolveAuthorityRequests = new Map<string, PendingPromise<string, ResolverResult>>();
		this._connectionTokens = new Map<string, string>();
		this._canonicalURIRequests = new Map<string, PendingPromise<URI, URI>>();
		this._canonicalURIProvider = null;
	}

	resolveAuthority(authority: string): Promise<ResolverResult> {
		if (!this._resolveAuthorityRequests.has(authority)) {
			this._resolveAuthorityRequests.set(authority, new PendingPromise<string, ResolverResult>(authority));
		}
		return this._resolveAuthorityRequests.get(authority)!.promise;
	}

	async getCanonicalURI(uri: URI): Promise<URI> {
		const key = uri.toString();
		if (!this._canonicalURIRequests.has(key)) {
			const request = new PendingPromise<URI, URI>(uri);
			if (this._canonicalURIProvider) {
				this._canonicalURIProvider(request.input).then((uri) => request.resolve(uri), (err) => request.reject(err));
			}
			this._canonicalURIRequests.set(key, request);
		}
		return this._canonicalURIRequests.get(key)!.promise;
	}

	getConnectionData(authority: string): IRemoteConnectionData | null {
		if (!this._resolveAuthorityRequests.has(authority)) {
			return null;
		}
		const request = this._resolveAuthorityRequests.get(authority)!;
		if (!request.result) {
			return null;
		}
		const connectionToken = this._connectionTokens.get(authority);
		return {
			host: request.result.authority.host,
			port: request.result.authority.port,
			connectionToken: connectionToken
		};
	}

	_clearResolvedAuthority(authority: string): void {
		if (this._resolveAuthorityRequests.has(authority)) {
			this._resolveAuthorityRequests.get(authority)!.reject(errors.canceled());
			this._resolveAuthorityRequests.delete(authority);
		}
	}

	_setResolvedAuthority(resolvedAuthority: ResolvedAuthority, options?: ResolvedOptions): void {
		if (this._resolveAuthorityRequests.has(resolvedAuthority.authority)) {
			const request = this._resolveAuthorityRequests.get(resolvedAuthority.authority)!;
			RemoteAuthorities.set(resolvedAuthority.authority, resolvedAuthority.host, resolvedAuthority.port);
			if (resolvedAuthority.connectionToken) {
				RemoteAuthorities.setConnectionToken(resolvedAuthority.authority, resolvedAuthority.connectionToken);
			}
			request.resolve({ authority: resolvedAuthority, options });
			this._onDidChangeConnectionData.fire();
		}
	}

	_setResolvedAuthorityError(authority: string, err: any): void {
		if (this._resolveAuthorityRequests.has(authority)) {
			const request = this._resolveAuthorityRequests.get(authority)!;
			request.reject(err);
		}
	}

	_setAuthorityConnectionToken(authority: string, connectionToken: string): void {
		this._connectionTokens.set(authority, connectionToken);
		RemoteAuthorities.setConnectionToken(authority, connectionToken);
		this._onDidChangeConnectionData.fire();
	}

	_setCanonicalURIProvider(provider: (uri: URI) => Promise<URI>): void {
		this._canonicalURIProvider = provider;
		this._canonicalURIRequests.forEach((value) => {
			this._canonicalURIProvider!(value.input).then((uri) => value.resolve(uri), (err) => value.reject(err));
		});
	}
}
