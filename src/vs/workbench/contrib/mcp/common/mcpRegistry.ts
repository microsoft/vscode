/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { McpRegistryInputStorage } from './mcpRegistryInputStorage.js';
import { IMcpHostDelegate, IMcpRegistry, IMcpResolveConnectionOptions } from './mcpRegistryTypes.js';
import { McpServerConnection } from './mcpServerConnection.js';
import { IMcpServerConnection, LazyCollectionState, McpCollectionDefinition, McpCollectionReference } from './mcpTypes.js';

const createTrustMemento = observableMemento<Readonly<Record<string, boolean>>>({
	defaultValue: {},
	key: 'mcp.trustedCollections'
});

export class McpRegistry extends Disposable implements IMcpRegistry {
	declare public readonly _serviceBrand: undefined;

	private readonly _trustPrompts = new Map</* collection ID */string, Promise<boolean | undefined>>();

	private readonly _collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);
	private readonly _delegates: IMcpHostDelegate[] = [];
	public readonly collections: IObservable<readonly McpCollectionDefinition[]> = this._collections;

	private readonly _workspaceStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.WORKSPACE, StorageTarget.USER)));
	private readonly _profileStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.PROFILE, StorageTarget.USER)));

	private readonly _trustMemento = new Lazy(() => this._register(createTrustMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, this._storageService)));
	private readonly _lazyCollectionsToUpdate = new Set</* collection ID*/string>();
	private readonly _ongoingLazyActivations = observableValue(this, 0);

	public readonly lazyCollectionState = derived(reader => {
		if (this._ongoingLazyActivations.read(reader) > 0) {
			return LazyCollectionState.LoadingUnknown;
		}
		const collections = this._collections.read(reader);
		return collections.some(c => c.lazy && c.lazy.isCached === false) ? LazyCollectionState.HasUnknown : LazyCollectionState.AllKnown;
	});

	public get delegates(): readonly IMcpHostDelegate[] {
		return this._delegates;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IProductService private readonly _productService: IProductService,
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
		const toReplace = currentCollections.find(c => c.lazy && c.id === collection.id);

		// Incoming collections replace the "lazy" versions. See `ExtensionMcpDiscovery` for an example.
		if (toReplace) {
			this._lazyCollectionsToUpdate.add(collection.id);
			this._collections.set(currentCollections.map(c => c === toReplace ? collection : c), undefined);
		} else {
			this._collections.set([...currentCollections, collection], undefined);
		}

		return {
			dispose: () => {
				const currentCollections = this._collections.get();
				this._collections.set(currentCollections.filter(c => c !== collection), undefined);
			}
		};
	}

	public async discoverCollections(): Promise<McpCollectionDefinition[]> {
		const toDiscover = this._collections.get().filter(c => c.lazy && !c.lazy.isCached);

		this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() + 1, undefined);
		await Promise.all(toDiscover.map(c => c.lazy?.load())).finally(() => {
			this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() - 1, undefined);
		});

		const found: McpCollectionDefinition[] = [];
		const current = this._collections.get();
		for (const collection of toDiscover) {
			const rec = current.find(c => c.id === collection.id);
			if (!rec) {
				// ignored
			} else if (rec.lazy) {
				rec.lazy.removed?.(); // did not get replaced by the non-lazy version
			} else {
				found.push(rec);
			}
		}


		return found;
	}

	public clearSavedInputs() {
		this._profileStorage.value.clearAll();
		this._workspaceStorage.value.clearAll();
	}

	public resetTrust(): void {
		this._trustMemento.value.set({}, undefined);
	}

	public getTrust(collectionRef: McpCollectionReference): IObservable<boolean | undefined> {
		return derived(reader => {
			const collection = this._collections.read(reader).find(c => c.id === collectionRef.id);
			if (!collection || collection.isTrustedByDefault) {
				return true;
			}

			const memento = this._trustMemento.value.read(reader);
			return memento.hasOwnProperty(collection.id) ? memento[collection.id] : undefined;
		});
	}

	private _promptForTrust(collection: McpCollectionDefinition): Promise<boolean | undefined> {
		// Collect all trust prompts for a single config so that concurrently trying to start N
		// servers in a config don't result in N different dialogs
		let resultPromise = this._trustPrompts.get(collection.id);
		resultPromise ??= this._promptForTrustOpenDialog(collection).finally(() => {
			this._trustPrompts.delete(collection.id);
		});
		this._trustPrompts.set(collection.id, resultPromise);

		return resultPromise;
	}

	private async _promptForTrustOpenDialog(collection: McpCollectionDefinition): Promise<boolean | undefined> {
		const labelWithOrigin = collection.presentation?.origin
			? `[\`${basename(collection.presentation.origin)}\`](${collection.presentation.origin})`
			: collection.label;
		const result = await this._dialogService.prompt(
			{
				message: localize('trustTitleWithOrigin', 'Trust MCP servers from {0}?', collection.label),
				custom: {
					markdownDetails: [{
						markdown: new MarkdownString(localize('mcp.trust.details', '{0} discovered Model Context Protocol servers from {1} (`{2}`). {0} can use their capabilities in Chat.\n\nDo you want to allow running MCP servers from {3}?', this._productService.nameShort, collection.label, collection.serverDefinitions.get().map(s => s.label).join('`, `'), labelWithOrigin)),
						dismissOnLinkClick: true,
					}]
				},
				buttons: [
					{ label: localize('mcp.trust.yes', 'Trust'), run: () => true },
					{ label: localize('mcp.trust.no', 'Do not trust'), run: () => false }
				],
			},
		);

		return result.result;
	}

	public async resolveConnection({ collectionRef, definitionRef, forceTrust }: IMcpResolveConnectionOptions): Promise<IMcpServerConnection | undefined> {
		const collection = this._collections.get().find(c => c.id === collectionRef.id);
		const definition = collection?.serverDefinitions.get().find(s => s.id === definitionRef.id);
		if (!collection || !definition) {
			throw new Error(`Collection or definition not found for ${collectionRef.id} and ${definitionRef.id}`);
		}

		const delegate = this._delegates.find(d => d.canStart(collection, definition));
		if (!delegate) {
			throw new Error('No delegate found that can handle the connection');
		}

		if (!collection.isTrustedByDefault) {
			const memento = this._trustMemento.value.get();
			const trusted = memento.hasOwnProperty(collection.id) ? memento[collection.id] : undefined;

			if (trusted) {
				// continue
			} else if (trusted === undefined || forceTrust) {
				const trustValue = await this._promptForTrust(collection);
				if (trustValue !== undefined) {
					this._trustMemento.value.set({ ...memento, [collection.id]: trustValue }, undefined);
				}
				if (!trustValue) {
					return;
				}
			} else /** trusted === false && !forceTrust */ {
				return undefined;
			}
		}

		let launch = definition.launch;

		if (definition.variableReplacement) {
			const inputStorage = definition.variableReplacement.folder ? this._workspaceStorage.value : this._profileStorage.value;
			const previouslyStored = await inputStorage.getMap();

			const { folder, section, target } = definition.variableReplacement;

			// based on _configurationResolverService.resolveWithInteractionReplace
			launch = await this._configurationResolverService.resolveAnyAsync(folder, launch);

			const newVariables = await this._configurationResolverService.resolveWithInteraction(folder, launch, section, previouslyStored, target);

			if (newVariables?.size) {
				const completeVariables = { ...previouslyStored, ...Object.fromEntries(newVariables) };
				launch = await this._configurationResolverService.resolveAnyAsync(folder, launch, completeVariables);
				await inputStorage.setSecrets(completeVariables);
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
}
