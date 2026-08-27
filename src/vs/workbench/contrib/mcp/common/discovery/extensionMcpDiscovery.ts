/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IMcpCollectionContribution } from '../../../../../platform/extensions/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { mcpActivationEvent, mcpContributionPoint } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { extensionPrefixedIdentifier, McpCollectionSortOrder, McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, McpServerDefinition, McpServerTrust } from '../mcpTypes.js';
import { IMcpConfigurationTelemetrySnapshot, IMcpDiscovery, IMcpDiscoveryTelemetryCandidate, IMcpDiscoveryTelemetrySnapshot } from './mcpDiscovery.js';
import { mcpCandidate, mcpHost } from './mcpDiscoveryTelemetry.js';

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
	private readonly _telemetryChanged = observableSignal(this);
	private readonly _extensionsReady = observableValue(this, false);
	private readonly _telemetrySnapshot = observableValue<IMcpDiscoveryTelemetrySnapshot | undefined>(this, undefined);
	readonly telemetrySnapshot = this._telemetrySnapshot;

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
			this._telemetryChanged.read(reader);
			const extensionDefinitions = this._mcpRegistry.collections.read(reader).filter(collection => collection.discovery?.source === McpDiscoverySource.Extension);
			const candidates: IMcpDiscoveryTelemetryCandidate[] = [];
			const registeredIds = new Set<string>();
			const configurations: IMcpConfigurationTelemetrySnapshot[] = [];
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
				configurations.push({
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
					configurations.push({
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
			this._telemetrySnapshot.set({ candidates, configurations }, undefined);
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
					this._declaredCollections.set(id, getExtensionDiscoveryHost(collections.description.extensionLocation));
					this._extensionCollectionIdsToPersist.set(id, PersistWhen.CollectionExists);

					// Handle conditional collections with 'when' clause
					if (coll.when) {
						this._registerConditionalCollection(id, coll, collections, extensionCollections);
					} else {
						// Register collection immediately if no 'when' clause
						this._registerCollection(id, coll, collections, extensionCollections);
					}
				}
			}
			this._telemetryChanged.trigger(undefined);
		}));
	}

	private _registerCollection(
		id: string,
		coll: IMcpCollectionContribution,
		collections: extensionsRegistry.IExtensionPointUser<IMcpCollectionContribution[]>,
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
				host: getExtensionDiscoveryHost(collections.description.extensionLocation),
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
				this._registerCollection(id, coll, collections, extensionCollections);
			} else if (!nowSatisfied && isRegistered) {
				extensionCollections.deleteAndDispose(id);
			}
			this._telemetryChanged.trigger(undefined);
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

export function getExtensionDiscoveryHost(extensionLocation: URI): McpDiscoveryHost {
	if (extensionLocation.scheme === Schemas.vscodeRemote) {
		return McpDiscoveryHost.Remote;
	}
	if (extensionLocation.scheme === Schemas.file) {
		return McpDiscoveryHost.Local;
	}
	return McpDiscoveryHost.Unknown;
}
