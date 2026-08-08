/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValueOpts } from '../../../../../base/common/observable.js';
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

export type ArtifactSource =
	| { readonly kind: 'rules' }
	| { readonly kind: 'agent' }
	| { readonly kind: 'subagent'; readonly invocationId: string; readonly name: string | undefined };

export interface IArtifactSourceGroup {
	readonly source: ArtifactSource;
	readonly artifacts: readonly IChatArtifact[];
}

export interface IArtifactRuleOverrides {
	readonly byMimeType?: Record<string, IArtifactGroupConfig>;
	readonly byFilePath?: Record<string, IArtifactGroupConfig>;
	readonly byMemoryFilePath?: Record<string, IArtifactGroupConfig>;
}

export const IChatArtifactsService = createDecorator<IChatArtifactsService>('chatArtifactsService');

export interface IChatArtifactsService {
	readonly _serviceBrand: undefined;
	getArtifacts(sessionResource: URI): IChatArtifacts;
}

export interface IChatArtifacts {
	readonly artifactGroups: IObservable<readonly IArtifactSourceGroup[]>;
	setAgentArtifacts(artifacts: IChatArtifact[]): void;
	setSubagentArtifacts(invocationId: string, name: string | undefined, artifacts: IChatArtifact[]): void;
	setRuleOverrides(rules: IArtifactRuleOverrides | undefined): void;
	clearAgentArtifacts(): void;
	clearSubagentArtifacts(invocationId: string): void;
	migrate(target: IChatArtifacts): void;
}

interface IResponseCache {
	readonly partsLength: number;
	readonly completedToolCount: number;
	readonly byMimeType: Record<string, IArtifactGroupConfig>;
	readonly byFilePath: Record<string, IArtifactGroupConfig>;
	readonly byMemoryFilePath: Record<string, IArtifactGroupConfig>;
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

class UnifiedChatArtifacts extends Disposable implements IChatArtifacts {

	private readonly _responseCache = new Map<string, IResponseCache>();

	private readonly _ruleOverrides = observableValueOpts<IArtifactRuleOverrides | undefined>(
		{ owner: this, equalsFn: () => false },
		undefined,
	);

	private readonly _agentArtifacts = observableValueOpts<readonly IChatArtifact[]>(
		{ owner: this, equalsFn: () => false },
		[],
	);

	private readonly _subagentArtifacts = observableValueOpts<ReadonlyMap<string, { readonly name: string | undefined; readonly artifacts: readonly IChatArtifact[] }>>(
		{ owner: this, equalsFn: () => false },
		new Map(),
	);

	/** Sequence counter for ordering sources by first-set time. */
	private _nextSequence = 1; // 0 is reserved for rules
	private readonly _sourceSequences = new Map<string, number>();

	readonly artifactGroups: IObservable<readonly IArtifactSourceGroup[]>;

	constructor(
		sessionResource: URI,
		private readonly _storageKey: string,
		private readonly _storage: ChatArtifactsStorage,
		chatService: IChatService,
		configurationService: IConfigurationService,
	) {
		super();

		// Restore persisted agent artifacts
		const restored = this._storage.get(this._storageKey);
		this._agentArtifacts.set(restored, undefined);
		this._sourceSequences.set('rules', 0);
		if (restored.length > 0) {
			this._sourceSequences.set('agent', this._nextSequence++);
		}

		// Config-based rules (defaults)
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

		const configByMemoryFilePath = observableFromEvent<Record<string, IArtifactGroupConfig>>(
			this,
			configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<Record<string, IArtifactGroupConfig>>(ChatConfiguration.ArtifactsRulesByMemoryFilePath) ?? {},
		);

		const modelSignal = observableFromEvent(
			this,
			chatService.onDidCreateModel,
			() => chatService.getSession(sessionResource),
		);

		// Derived: rules-based artifacts
		const rulesArtifacts = derived<readonly IChatArtifact[]>(reader => {
			const overrides = this._ruleOverrides.read(reader);
			const byMimeType = overrides?.byMimeType ?? configByMimeType.read(reader);
			const byFilePath = overrides?.byFilePath ?? configByFilePath.read(reader);
			const byMemoryFilePath = overrides?.byMemoryFilePath ?? configByMemoryFilePath.read(reader);
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
				if (cached && cached.partsLength === partsLength && cached.completedToolCount === completedToolCount && cached.byMimeType === byMimeType && cached.byFilePath === byFilePath && cached.byMemoryFilePath === byMemoryFilePath) {
					extracted = cached.artifacts;
				} else {
					extracted = extractArtifactsFromResponse(responseValue, sessionResource, byMimeType, byFilePath, byMemoryFilePath);
					this._responseCache.set(response.id, { partsLength, completedToolCount, byMimeType, byFilePath, byMemoryFilePath, artifacts: extracted });
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

		// Combined: all sources as groups, deduplicated by URI
		this.artifactGroups = derived<readonly IArtifactSourceGroup[]>(reader => {
			const entries: { key: string; seq: number; group: IArtifactSourceGroup }[] = [];

			const rules = rulesArtifacts.read(reader);
			if (rules.length > 0) {
				entries.push({ key: 'rules', seq: this._sourceSequences.get('rules') ?? 0, group: { source: { kind: 'rules' }, artifacts: rules } });
			}

			const agent = this._agentArtifacts.read(reader);
			if (agent.length > 0) {
				entries.push({ key: 'agent', seq: this._sourceSequences.get('agent') ?? Infinity, group: { source: { kind: 'agent' }, artifacts: agent } });
			}

			const subagents = this._subagentArtifacts.read(reader);
			for (const [invocationId, entry] of subagents) {
				if (entry.artifacts.length > 0) {
					const key = `subagent:${invocationId}`;
					entries.push({
						key,
						seq: this._sourceSequences.get(key) ?? Infinity,
						group: { source: { kind: 'subagent', invocationId, name: entry.name }, artifacts: entry.artifacts },
					});
				}
			}

			// Sort by sequence so the first source to set artifacts wins duplicates
			entries.sort((a, b) => a.seq - b.seq);

			const seenKeys = new Set<string>();
			const groups: IArtifactSourceGroup[] = [];

			for (const entry of entries) {
				const filtered = entry.group.artifacts.filter(a => {
					const k = a.toolCallId ? `${a.toolCallId}:${a.dataPartIndex}` : a.uri;
					if (!k) {
						return false;
					}
					const normalized = k.toLowerCase();
					if (seenKeys.has(normalized)) {
						return false;
					}
					seenKeys.add(normalized);
					return true;
				});
				if (filtered.length > 0) {
					groups.push({ source: entry.group.source, artifacts: filtered });
				}
			}

			return groups;
		});
	}

	setAgentArtifacts(artifacts: IChatArtifact[]): void {
		if (!this._sourceSequences.has('agent')) {
			this._sourceSequences.set('agent', this._nextSequence++);
		}
		this._agentArtifacts.set(artifacts, undefined);
		this._storage.set(this._storageKey, artifacts);
	}

	setSubagentArtifacts(invocationId: string, name: string | undefined, artifacts: IChatArtifact[]): void {
		const key = `subagent:${invocationId}`;
		if (!this._sourceSequences.has(key)) {
			this._sourceSequences.set(key, this._nextSequence++);
		}
		const map = new Map(this._subagentArtifacts.get());
		if (artifacts.length === 0) {
			map.delete(invocationId);
		} else {
			map.set(invocationId, { name, artifacts });
		}
		this._subagentArtifacts.set(map, undefined);
	}

	setRuleOverrides(rules: IArtifactRuleOverrides | undefined): void {
		this._ruleOverrides.set(rules, undefined);
	}

	clearAgentArtifacts(): void {
		this._agentArtifacts.set([], undefined);
		this._storage.set(this._storageKey, []);
	}

	clearSubagentArtifacts(invocationId: string): void {
		const map = new Map(this._subagentArtifacts.get());
		map.delete(invocationId);
		this._subagentArtifacts.set(map, undefined);
	}

	migrate(target: IChatArtifacts): void {
		const current = this._agentArtifacts.get();
		if (current.length > 0) {
			target.setAgentArtifacts([...current]);
		}
		this._agentArtifacts.set([], undefined);
		this._storage.delete(this._storageKey);
	}
}

export class ChatArtifactsService extends Disposable implements IChatArtifactsService {
	declare readonly _serviceBrand: undefined;

	private readonly _storage: ChatArtifactsStorage;
	private readonly _instances = this._register(new DisposableMap<string, UnifiedChatArtifacts>());

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
			instance = new UnifiedChatArtifacts(sessionResource, key, this._storage, this._chatService, this._configurationService);
			this._instances.set(key, instance);
		}
		return instance;
	}
}
