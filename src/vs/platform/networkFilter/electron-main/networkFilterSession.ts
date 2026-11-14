/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, isIP } from 'net';
import { raceTimeout } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { ISandboxNetworkRestrictions } from '../../sandbox/common/sandboxSettingsResolutionHelper.js';
import { ITunnelProxyInfo } from '../../tunnel/common/tunnelProxy.js';
import { TunnelProxy } from '../../tunnel/node/tunnelProxy.js';
import { ITunnelStream } from '../../tunnel/node/tunnelStream.js';
import { extractDomainFromUri, matchesDomainPattern } from '../common/domainMatcher.js';
import { IAgentNetworkFilterService, isFilteredNetworkScheme } from '../common/networkFilterService.js';

export interface IAgentNetworkFilterSessionOptions {
	readonly resolveProxy?: (url: string) => Promise<string>;
	/** Connects to a validated numeric address and observes cancellation. */
	readonly connect?: (address: string, port: number, signal: AbortSignal) => Promise<ITunnelStream>;
	readonly getRestrictions?: () => ISandboxNetworkRestrictions | undefined;
	readonly isRemote?: () => boolean;
}

/** Enforces address restrictions on the sockets used by an isolated Chromium session. */
export class AgentNetworkFilterSession extends Disposable {
	private static readonly CONNECTION_ATTEMPT_TIMEOUT = 5000;
	private static readonly _routingUpdates = new WeakMap<Electron.Session, Promise<void>>();
	private readonly _proxy = this._register(new MutableDisposable<TunnelProxy>());
	private _proxyInfo: ITunnelProxyInfo | undefined;
	private _tail: Promise<void> = Promise.resolve();
	private _setup: Promise<void> | undefined;
	private _revision = 0;
	private _modifiedProxy = false;
	private _restoring = false;
	private _connectionAbort = new AbortController();

	constructor(
		private readonly _session: Electron.Session,
		private readonly _options: IAgentNetworkFilterSessionOptions,
		private readonly _filter: IAgentNetworkFilterService,
		private readonly _logService: ILogService,
	) {
		super();
		this._tail = AgentNetworkFilterSession._routingUpdates.get(this._session) ?? this._tail;
		this._register(toDisposable(() => this._connectionAbort.abort()));
		this._register(this._filter.onDidChange(() => this.update()));
	}

	get proxy(): ITunnelProxyInfo | undefined {
		return this._proxy.value ? this._proxyInfo : undefined;
	}

	get isActive(): boolean {
		return this._filter.getDeniedIpAddresses(this._options.getRestrictions?.()).length > 0
			|| this._setup !== undefined || this._restoring;
	}

	async checkRequest(uri: URI): Promise<void> {
		if (!isFilteredNetworkScheme(uri)) {
			return;
		}
		await this._tail;
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		if (!this._filter.isUriAllowed(uri, this._options.getRestrictions?.())) {
			throw new Error(this._filter.formatError(uri));
		}
		if (this._filter.getDeniedIpAddresses(this._options.getRestrictions?.()).length === 0) {
			return;
		}

		const revision = this._revision;
		if (this._options.isRemote?.()) {
			throw this.unsupportedTransportError();
		}
		const proxy = await (this._options.resolveProxy ?? resolveSystemProxy)(uri.toString(true));
		if (proxy.trim() !== 'DIRECT') {
			throw this.unsupportedTransportError();
		}
		await this.resolveAllowedAddresses(uri);
		await this.ensureProxy(revision);
		if (revision !== this._revision || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	private unsupportedTransportError(): Error {
		return new Error(localize('networkFilter.unsupportedTransport', "Network address policy cannot be enforced on this proxy or remote connection. The request was blocked."));
	}

	private async resolveAllowedAddresses(uri: URI): Promise<string[]> {
		const domain = extractDomainFromUri(uri);
		if (!domain) {
			throw new Error(this._filter.formatError(uri));
		}
		const host = domain.replace(/^\[(?<address>.*)\]$/, '$<address>');
		const addresses = isIP(host) ? [host] : (await this._session.resolveHost(host)).endpoints.map(endpoint => endpoint.address);
		if (addresses.length === 0 || addresses.some(address => isIP(address) === 0)) {
			throw new Error(localize('networkFilter.invalidResolution', "The network destination could not be resolved to a valid IP address. The request was blocked."));
		}
		const denied = this._filter.getDeniedIpAddresses(this._options.getRestrictions?.());
		let hasUnspecifiedAddress = false;
		const permitted = addresses.filter(address => {
			const authority = isIP(address) === 6 ? `[${address}]` : address;
			const normalized = extractDomainFromUri(URI.from({ scheme: Schemas.http, authority }));
			if (normalized && (normalized === '[::]' || matchesDomainPattern(normalized, '0.0.0.0'))) {
				hasUnspecifiedAddress = true;
				return false;
			}
			return normalized !== undefined && !denied.some(pattern => matchesDomainPattern(normalized, pattern));
		});
		if (permitted.length === 0) {
			if (hasUnspecifiedAddress) {
				throw new Error(localize('networkFilter.unspecifiedAddress', "Unspecified network destinations cannot be checked against network address policy. The request was blocked."));
			}
			throw new Error(this._filter.formatError(uri));
		}
		return [...new Set(permitted)];
	}

	private async connect(host: string, port: number): Promise<ITunnelStream> {
		const authority = `${isIP(host) === 6 ? `[${host}]` : host}:${port}`;
		const uri = URI.from({ scheme: Schemas.http, authority });
		const revision = this._revision;
		if (this._options.isRemote?.()) {
			throw this.unsupportedTransportError();
		}
		if (!this._filter.isUriAllowed(uri, this._options.getRestrictions?.())) {
			throw new Error(this._filter.formatError(uri));
		}
		const addresses = await this.resolveAllowedAddresses(uri);
		const errors: Error[] = [];
		for (const address of addresses) {
			if (revision !== this._revision || this._store.isDisposed) {
				throw new CancellationError();
			}
			try {
				const attemptAbort = new AbortController();
				const signal = AbortSignal.any([this._connectionAbort.signal, attemptAbort.signal]);
				const connecting = (this._options.connect ?? connectToAddress)(address, port, signal).then(connection => {
					if (signal.aborted) {
						connection.stream.destroy();
						throw new CancellationError();
					}
					return connection;
				});
				const connection = await raceTimeout(connecting, AgentNetworkFilterSession.CONNECTION_ATTEMPT_TIMEOUT, () => attemptAbort.abort());
				if (!connection) {
					const error: NodeJS.ErrnoException = new Error(localize('networkFilter.connectionTimedOut', "Connecting to a permitted network destination timed out."));
					error.code = 'ETIMEDOUT';
					throw error;
				}
				if (revision !== this._revision || this._store.isDisposed) {
					connection.stream.destroy();
					throw new CancellationError();
				}
				return connection;
			} catch (error) {
				if (!(error instanceof Error)) {
					throw error;
				}
				const connectionError: NodeJS.ErrnoException = error;
				if (typeof connectionError.code !== 'string'
					|| !['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EAFNOSUPPORT', 'ECONNRESET'].includes(connectionError.code)) {
					throw error;
				}
				errors.push(error);
			}
		}
		throw new AggregateError(errors, localize('networkFilter.connectFailed', "Could not connect to a permitted network destination."));
	}

	private ensureProxy(revision: number): Promise<void> {
		// Reject stale requests before creating the shared setup promise.
		if (revision !== this._revision || this._store.isDisposed) {
			return Promise.reject(new CancellationError());
		}
		if (!this._setup) {
			this._setup = this._tail.then(async () => {
				if (revision !== this._revision || this._store.isDisposed) {
					throw new CancellationError();
				}
				const proxy = this._proxy.value = new TunnelProxy((host, port) => this.connect(host, port), this._logService);
				try {
					const info = await proxy.start();
					if (revision !== this._revision || this._store.isDisposed) {
						throw new CancellationError();
					}
					this._proxyInfo = info;
					this._modifiedProxy = true;
					await this._session.setProxy({ proxyRules: info.url, proxyBypassRules: '<-loopback>' });
					await this._session.closeAllConnections();
				} catch (error) {
					proxy.dispose();
					if (this._proxy.value === proxy) {
						this._proxy.clear();
					}
					if (revision === this._revision && !this._store.isDisposed) {
						this.update();
					}
					throw error;
				}
			});
			this._tail = this._setup;
			AgentNetworkFilterSession._routingUpdates.set(this._session, this._tail);
		}
		return this._setup;
	}

	update(): void {
		const revision = ++this._revision;
		this._connectionAbort.abort();
		this._connectionAbort = new AbortController();
		this._proxy.clear();
		this._setup = undefined;
		const closeConnections = this._modifiedProxy || this._filter.getDeniedIpAddresses(this._options.getRestrictions?.()).length > 0;
		this._restoring = closeConnections;
		const restore = async () => {
			if (closeConnections) {
				await this._session.closeAllConnections();
			}
			if (this._modifiedProxy) {
				await this._session.setProxy({ mode: 'system' });
				this._modifiedProxy = false;
			}
			this._proxyInfo = undefined;
		};
		this._tail = this._tail.then(restore, restore);
		AgentNetworkFilterSession._routingUpdates.set(this._session, this._tail);
		void this._tail.then(() => {
			if (revision === this._revision) {
				this._restoring = false;
			}
		}, error => this._logService.error('[AgentNetworkFilterSession] Failed to restore network routing', error));
	}

	override dispose(): void {
		if (!this._store.isDisposed) {
			this.update();
			super.dispose();
		}
	}
}

async function resolveSystemProxy(url: string): Promise<string> {
	const { session } = await import('electron');
	return session.fromPartition('vscode-agent-network-filter-proxy-resolution').resolveProxy(url);
}

async function connectToAddress(address: string, port: number, signal: AbortSignal): Promise<ITunnelStream> {
	return new Promise((resolve, reject) => {
		const socket = createConnection({ host: address, port, signal });
		socket.once('connect', () => resolve({ stream: socket, leftover: VSBuffer.alloc(0) }));
		socket.once('error', error => {
			socket.destroy();
			reject(error);
		});
	});
}
