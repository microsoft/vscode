/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from 'vs/base/browser/window';
import { DeferredPromise } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { RemoteAuthorities } from 'vs/base/common/network';
import * as performance from 'vs/base/common/performance';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRemoteAuthorityResolverService, IRemoteConnectionData, RemoteConnectionType, ResolvedAuthority, ResolvedOptions, ResolverResult, WebSocketRemoteConnection, getRemoteAuthorityPrefix } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { parseAuthorityWithOptionalPort } from 'vs/platform/remote/common/remoteHosts';

export class RemoteAuthorityResolverService extends Disposable implements IRemoteAuthorityResolverService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionData = this._register(new Emitter<void>());
	public readonly onDidChangeConnectionData = this._onDidChangeConnectionData.event;

	private readonly _resolveAuthorityRequests = new Map<string, DeferredPromise<ResolverResult>>();
	private readonly _cache = new Map<string, ResolverResult>();
	private readonly _connectionToken: Promise<string> | string | undefined;
	private readonly _connectionTokens: Map<string, string>;
	private readonly _isWorkbenchOptionsBasedResolution: boolean;

	constructor(
		isWorkbenchOptionsBasedResolution: boolean,
		connectionToken: Promise<string> | string | undefined,
		resourceUriProvider: ((uri: URI) => URI) | undefined,
		serverBasePath: string | undefined,
		@IProductService productService: IProductService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._connectionToken = connectionToken;
		this._connectionTokens = new Map<string, string>();
		this._isWorkbenchOptionsBasedResolution = isWorkbenchOptionsBasedResolution;
		if (resourceUriProvider) {
			RemoteAuthorities.setDelegate(resourceUriProvider);
		}
		RemoteAuthorities.setServerRootPath(productService, serverBasePath);
	}

	async resolveAuthority(authority: string): Promise<ResolverResult> {
		let result = this._resolveAuthorityRequests.get(authority);
		if (!result) {
			result = new DeferredPromise<ResolverResult>();
			this._resolveAuthorityRequests.set(authority, result);
			if (this._isWorkbenchOptionsBasedResolution) {
				this._doResolveAuthority(authority).then(v => result!.complete(v), (err) => result!.error(err));
			}
		}

		return result.p;
	}

	async getCanonicalURI(uri: URI): Promise<URI> {
		// todo@connor4312 make this work for web
		return uri;
	}

	getConnectionData(authority: string): IRemoteConnectionData | null {
		if (!this._cache.has(authority)) {
			return null;
		}
		const resolverResult = this._cache.get(authority)!;
		const connectionToken = this._connectionTokens.get(authority) || resolverResult.authority.connectionToken;
		return {
			connectTo: resolverResult.authority.connectTo,
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
		const defaultPort = (/^https:/.test(mainWindow.location.href) ? 443 : 80);
		const { host, port } = parseAuthorityWithOptionalPort(authority, defaultPort);
		const result: ResolverResult = { authority: { authority, connectTo: new WebSocketRemoteConnection(host, port), connectionToken } };
		RemoteAuthorities.set(authority, host, port);
		this._cache.set(authority, result);
		this._onDidChangeConnectionData.fire();
		return result;
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
			// For non-websocket types, it's expected the embedder passes a `remoteResourceProvider`
			// which is wrapped to a `IResourceUriProvider` and is not handled here.
			if (resolvedAuthority.connectTo.type === RemoteConnectionType.WebSocket) {
				RemoteAuthorities.set(resolvedAuthority.authority, resolvedAuthority.connectTo.host, resolvedAuthority.connectTo.port);
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
	}
}
