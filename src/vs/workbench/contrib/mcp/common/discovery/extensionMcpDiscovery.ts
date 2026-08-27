/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier, IMcpCollectionContribution } from '../../../../../platform/extensions/common/extensions.js';
import { McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource } from '../../../../../platform/mcp/common/mcpDiscoveryMetadata.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ExtensionHostKind } from '../../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { mcpActivationEvent, mcpContributionPoint } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { extensionPrefixedIdentifier, McpCollectionSortOrder, McpServerDefinition, McpServerTrust } from '../mcpTypes.js';
import { IMcpConfigurationOutcome, IMcpDiscovery, IMcpDiscoveryCandidate, IMcpDiscoverySnapshot, mcpCandidate, mcpHost } from './mcpDiscovery.js';

const cacheKey = 'mcp.extCachedServers';

interface IServerCacheEntry {
	readonly servers: readonly McpServerDefinition.Serialized[];
}

const _mcpExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint(mcpContributionPoint);

const enum PersistWhen {
	CollectionExists,
	Always,
}

export class ExtensionMcpDiscovery extends Disposable implements IMcpDiscovery {

	readonly fromGallery = false;

	private readonly _extensionCollectionIdsToPersist = new Map<string, PersistWhen>();
	private readonly cachedServers: { [collcetionId: string]: IServerCacheEntry };
	private readonly _conditionalCollections = this._register(new DisposableMap<string>());
	private readonly _declaredCollections = new Map<string, McpDiscoveryHost>();
	private readonly _discoveryChanged = observableSignal(this);
	private readonly _extensionsReady = observableValue(this, false);
	private readonly _discoverySnapshot = observableValue<IMcpDiscoverySnapshot | undefined>(this, undefined);
	readonly discoverySnapshot = this._discoverySnapshot;

	constructor(
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this.cachedServers = storageService.getObject(cacheKey, StorageScope.WORKSPACE, {});

		this._register(storageService.onWillSaveState(() => {
			let updated = false;
			for (const [collectionId, behavior] of this._extensionCollectionIdsToPersist.entries()) {
				const collection = this._mcpRegistry.collections.get().find(c => c.id === collectionId);
				let defs = collection?.serverDefinitions.get();
				if (!collection || collection.lazy) {
					if (behavior === PersistWhen.Always) {
						defs = [];
					} else {
						continue;
					}
				}

				if (defs) {
					updated = true;
					this.cachedServers[collectionId] = { servers: defs.map(McpServerDefinition.toSerialized) };
				}
			}

			if (updated) {
				storageService.store(cacheKey, this.cachedServers, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
		}));
	}

	public start(): void {
		const extensionCollections = this._register(new DisposableMap<string>());
		void this._extensionService.whenInstalledExtensionsRegistered().then(() => this._extensionsReady.set(true, undefined));
		this._register(autorun(reader => {
			if (!this._extensionsReady.read(reader)) {
				return;
			}
			this._discoveryChanged.read(reader);
			const extensionDefinitions = this._mcpRegistry.collections.read(reader).filter(collection => collection.discovery?.source === McpDiscoverySource.Extension);
			const candidates: IMcpDiscoveryCandidate[] = [];
			const registeredIds = new Set<string>();
			const configurationOutcomes: IMcpConfigurationOutcome[] = [];
			for (const collection of extensionDefinitions) {
				registeredIds.add(collection.id);
				const definitions = collection.serverDefinitions.read(reader);
				const host = collection.discovery?.host ?? mcpHost(collection.remoteAuthority);
				candidates.push(...definitions.map(() => mcpCandidate(
					McpDiscoverySource.Extension,
					McpDiscoveryFormat.ExtensionProvider,
					McpDiscoveryScope.Extension,
					host,
					'loaded',
				)));
				if (collection.lazy && definitions.length === 0) {
					candidates.push(mcpCandidate(
						McpDiscoverySource.Extension,
						McpDiscoveryFormat.ExtensionProvider,
						McpDiscoveryScope.Extension,
						host,
						'unresolved',
					));
				}
				configurationOutcomes.push({
					source: McpDiscoverySource.Extension,
					format: McpDiscoveryFormat.ExtensionProvider,
					scope: McpDiscoveryScope.Extension,
					host,
					configurationPresent: 1,
					configuredEntryCount: definitions.length,
					parseErrorCount: 0,
					unreadableCount: 0,
				});
			}
			for (const [id, host] of this._declaredCollections) {
				if (!registeredIds.has(id)) {
					candidates.push(mcpCandidate(McpDiscoverySource.Extension, McpDiscoveryFormat.ExtensionProvider, McpDiscoveryScope.Extension, host, 'disabled'));
					configurationOutcomes.push({
						source: McpDiscoverySource.Extension,
						format: McpDiscoveryFormat.ExtensionProvider,
						scope: McpDiscoveryScope.Extension,
						host,
						configurationPresent: 1,
						configuredEntryCount: 0,
						parseErrorCount: 0,
						unreadableCount: 0,
					});
				}
			}
			this._discoverySnapshot.set({ candidates, configurationOutcomes }, undefined);
		}));
		this._register(_mcpExtensionPoint.setHandler((_extensions, delta) => {
			const { added, removed } = delta;

			for (const collections of removed) {
				for (const coll of collections.value) {
					const id = extensionPrefixedIdentifier(collections.description.identifier, coll.id);
					this._declaredCollections.delete(id);
					extensionCollections.deleteAndDispose(id);
					this._conditionalCollections.deleteAndDispose(id);
				}
			}

			for (const collections of added) {

				if (!ExtensionMcpDiscovery._validate(collections)) {
					continue;
				}

				for (const coll of collections.value) {
					const id = extensionPrefixedIdentifier(collections.description.identifier, coll.id);
					const host = getExtensionDiscoveryHost(this._extensionService.getExtensionsStatus()[ExtensionIdentifier.toKey(collections.description.identifier)]?.runningLocation?.kind);
					this._declaredCollections.set(id, host);
					this._extensionCollectionIdsToPersist.set(id, PersistWhen.CollectionExists);

					// Handle conditional collections with 'when' clause
					if (coll.when) {
						this._registerConditionalCollection(id, coll, collections, host, extensionCollections);
					} else {
						// Register collection immediately if no 'when' clause
						this._registerCollection(id, coll, collections, host, extensionCollections);
					}
				}
			}
			this._discoveryChanged.trigger(undefined);
		}));
	}

	private _registerCollection(
		id: string,
		coll: IMcpCollectionContribution,
		collections: extensionsRegistry.IExtensionPointUser<IMcpCollectionContribution[]>,
		host: McpDiscoveryHost,
		extensionCollections: DisposableMap<string>
	) {
		const serverDefs = this.cachedServers.hasOwnProperty(id) ? this.cachedServers[id].servers : undefined;
		const dispo = this._mcpRegistry.registerCollection({
			id,
			label: coll.label,
			remoteAuthority: null,
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.WORKSPACE,
			configTarget: ConfigurationTarget.USER,
			order: McpCollectionSortOrder.Extension,
			discovery: {
				source: McpDiscoverySource.Extension,
				format: McpDiscoveryFormat.ExtensionProvider,
				scope: McpDiscoveryScope.Extension,
				host,
			},
			serverDefinitions: observableValue<McpServerDefinition[]>(this, serverDefs?.map(McpServerDefinition.fromSerialized) || []),
			lazy: {
				isCached: !!serverDefs,
				load: () => this._activateExtensionServers(coll.id).then(() => {
					// persist (an empty collection) in case the extension doesn't end up publishing one
					this._extensionCollectionIdsToPersist.set(id, PersistWhen.Always);
				}),
				removed: () => {
					extensionCollections.deleteAndDispose(id);
					this._conditionalCollections.deleteAndDispose(id);
				},
			},
			source: collections.description.identifier
		});

		extensionCollections.set(id, dispo);
	}

	private _registerConditionalCollection(
		id: string,
		coll: IMcpCollectionContribution,
		collections: extensionsRegistry.IExtensionPointUser<IMcpCollectionContribution[]>,
		host: McpDiscoveryHost,
		extensionCollections: DisposableMap<string>
	) {
		const whenClause = ContextKeyExpr.deserialize(coll.when!);
		if (!whenClause) {
			// Invalid when clause, treat as always false
			return;
		}

		const evaluate = () => {
			const nowSatisfied = this._contextKeyService.contextMatchesRules(whenClause);
			const isRegistered = extensionCollections.has(id);
			if (nowSatisfied && !isRegistered) {
				this._registerCollection(id, coll, collections, host, extensionCollections);
			} else if (!nowSatisfied && isRegistered) {
				extensionCollections.deleteAndDispose(id);
			}
			this._discoveryChanged.trigger(undefined);
		};

		const contextKeyListener = this._contextKeyService.onDidChangeContext(evaluate);
		evaluate();

		// Store disposable for this conditional collection
		this._conditionalCollections.set(id, contextKeyListener);
	}

	private async _activateExtensionServers(collectionId: string): Promise<void> {
		await this._extensionService.activateByEvent(mcpActivationEvent(collectionId));
		await Promise.all(this._mcpRegistry.delegates.get()
			.map(r => r.waitForInitialProviderPromises()));
	}

	private static _validate(user: extensionsRegistry.IExtensionPointUser<IMcpCollectionContribution[]>): boolean {

		if (!Array.isArray(user.value)) {
			user.collector.error(localize('invalidData', "Expected an array of MCP collections"));
			return false;
		}

		for (const contribution of user.value) {
			if (typeof contribution.id !== 'string' || isFalsyOrWhitespace(contribution.id)) {
				user.collector.error(localize('invalidId', "Expected 'id' to be a non-empty string."));
				return false;
			}
			if (typeof contribution.label !== 'string' || isFalsyOrWhitespace(contribution.label)) {
				user.collector.error(localize('invalidLabel', "Expected 'label' to be a non-empty string."));
				return false;
			}
			if (contribution.when !== undefined && (typeof contribution.when !== 'string' || isFalsyOrWhitespace(contribution.when))) {
				user.collector.error(localize('invalidWhen', "Expected 'when' to be a non-empty string."));
				return false;
			}
		}

		return true;
	}
}

export function getExtensionDiscoveryHost(extensionHostKind: ExtensionHostKind | null | undefined): McpDiscoveryHost {
	if (extensionHostKind === ExtensionHostKind.Remote) {
		return McpDiscoveryHost.Remote;
	}
	if (extensionHostKind === ExtensionHostKind.LocalProcess || extensionHostKind === ExtensionHostKind.LocalWebWorker) {
		return McpDiscoveryHost.Local;
	}
	return McpDiscoveryHost.Unknown;
}
