/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { normalizeRemoteAgentHostAddress } from './agentHostUri.js';
import { RemoteAgentHostEntryType, type IRemoteAgentHostEntry } from './remoteAgentHostService.js';

/** A remote agent host that a running extension registered. */
export interface IExtensionRemoteAgentHost {
	/** Identifier of the extension that registered the host. */
	readonly extensionId: string;
	/** Display name of the extension that registered the host. */
	readonly extensionDisplayName: string;
	readonly name: string;
	/** WebSocket address of the host, without its connection token. */
	readonly address: string;
	readonly connectionToken?: string;
}

export const IExtensionRemoteAgentHostsService = createDecorator<IExtensionRemoteAgentHostsService>('extensionRemoteAgentHostsService');

/**
 * Remote agent hosts that running extensions register with the `chat.registerRemoteAgentHost` API.
 * Every window keeps the registrations of its own extensions, and registers a connection factory for
 * {@link connectableEntries}: the Agents window with their session providers, an editor window to show
 * their agents and sessions in Chat, as it shows the hosts its workspace lists.
 */
export interface IExtensionRemoteAgentHostsService {
	readonly _serviceBrand: undefined;

	/**
	 * Registered hosts, one per normalized address, for host management to list whether or not they are
	 * connected. When several registrations share an address, the most recent one wins until it is disposed.
	 */
	readonly hosts: IObservable<readonly IExtensionRemoteAgentHost[]>;

	/**
	 * Normalized addresses the user disconnected. Their hosts stay registered, and listed, but are not
	 * connected until the user connects them again. Remembered across restarts.
	 */
	readonly disconnectedAddresses: IObservable<ReadonlySet<string>>;

	/**
	 * The {@link RemoteAgentHostEntryType.Extension} entries to connect to: the registered {@link hosts}
	 * that the user did not disconnect.
	 */
	readonly connectableEntries: IObservable<readonly IRemoteAgentHostEntry[]>;

	/** Registers a host until the returned disposable is disposed. */
	registerHost(host: IExtensionRemoteAgentHost): IDisposable;

	setDisconnected(address: string, disconnected: boolean): void;
}

const DISCONNECTED_STORAGE_KEY = 'remoteAgentHost.extensionHosts.disconnected';

/** The {@link RemoteAgentHostEntryType.Extension} entry of a registered host. */
export function toExtensionRemoteAgentHostEntry(host: IExtensionRemoteAgentHost): IRemoteAgentHostEntry {
	return {
		name: host.name,
		connectionToken: host.connectionToken,
		connection: {
			type: RemoteAgentHostEntryType.Extension,
			address: host.address,
			extensionId: host.extensionId,
			extensionDisplayName: host.extensionDisplayName,
		},
	};
}

export class ExtensionRemoteAgentHostsService extends Disposable implements IExtensionRemoteAgentHostsService {
	declare readonly _serviceBrand: undefined;

	private readonly _registrations = observableValue<readonly IExtensionRemoteAgentHost[]>(this, []);

	readonly hosts = derived(this, reader => {
		const byAddress = new Map<string, IExtensionRemoteAgentHost>();
		for (const host of this._registrations.read(reader)) {
			byAddress.delete(host.address);
			byAddress.set(host.address, host);
		}
		return [...byAddress.values()];
	});

	private readonly _disconnectedAddresses = observableValue<ReadonlySet<string>>(this, new Set());
	readonly disconnectedAddresses: IObservable<ReadonlySet<string>> = this._disconnectedAddresses;

	readonly connectableEntries = derived<readonly IRemoteAgentHostEntry[]>(this, reader => {
		const disconnected = this._disconnectedAddresses.read(reader);
		return this.hosts.read(reader).filter(host => !disconnected.has(host.address)).map(toExtensionRemoteAgentHostEntry);
	});

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._updateDisconnectedAddresses(this._readDisconnectedAddresses());
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, DISCONNECTED_STORAGE_KEY, this._store)(() => {
			this._updateDisconnectedAddresses(this._readDisconnectedAddresses());
		}));
	}

	registerHost(host: IExtensionRemoteAgentHost): IDisposable {
		const registration: IExtensionRemoteAgentHost = { ...host, address: normalizeRemoteAgentHostAddress(host.address) };
		this._registrations.set([...this._registrations.get(), registration], undefined);
		return toDisposable(() => {
			this._registrations.set(this._registrations.get().filter(candidate => candidate !== registration), undefined);
		});
	}

	setDisconnected(address: string, disconnected: boolean): void {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const addresses = new Set(this._disconnectedAddresses.get());
		if (disconnected) {
			addresses.add(normalized);
		} else {
			addresses.delete(normalized);
		}
		if (!this._updateDisconnectedAddresses(addresses)) {
			return;
		}
		if (addresses.size) {
			this._storageService.store(DISCONNECTED_STORAGE_KEY, JSON.stringify([...addresses].sort()), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(DISCONNECTED_STORAGE_KEY, StorageScope.APPLICATION);
		}
	}

	private _readDisconnectedAddresses(): ReadonlySet<string> {
		try {
			const parsed: unknown = JSON.parse(this._storageService.get(DISCONNECTED_STORAGE_KEY, StorageScope.APPLICATION) ?? '[]');
			return new Set(Array.isArray(parsed) ? parsed.filter((address): address is string => typeof address === 'string') : []);
		} catch {
			return new Set();
		}
	}

	/** Returns whether the addresses changed. */
	private _updateDisconnectedAddresses(addresses: ReadonlySet<string>): boolean {
		const current = this._disconnectedAddresses.get();
		if (current.size === addresses.size && [...addresses].every(address => current.has(address))) {
			return false;
		}
		this._disconnectedAddresses.set(addresses, undefined);
		return true;
	}
}

registerSingleton(IExtensionRemoteAgentHostsService, ExtensionRemoteAgentHostsService, InstantiationType.Delayed);
