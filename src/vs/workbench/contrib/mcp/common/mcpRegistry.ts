/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IMcpHostDelegate, IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServerConnection } from './mcpServerConnection.js';
import { McpCollectionDefinition, IMcpServerConnection, McpServerDefinition } from './mcpTypes.js';

export class McpRegistry extends Disposable implements IMcpRegistry {
	declare public readonly _serviceBrand: undefined;

	private readonly _collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);
	private readonly _delegates: IMcpHostDelegate[] = [];

	public readonly collections: IObservable<readonly McpCollectionDefinition[]> = this._collections;

	public get delegates(): readonly IMcpHostDelegate[] {
		return this._delegates;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
	}

	public registerDelegate(delegate: IMcpHostDelegate): IDisposable {
		this._delegates.push(delegate);
		return {
			dispose: () => {
				const index = this._delegates.indexOf(delegate);
				if (index !== -1) {
					this._delegates.splice(index, 1);
				}
			}
		};
	}

	public registerCollection(collection: McpCollectionDefinition): IDisposable {
		const currentCollections = this._collections.get();
		this._collections.set([...currentCollections, collection], undefined);

		return {
			dispose: () => {
				const currentCollections = this._collections.get();
				this._collections.set(currentCollections.filter(c => c !== collection), undefined);
			}
		};
	}

	public hasSavedInputs(collection: McpCollectionDefinition, definition: McpServerDefinition): boolean {
		const stored = this.getInputStorageData(collection, definition);
		return !!stored && !!stored.map && !isEmptyObject(stored.map);
	}

	public clearSavedInputs(collection: McpCollectionDefinition, definition: McpServerDefinition) {
		const stored = this.getInputStorageData(collection, definition);
		if (stored) {
			this._storageService.remove(stored.key, stored.scope);
		}
	}

	public async resolveConnection(
		collection: McpCollectionDefinition,
		definition: McpServerDefinition
	): Promise<IMcpServerConnection> {
		const delegate = this._delegates.find(d => d.canStart(collection, definition));
		if (!delegate) {
			throw new Error('No delegate found that can handle the connection');
		}

		let launch = definition.launch;

		const storage = this.getInputStorageData(collection, definition);
		if (definition.variableReplacement && storage) {
			const { folder, section, target } = definition.variableReplacement;
			// based on _configurationResolverService.resolveWithInteractionReplace
			launch = await this._configurationResolverService.resolveAnyAsync(folder, launch);

			const newVariables = await this._configurationResolverService.resolveWithInteraction(folder, launch, section, storage.map, target);

			if (newVariables?.size) {
				launch = await this._configurationResolverService.resolveAnyAsync(folder, launch, Object.fromEntries(newVariables));
				this._storageService.store(storage.key, JSON.stringify(Object.fromEntries(newVariables)), storage.scope, StorageTarget.MACHINE);
			}
		}

		return this._instantiationService.createInstance(
			McpServerConnection,
			collection,
			definition,
			delegate,
			launch,
		);
	}

	private getInputStorageData(collection: McpCollectionDefinition, definition: McpServerDefinition) {
		if (!definition.variableReplacement) {
			return undefined;
		}

		const key = `mcpConfig.${collection.id}.${definition.id}`;
		const scope = definition.variableReplacement.folder ? StorageScope.WORKSPACE : StorageScope.APPLICATION;

		let map: Record<string, string> | undefined;
		try {
			map = this._storageService.getObject(key, scope);
		} catch {
			// ignord
		}

		return { key, scope, map };
	}
}

