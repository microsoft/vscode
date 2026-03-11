/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValueOpts } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { chatSessionResourceToId } from '../model/chatUri.js';

export interface IChatArtifact {
	readonly label: string;
	readonly uri: string;
	readonly toolCallId?: string;
	readonly dataPartIndex?: number;
	readonly type: 'devServer' | 'screenshot' | 'plan' | undefined;
}

export const IChatArtifactsService = createDecorator<IChatArtifactsService>('chatArtifactsService');

export interface IChatArtifactsService {
	readonly _serviceBrand: undefined;
	readonly onDidUpdateArtifacts: Event<URI>;
	getArtifacts(sessionResource: URI): readonly IChatArtifact[];
	setArtifacts(sessionResource: URI, artifacts: IChatArtifact[]): void;
	migrateArtifacts(oldSessionResource: URI, newSessionResource: URI): void;
	artifacts(sessionResource: URI): IObservable<readonly IChatArtifact[]>;
}

class ChatArtifactsStorage {
	private readonly _memento: Memento<Record<string, IChatArtifact[]>>;

	constructor(@IStorageService storageService: IStorageService) {
		this._memento = new Memento('chat-artifacts', storageService);
	}

	getArtifacts(sessionResource: URI): IChatArtifact[] {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[this._toKey(sessionResource)] || [];
	}

	setArtifacts(sessionResource: URI, artifacts: IChatArtifact[]): void {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage[this._toKey(sessionResource)] = artifacts;
		this._memento.saveMemento();
	}

	migrateArtifacts(oldSessionResource: URI, newSessionResource: URI): void {
		const artifacts = this.getArtifacts(oldSessionResource);
		if (artifacts.length > 0) {
			this.setArtifacts(newSessionResource, artifacts);
			const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
			delete storage[this._toKey(oldSessionResource)];
			this._memento.saveMemento();
		}
	}

	private _toKey(sessionResource: URI): string {
		return chatSessionResourceToId(sessionResource);
	}
}

export class ChatArtifactsService extends Disposable implements IChatArtifactsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidUpdateArtifacts = this._register(new Emitter<URI>());
	readonly onDidUpdateArtifacts = this._onDidUpdateArtifacts.event;

	private readonly _storage: ChatArtifactsStorage;
	private readonly _observables = new Map<string, ReturnType<typeof observableValueOpts<readonly IChatArtifact[]>>>();

	constructor(@IStorageService storageService: IStorageService) {
		super();
		this._storage = new ChatArtifactsStorage(storageService);
	}

	getArtifacts(sessionResource: URI): readonly IChatArtifact[] {
		return this._storage.getArtifacts(sessionResource);
	}

	setArtifacts(sessionResource: URI, artifacts: IChatArtifact[]): void {
		this._storage.setArtifacts(sessionResource, artifacts);
		const key = chatSessionResourceToId(sessionResource);
		this._observables.get(key)?.set(artifacts, undefined);
		this._onDidUpdateArtifacts.fire(sessionResource);
	}

	migrateArtifacts(oldSessionResource: URI, newSessionResource: URI): void {
		this._storage.migrateArtifacts(oldSessionResource, newSessionResource);
		this._onDidUpdateArtifacts.fire(newSessionResource);
	}

	artifacts(sessionResource: URI): IObservable<readonly IChatArtifact[]> {
		const key = chatSessionResourceToId(sessionResource);
		let obs = this._observables.get(key);
		if (!obs) {
			obs = observableValueOpts({ owner: this, equalsFn: () => false }, this._storage.getArtifacts(sessionResource));
			this._observables.set(key, obs);
		}
		return obs;
	}
}
