/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IAddress, IAddressProvider, IConnectionOptions, connectRemoteAgentTunnel } from '../../remote/common/remoteAgentConnection.js';
import { IRemoteSocketFactoryService } from '../../remote/common/remoteSocketFactoryService.js';
import { ISignService } from '../../sign/common/sign.js';
import { ISharedProcessTunnelProxyService, ITunnelProxyInfo } from '../common/sharedProcessTunnelProxyService.js';
import { SocksProxy } from './socksProxy.js';

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
	constructor(readonly authority: string) { }
	readonly addressProvider = new AddressProvider();
	proxy: SocksProxy | undefined;
	startPromise: Promise<ITunnelProxyInfo> | undefined;
	refCount = 0;
}

export class SharedProcessTunnelProxyService extends Disposable implements ISharedProcessTunnelProxyService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new Map<string, ProxyEntry>();
	private readonly _onDidChangeActiveConnections = this._register(new Emitter<string>());
	readonly onDidChangeActiveConnections: Event<string> = this._onDidChangeActiveConnections.event;

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
			entry = new ProxyEntry(authority);
			this._entries.set(authority, entry);
		}

		entry.refCount++;

		if (!entry.startPromise) {
			entry.startPromise = this._doStart(entry);
		}

		// All callers — including concurrent ones that join an existing
		// startPromise — must roll back their refCount on failure.
		try {
			return await entry.startPromise;
		} catch (err) {
			entry.refCount--;
			if (entry.refCount === 0) {
				entry.startPromise = undefined;
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

		const proxy = new SocksProxy(
			(host, port) => connectRemoteAgentTunnel(options, host, port),
			this._logService,
		);
		const localPort = await proxy.start();
		entry.proxy = proxy;

		// Forward active connection changes so consumers can poll the state
		proxy.onDidChangeActiveConnections(() => {
			this._onDidChangeActiveConnections.fire(entry.authority);
		});

		return {
			proxyRules: `socks5://127.0.0.1:${localPort}`,
			port: localPort,
		};
	}

	async setAddress(authority: string, address: IAddress): Promise<void> {
		this._entries.get(authority)?.addressProvider.setAddress(address);
	}

	async updateAllowlist(authority: string, destinations: ReadonlyArray<{ host: string; port: number }>): Promise<void> {
		this._entries.get(authority)?.proxy?.updateAllowlist(destinations);
	}

	async getActiveTunneledHosts(authority: string): Promise<string[]> {
		const proxy = this._entries.get(authority)?.proxy;
		return proxy ? [...proxy.activeTunneledHosts] : [];
	}

	async getActiveDirectHosts(authority: string): Promise<string[]> {
		const proxy = this._entries.get(authority)?.proxy;
		return proxy ? [...proxy.activeDirectHosts] : [];
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
