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

	setAddress(address: IAddress): void {
		this._address = address;
		if (this._pending) {
			this._pending.complete(address);
			this._pending = null;
		}
	}
}

class ProxyEntry {
	readonly addressProvider = new AddressProvider();
	proxy: TunnelProxy | undefined;
	startPromise: Promise<ITunnelProxyInfo> | undefined;
	refCount = 0;
}

export class SharedProcessTunnelProxyService extends Disposable implements ISharedProcessTunnelProxyService {
	declare readonly _serviceBrand: undefined;

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
		super.dispose();
	}

	async start(authority: string): Promise<ITunnelProxyInfo> {
		let entry = this._entries.get(authority);
		if (!entry) {
			entry = new ProxyEntry();
			this._entries.set(authority, entry);
		}

		entry.refCount++;

		if (entry.startPromise) {
			return entry.startPromise;
		}

		entry.startPromise = this._doStart(entry);
		try {
			return await entry.startPromise;
		} catch (err) {
			// Roll back on failure so the next caller can retry
			entry.refCount--;
			if (entry.refCount === 0) {
				this._entries.delete(authority);
			}
			throw err;
		}
	}

	private async _doStart(entry: ProxyEntry): Promise<ITunnelProxyInfo> {
		const options: IConnectionOptions = {
			commit: this._productService.commit,
			quality: this._productService.quality,
			addressProvider: entry.addressProvider,
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

	async setAddress(authority: string, address: IAddress): Promise<void> {
		this._entries.get(authority)?.addressProvider.setAddress(address);
	}

	async stop(authority: string): Promise<void> {
		const entry = this._entries.get(authority);
		if (!entry) {
			return;
		}
		if (entry.refCount > 0) {
			entry.refCount--;
		}
		if (entry.refCount === 0) {
			entry.proxy?.dispose();
			this._entries.delete(authority);
		}
	}
}
