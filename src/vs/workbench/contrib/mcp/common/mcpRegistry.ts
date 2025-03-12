/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { McpRegistryInputStorage } from './mcpRegistryInputStorage.js';
import { IMcpHostDelegate, IMcpRegistry, IMcpResolveConnectionOptions } from './mcpRegistryTypes.js';
import { McpServerConnection } from './mcpServerConnection.js';
import { IMcpServerConnection, McpCollectionDefinition, McpServerDefinition } from './mcpTypes.js';

export class McpRegistry extends Disposable implements IMcpRegistry {
	declare public readonly _serviceBrand: undefined;

	private readonly _collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);
	private readonly _delegates: IMcpHostDelegate[] = [];

	public readonly collections: IObservable<readonly McpCollectionDefinition[]> = this._collections;

	private readonly _workspaceStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.WORKSPACE, StorageTarget.USER)));
	private readonly _profileStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.PROFILE, StorageTarget.USER)));

	private readonly _trustMemento = new Lazy(() => {
		const memento = new Memento('mcpTrustedServers', this._storageService);
		this._register(this._storageService.onWillSaveState(() => memento.saveMemento()));
		return memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);
	});

	public get delegates(): readonly IMcpHostDelegate[] {
		return this._delegates;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IDialogService private readonly _dialogService: IDialogService,
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

	public clearSavedInputs() {
		this._profileStorage.value.clearAll();
		this._workspaceStorage.value.clearAll();
	}

	private async promptForTrust(collection: McpCollectionDefinition, definition: McpServerDefinition): Promise<boolean | undefined> {
		const labelWithOrigin = collection.presentation?.origin
			? `[\`${collection.label}\`](${collection.presentation.origin})`
			: collection.label;

		const result = await this._dialogService.prompt(
			{
				message: 'Do you trust this server?',
				custom: {
					markdownDetails: [{
						markdown: new MarkdownString(localize('mcp.trust.details', 'The Model Context Protocol server `{0}` was found from {1}.\n\nDo you want to allow running MCP servers from {1}?', definition.label, labelWithOrigin)),
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

	public async resolveConnection({ collection, definition, forceTrust }: IMcpResolveConnectionOptions): Promise<IMcpServerConnection | undefined> {
		const delegate = this._delegates.find(d => d.canStart(collection, definition));
		if (!delegate) {
			throw new Error('No delegate found that can handle the connection');
		}

		if (!collection.isTrustedByDefault) {
			const memento = this._trustMemento.value;
			const trusted = memento.hasOwnProperty(definition.id) ? memento[definition.id] : undefined;

			if (trusted) {
				// continue
			} else if (trusted === undefined || forceTrust) {
				const trustValue = await this.promptForTrust(collection, definition);
				memento[definition.id] = trustValue;
				if (!trustValue) { return; }
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

