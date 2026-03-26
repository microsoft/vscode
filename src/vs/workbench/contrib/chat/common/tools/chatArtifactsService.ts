/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValueOpts } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { extractArtifactsFromResponse } from '../chatArtifactExtraction.js';
import { IChatToolInvocation, IChatService } from '../chatService/chatService.js';
import { ChatConfiguration } from '../constants.js';
import { chatSessionResourceToId } from '../model/chatUri.js';

export interface IArtifactGroupConfig {
	readonly groupName: string;
	readonly onlyShowGroup?: boolean;
}

export interface IChatArtifact {
	readonly label: string;
	readonly uri: string;
	readonly toolCallId?: string;
	readonly dataPartIndex?: number;
	readonly type: 'devServer' | 'screenshot' | 'plan' | undefined;
	readonly groupName?: string;
	readonly onlyShowGroup?: boolean;
}

export const IChatArtifactsService = createDecorator<IChatArtifactsService>('chatArtifactsService');

export interface IChatArtifactsService {
	readonly _serviceBrand: undefined;
	getArtifacts(sessionResource: URI): IChatArtifacts;
}

export interface IChatArtifacts {
	readonly artifacts: IObservable<readonly IChatArtifact[]>;
	readonly mutable: IObservable<boolean>;
	set(artifacts: IChatArtifact[]): void;
	clear(): void;
	migrate(target: IChatArtifacts): void;
}

interface IResponseCache {
	readonly partsLength: number;
	readonly completedToolCount: number;
	readonly byMimeType: Record<string, IArtifactGroupConfig>;
	readonly byFilePath: Record<string, IArtifactGroupConfig>;
	readonly artifacts: IChatArtifact[];
}

class ChatArtifactsStorage {
	private readonly _memento: Memento<Record<string, IChatArtifact[]>>;

	constructor(@IStorageService storageService: IStorageService) {
		this._memento = new Memento('chat-artifacts', storageService);
	}

	get(key: string): IChatArtifact[] {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[key] || [];
	}

	set(key: string, artifacts: IChatArtifact[]): void {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage[key] = artifacts;
		this._memento.saveMemento();
	}

	delete(key: string): void {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		delete storage[key];
		this._memento.saveMemento();
	}
}

class RulesChatArtifacts extends Disposable implements IChatArtifacts {

	readonly mutable = constObservable(false);
	readonly artifacts: IObservable<readonly IChatArtifact[]>;

	private readonly _responseCache = new Map<string, IResponseCache>();

	constructor(
		sessionResource: URI,
		chatService: IChatService,
		configurationService: IConfigurationService,
	) {
		super();

		const configByMimeType = observableFromEvent<Record<string, IArtifactGroupConfig>>(
			this,
			configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<Record<string, IArtifactGroupConfig>>(ChatConfiguration.ArtifactsRulesByMimeType) ?? {},
		);

		const configByFilePath = observableFromEvent<Record<string, IArtifactGroupConfig>>(
			this,
			configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<Record<string, IArtifactGroupConfig>>(ChatConfiguration.ArtifactsRulesByFilePath) ?? {},
		);

		const modelSignal = observableFromEvent(
			this,
			chatService.onDidCreateModel,
			() => chatService.getSession(sessionResource),
		);

		this.artifacts = derived<readonly IChatArtifact[]>(reader => {
			const byMimeType = configByMimeType.read(reader);
			const byFilePath = configByFilePath.read(reader);
			const model = modelSignal.read(reader);
			if (!model) {
				return [];
			}

			const requestsSignal = observableSignalFromEvent(this, model.onDidChange);

			requestsSignal.read(reader);
			const requests = model.getRequests();

			const allArtifacts: IChatArtifact[] = [];
			const activeResponseIds = new Set<string>();
			const seenKeys = new Set<string>();

			for (const request of requests) {
				const response = request.response;
				if (!response) {
					continue;
				}

				activeResponseIds.add(response.id);
				const responseValue = response.response;
				const partsLength = responseValue.value.length;

				let completedToolCount = 0;
				for (const part of responseValue.value) {
					if ((part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && IChatToolInvocation.resultDetails(part) !== undefined) {
						completedToolCount++;
					}
				}

				const cached = this._responseCache.get(response.id);
				let extracted: IChatArtifact[];
				if (cached && cached.partsLength === partsLength && cached.completedToolCount === completedToolCount && cached.byMimeType === byMimeType && cached.byFilePath === byFilePath) {
					extracted = cached.artifacts;
				} else {
					extracted = extractArtifactsFromResponse(responseValue, sessionResource, byMimeType, byFilePath);
					this._responseCache.set(response.id, { partsLength, completedToolCount, byMimeType, byFilePath, artifacts: extracted });
				}

				for (const artifact of extracted) {
					const key = artifact.toolCallId
						? `${artifact.toolCallId}:${artifact.dataPartIndex}`
						: artifact.uri;
					if (seenKeys.has(key)) {
						const idx = allArtifacts.findIndex(a =>
							a.toolCallId ? `${a.toolCallId}:${a.dataPartIndex}` === key : a.uri === key
						);
						if (idx !== -1) {
							allArtifacts.splice(idx, 1);
						}
					}
					seenKeys.add(key);
					allArtifacts.push(artifact);
				}
			}

			for (const key of this._responseCache.keys()) {
				if (!activeResponseIds.has(key)) {
					this._responseCache.delete(key);
				}
			}

			return allArtifacts;
		});
	}

	set(): void {
		throw new Error('Artifacts are not mutable in rules mode');
	}

	clear(): void {
		throw new Error('Artifacts are not mutable in rules mode');
	}

	migrate(): void {
		// Nothing to migrate — rules artifacts are derived from the model
	}
}

class StorageChatArtifacts implements IChatArtifacts {

	readonly mutable = constObservable(true);

	private readonly _artifacts = observableValueOpts<readonly IChatArtifact[]>(
		{ owner: this, equalsFn: () => false },
		[],
	);

	readonly artifacts: IObservable<readonly IChatArtifact[]> = this._artifacts;

	constructor(
		private readonly _storageKey: string,
		private readonly _storage: ChatArtifactsStorage,
	) {
		this._artifacts.set(this._storage.get(this._storageKey), undefined);
	}

	set(artifacts: IChatArtifact[]): void {
		this._artifacts.set(artifacts, undefined);
		this._storage.set(this._storageKey, artifacts);
	}

	clear(): void {
		this._artifacts.set([], undefined);
		this._storage.set(this._storageKey, []);
	}

	migrate(target: IChatArtifacts): void {
		const current = this._artifacts.get();
		if (current.length > 0 && target.mutable.get()) {
			target.set([...current]);
		}
		this._artifacts.set([], undefined);
		this._storage.delete(this._storageKey);
	}
}

class SwitchingChatArtifacts extends Disposable implements IChatArtifacts {

	private readonly _rules: RulesChatArtifacts;
	private readonly _storage: StorageChatArtifacts;
	private readonly _active: IObservable<IChatArtifacts>;

	readonly mutable: IObservable<boolean>;
	readonly artifacts: IObservable<readonly IChatArtifact[]>;

	constructor(
		sessionResource: URI,
		storageKey: string,
		storage: ChatArtifactsStorage,
		chatService: IChatService,
		configurationService: IConfigurationService,
	) {
		super();

		this._rules = this._register(new RulesChatArtifacts(sessionResource, chatService, configurationService));
		this._storage = new StorageChatArtifacts(storageKey, storage);

		const modeObs = observableFromEvent<string>(
			this,
			configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<string>(ChatConfiguration.ArtifactsMode) ?? 'rules',
		);

		this._active = derived<IChatArtifacts>(reader => {
			const mode = modeObs.read(reader);
			return mode === 'tool' ? this._storage : this._rules;
		});

		this.mutable = derived(reader => this._active.read(reader).mutable.read(reader));
		this.artifacts = derived(reader => this._active.read(reader).artifacts.read(reader));
	}

	set(artifacts: IChatArtifact[]): void {
		const active = this._active.get();
		active.set(artifacts);
	}

	clear(): void {
		const active = this._active.get();
		active.clear();
	}

	migrate(target: IChatArtifacts): void {
		this._storage.migrate(target);
	}
}

export class ChatArtifactsService extends Disposable implements IChatArtifactsService {
	declare readonly _serviceBrand: undefined;

	private readonly _storage: ChatArtifactsStorage;
	private readonly _instances = this._register(new DisposableMap<string, SwitchingChatArtifacts>());

	constructor(
		@IStorageService storageService: IStorageService,
		@IChatService private readonly _chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._storage = new ChatArtifactsStorage(storageService);
	}

	getArtifacts(sessionResource: URI): IChatArtifacts {
		const key = chatSessionResourceToId(sessionResource);
		let instance = this._instances.get(key);
		if (!instance) {
			instance = new SwitchingChatArtifacts(sessionResource, key, this._storage, this._chatService, this._configurationService);
			this._instances.set(key, instance);
		}
		return instance;
	}
}
