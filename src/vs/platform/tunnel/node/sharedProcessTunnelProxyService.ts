/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IAddress, IAddressProvider, IConnectionOptions, connectRemoteAgentTunnel } from '../../remote/common/remoteAgentConnection.js';
import { IRemoteSocketFactoryService } from '../../remote/common/remoteSocketFactoryService.js';
import { ISignService } from '../../sign/common/sign.js';
import { ISharedProcessTunnelProxyService, ITunnelProxyInfo } from '../common/sharedProcessTunnelProxyService.js';
import { TunnelProxy } from './tunnelProxy.js';

class AddressProvider implements IAddressProvider {
	private _address: IAddress | null = null;
	private _pending: DeferredPromise<IAddress> | null = null;

	async getAddress(): Promise<IAddress> {
		if (this._address) {
			return this._address;
		}
		if (!this._pending) {
			this._pending = new DeferredPromise<IAddress>();
		}
		return this._pending.p;
	}

	/**
	 * @returns `true` when this replaces a previously-known address with
	 * a different endpoint (a genuine change consumers must react to);
	 * `false` for the initial address or a no-op repeat.
	 */
	setAddress(address: IAddress): boolean {
		const previous = this._address;
		this._address = address;
		if (this._pending) {
			this._pending.complete(address);
			this._pending = null;
		}
		return previous !== null && !addressesEqual(previous, address);
	}
}

function addressesEqual(a: IAddress, b: IAddress): boolean {
	return a.connectionToken === b.connectionToken
		&& a.connectTo.toString() === b.connectTo.toString();
}

class ProxyEntry {
	proxy: TunnelProxy | undefined;
	startPromise: Promise<ITunnelProxyInfo> | undefined;
	refCount = 0;
}

export class SharedProcessTunnelProxyService extends Disposable implements ISharedProcessTunnelProxyService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Address providers are long-lived per id. They survive across
	 * start/stop cycles so that an address pushed by the workbench
	 * before the first {@link start} (or between a {@link stop} and the
	 * next {@link start}) is preserved and used as soon as the proxy
	 * reconnects.
	 */
	private readonly _addressProviders = new Map<string, AddressProvider>();
	private readonly _entries = new Map<string, ProxyEntry>();

	constructor(
		@IRemoteSocketFactoryService private readonly _remoteSocketFactoryService: IRemoteSocketFactoryService,
		@ILogService private readonly _logService: ILogService,
		@ISignService private readonly _signService: ISignService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();
	}

	override dispose(): void {
		for (const entry of this._entries.values()) {
			entry.proxy?.dispose();
		}
		this._entries.clear();
		this._addressProviders.clear();
		super.dispose();
	}

	async start(id: string): Promise<ITunnelProxyInfo> {
		let entry = this._entries.get(id);
		if (!entry) {
			entry = new ProxyEntry();
			this._entries.set(id, entry);
		}

		entry.refCount++;

		if (!entry.startPromise) {
			entry.startPromise = this._doStart(id, entry);
		}

		// All callers — including concurrent ones that join an existing
		// startPromise — must roll back their refCount on failure.
		try {
			return await entry.startPromise;
		} catch (err) {
			entry.refCount--;
			if (entry.refCount === 0) {
				entry.startPromise = undefined;
				this._entries.delete(id);
			}
			throw err;
		}
	}

	private _getOrCreateAddressProvider(id: string): AddressProvider {
		let provider = this._addressProviders.get(id);
		if (!provider) {
			provider = new AddressProvider();
			this._addressProviders.set(id, provider);
		}
		return provider;
	}

	private async _doStart(id: string, entry: ProxyEntry): Promise<ITunnelProxyInfo> {
		const options: IConnectionOptions = {
			commit: this._productService.commit,
			quality: this._productService.quality,
			addressProvider: this._getOrCreateAddressProvider(id),
			remoteSocketFactoryService: this._remoteSocketFactoryService,
			signService: this._signService,
			logService: this._logService,
			ipcLogger: null,
		};

		const proxy = new TunnelProxy(
			(host, port) => connectRemoteAgentTunnel(options, host, port),
			this._logService,
		);
		const result = await proxy.start();
		entry.proxy = proxy;

		return result;
	}

	async setAddress(id: string, address: IAddress): Promise<void> {
		const changed = this._getOrCreateAddressProvider(id).setAddress(address);
		if (changed) {
			// The upstream tunnel endpoint moved. Drop pooled sockets that
			// still dial the previous endpoint so they don't get reset en
			// masse once it goes away.
			this._entries.get(id)?.proxy?.drainConnectionPool();
		}
	}

	async stop(id: string): Promise<void> {
		const entry = this._entries.get(id);
		if (!entry) {
			return;
		}
		if (entry.refCount > 0) {
			entry.refCount--;
		}
		if (entry.refCount === 0) {
			this._entries.delete(id);
			if (entry.startPromise) {
				// Proxy may still be starting; dispose whichever proxy
				// the in-flight start produces so we don't leak a server
				// that comes up after the last reference is gone.
				void entry.startPromise.then(
					() => entry.proxy?.dispose(),
					() => { /* start already failed; nothing to dispose */ },
				);
			} else {
				entry.proxy?.dispose();
			}
		}
	}
}
