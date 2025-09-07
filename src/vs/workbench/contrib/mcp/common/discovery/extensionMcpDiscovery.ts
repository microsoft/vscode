/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IMcpCollectionContribution } from '../../../../../platform/extensions/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { mcpActivationEvent, mcpContributionPoint } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { extensionPrefixedIdentifier, McpServerDefinition, McpServerTrust } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';

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

	constructor(
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly _extensionService: IExtensionService,
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
		this._register(_mcpExtensionPoint.setHandler((_extensions, delta) => {
			const { added, removed } = delta;

			for (const collections of removed) {
				for (const coll of collections.value) {
					extensionCollections.deleteAndDispose(extensionPrefixedIdentifier(collections.description.identifier, coll.id));
				}
			}

			for (const collections of added) {

				if (!ExtensionMcpDiscovery._validate(collections)) {
					continue;
				}

				for (const coll of collections.value) {
					const id = extensionPrefixedIdentifier(collections.description.identifier, coll.id);
					this._extensionCollectionIdsToPersist.set(id, PersistWhen.CollectionExists);

					const serverDefs = this.cachedServers.hasOwnProperty(id) ? this.cachedServers[id].servers : undefined;
					const dispo = this._mcpRegistry.registerCollection({
						id,
						label: coll.label,
						remoteAuthority: null,
						trustBehavior: McpServerTrust.Kind.Trusted,
						scope: StorageScope.WORKSPACE,
						configTarget: ConfigurationTarget.USER,
						serverDefinitions: observableValue<McpServerDefinition[]>(this, serverDefs?.map(McpServerDefinition.fromSerialized) || []),
						lazy: {
							isCached: !!serverDefs,
							load: () => this._activateExtensionServers(coll.id).then(() => {
								// persist (an empty collection) in case the extension doesn't end up publishing one
								this._extensionCollectionIdsToPersist.set(id, PersistWhen.Always);
							}),
							removed: () => extensionCollections.deleteAndDispose(id),
						},
						source: collections.description.identifier
					});

					extensionCollections.set(id, dispo);
				}
			}
		}));
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
		}

		return true;
	}
}
