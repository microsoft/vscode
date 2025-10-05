/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { IErdosPlotClient } from '../../common/erdosPlotsService.js';
import { IErdosPlotMetadata } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';

/**
 * Manages plot instance storage, selection, and retrieval operations.
 */
export class PlotInstanceRegistry extends Disposable {

	private readonly _clientsByIdentifier = this._register(new DisposableMap<string, IErdosPlotClient>());
	private _activeClientId?: string;

	private readonly _onClientAddedEmitter = this._register(new Emitter<IErdosPlotClient>());
	readonly onClientAdded: Event<IErdosPlotClient> = this._onClientAddedEmitter.event;

	private readonly _onClientSelectedEmitter = this._register(new Emitter<string>());
	readonly onClientSelected: Event<string> = this._onClientSelectedEmitter.event;

	private readonly _onClientRemovedEmitter = this._register(new Emitter<string>());
	readonly onClientRemoved: Event<string> = this._onClientRemovedEmitter.event;

	private readonly _onClientsReplacedEmitter = this._register(new Emitter<IErdosPlotClient[]>());
	readonly onClientsReplaced: Event<IErdosPlotClient[]> = this._onClientsReplacedEmitter.event;

	private readonly _onMetadataModifiedEmitter = this._register(new Emitter<IErdosPlotClient>());
	readonly onMetadataModified: Event<IErdosPlotClient> = this._onMetadataModifiedEmitter.event;

	getAllClients(): IErdosPlotClient[] {
		return Array.from(this._clientsByIdentifier.values());
	}

	getActiveClientIdentifier(): string | undefined {
		return this._activeClientId;
	}

	lookupClient(identifier: string): IErdosPlotClient | undefined {
		return this._clientsByIdentifier.get(identifier);
	}

	containsClient(identifier: string): boolean {
		return this._clientsByIdentifier.has(identifier);
	}

	activateClient(identifier: string): void {
		if (this._clientsByIdentifier.has(identifier)) {
			this._activeClientId = identifier;
			this._onClientSelectedEmitter.fire(identifier);
		}
	}

	navigateToPreviousClient(): void {
		const allClients = this.getAllClients();
		if (allClients.length === 0) return;

		const currentPosition = allClients.findIndex(c => c.id === this._activeClientId);
		if (currentPosition > 0) {
			this.activateClient(allClients[currentPosition - 1].id);
		}
	}

	navigateToNextClient(): void {
		const allClients = this.getAllClients();
		if (allClients.length === 0) return;

		const currentPosition = allClients.findIndex(c => c.id === this._activeClientId);
		if (currentPosition < allClients.length - 1) {
			this.activateClient(allClients[currentPosition + 1].id);
		}
	}

	discardClient(identifier: string, skipHistoryNotification: boolean = false): void {
		if (this._clientsByIdentifier.has(identifier)) {
			this._clientsByIdentifier.deleteAndDispose(identifier);
			if (this._activeClientId === identifier) {
				this._activeClientId = undefined;
			}
			this._onClientRemovedEmitter.fire(identifier);
		}
	}

	discardMultipleClients(identifiers: string[]): void {
		identifiers.forEach(id => {
			this.discardClient(id, true);
		});
	}

	purgeAllClients(): void {
		this._clientsByIdentifier.clearAndDisposeAll();
		this._activeClientId = undefined;
		this._onClientsReplacedEmitter.fire([]);
	}

	registerClient(client: IErdosPlotClient): void {
		this._clientsByIdentifier.set(client.id, client);
		this._activeClientId = client.id;
		this._onClientAddedEmitter.fire(client);
		this._onClientSelectedEmitter.fire(client.id);
	}

	modifyClientMetadata(identifier: string, modifications: Partial<IErdosPlotMetadata>): void {
		const client = this._clientsByIdentifier.get(identifier);
		if (!client) {
			return;
		}

		const existingMetadata = client.metadata as any;
		Object.assign(existingMetadata, modifications);

		this._onMetadataModifiedEmitter.fire(client);
	}

	retrieveClientByPosition(position: number): IErdosPlotClient | undefined {
		const clients = this.getAllClients();
		if (clients.length === 0 || position < 1 || position > clients.length) {
			return undefined;
		}

		const chronologicallySorted = clients.sort((a, b) => b.metadata.created - a.metadata.created);
		return chronologicallySorted[position - 1];
	}
}

