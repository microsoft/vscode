/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { type ICachedTunnel } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { observableMemento, ObservableMemento } from '../../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

const CACHED_TUNNELS_KEY = 'tunnelAgentHost.recentTunnels';
const DISMISSED_TUNNELS_KEY = 'tunnelAgentHost.dismissedTunnels';
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = 'tunnelAgentHost.autoConnectSuppressedTunnels';

const cachedTunnelMemento = observableMemento<readonly ICachedTunnel[]>({
	defaultValue: [],
	key: CACHED_TUNNELS_KEY,
	toStorage: tunnels => JSON.stringify(tunnels),
	fromStorage: value => JSON.parse(value) as readonly ICachedTunnel[],
});

const autoConnectSuppressedTunnelMemento = observableMemento<readonly string[]>({
	defaultValue: [],
	key: AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY,
	toStorage: tunnelIds => JSON.stringify(tunnelIds),
	fromStorage: value => {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	},
});

const dismissedTunnelMemento = observableMemento<readonly string[]>({
	defaultValue: [],
	key: DISMISSED_TUNNELS_KEY,
	toStorage: tunnelIds => JSON.stringify(tunnelIds),
	fromStorage: value => {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	},
});

/** Persists the tunnel cache, picker dismissals, and auto-connect suppressions shared by browser tunnel services. */
export class TunnelAgentHostStorage extends Disposable {
	private readonly _onDidChangeTunnels = this._register(new Emitter<void>());
	readonly onDidChangeTunnels: Event<void> = this._onDidChangeTunnels.event;

	private readonly _cachedTunnels: ObservableMemento<readonly ICachedTunnel[]>;
	private readonly _dismissedTunnels: ObservableMemento<readonly string[]>;
	private readonly _autoConnectSuppressedTunnels: ObservableMemento<readonly string[]>;

	/** Cached tunnels, persisted across windows. */
	readonly cachedTunnels: IObservable<readonly ICachedTunnel[]>;
	/** Tunnel IDs explicitly dismissed from the remote-host picker. */
	readonly dismissedTunnels: IObservable<readonly string[]>;
	/** Tunnel IDs whose automatic reconnect is suppressed. */
	readonly autoConnectSuppressedTunnels: IObservable<readonly string[]>;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		super();
		this._cachedTunnels = this._register(cachedTunnelMemento(StorageScope.APPLICATION, StorageTarget.USER, storageService));
		this._dismissedTunnels = this._register(dismissedTunnelMemento(StorageScope.APPLICATION, StorageTarget.USER, storageService));
		this._autoConnectSuppressedTunnels = this._register(autoConnectSuppressedTunnelMemento(StorageScope.APPLICATION, StorageTarget.USER, storageService));
		this.cachedTunnels = this._cachedTunnels;
		this.dismissedTunnels = this._dismissedTunnels;
		this.autoConnectSuppressedTunnels = this._autoConnectSuppressedTunnels;
		this._register(autorun(reader => {
			this.cachedTunnels.read(reader);
			this.dismissedTunnels.read(reader);
			this.autoConnectSuppressedTunnels.read(reader);
			this._onDidChangeTunnels.fire();
		}));
	}

	getCachedTunnels(): ICachedTunnel[] {
		return [...this._cachedTunnels.get()];
	}

	cacheTunnel(tunnel: ICachedTunnel): void {
		const cached = this._cachedTunnels.get();
		this.clearAutoConnectSuppression(tunnel.tunnelId);
		this._cachedTunnels.set([tunnel, ...cached.filter(candidate => candidate.tunnelId !== tunnel.tunnelId)], undefined);
	}

	removeCachedTunnel(tunnelId: string): void {
		this._cachedTunnels.set(this._cachedTunnels.get().filter(tunnel => tunnel.tunnelId !== tunnelId), undefined);
		this.clearAutoConnectSuppression(tunnelId);
	}

	isTunnelDismissed(tunnelId: string): boolean {
		return this._dismissedTunnels.get().includes(tunnelId);
	}

	dismissTunnel(tunnelId: string): void {
		const dismissed = this._dismissedTunnels.get();
		this._dismissedTunnels.set(
			dismissed.includes(tunnelId) ? [...dismissed] : [...dismissed, tunnelId],
			undefined,
		);
	}

	clearTunnelDismissal(tunnelId: string): void {
		const dismissed = this._dismissedTunnels.get();
		if (!dismissed.includes(tunnelId)) {
			return;
		}
		this._dismissedTunnels.set(dismissed.filter(id => id !== tunnelId), undefined);
	}

	isAutoConnectSuppressed(tunnelId: string): boolean {
		return this._autoConnectSuppressedTunnels.get().includes(tunnelId);
	}

	suppressAutoConnect(tunnelId: string): void {
		const suppressed = this._autoConnectSuppressedTunnels.get();
		this._autoConnectSuppressedTunnels.set(
			suppressed.includes(tunnelId) ? [...suppressed] : [...suppressed, tunnelId],
			undefined,
		);
	}

	clearAutoConnectSuppression(tunnelId: string): void {
		const suppressed = this._autoConnectSuppressedTunnels.get();
		if (!suppressed.includes(tunnelId)) {
			return;
		}
		this._autoConnectSuppressedTunnels.set(suppressed.filter(id => id !== tunnelId), undefined);
	}
}
