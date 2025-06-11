/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderData } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression, IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { mcpEnabledSection } from './mcpConfiguration.js';
import { IMcpDevModeDebugging } from './mcpDevMode.js';
import { McpRegistryInputStorage } from './mcpRegistryInputStorage.js';
import { IMcpHostDelegate, IMcpRegistry, IMcpResolveConnectionOptions } from './mcpRegistryTypes.js';
import { McpServerConnection } from './mcpServerConnection.js';
import { IMcpServerConnection, LazyCollectionState, McpCollectionDefinition, McpCollectionReference, McpDefinitionReference, McpServerDefinition, McpServerLaunch } from './mcpTypes.js';

const createTrustMemento = observableMemento<Readonly<Record<string, boolean>>>({
	defaultValue: {},
	key: 'mcp.trustedCollections'
});

export class McpRegistry extends Disposable implements IMcpRegistry {
	declare public readonly _serviceBrand: undefined;

	private readonly _trustPrompts = new Map</* collection ID */string, Promise<boolean | undefined>>();

	private readonly _collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);
	private readonly _delegates = observableValue<readonly IMcpHostDelegate[]>('delegates', []);
	private readonly _enabled: IObservable<boolean>;
	public readonly collections: IObservable<readonly McpCollectionDefinition[]> = derived(reader => {
		if (!this._enabled.read(reader)) {
			return [];
		}
		return this._collections.read(reader);
	});

	private readonly _workspaceStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.WORKSPACE, StorageTarget.USER)));
	private readonly _profileStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.PROFILE, StorageTarget.USER)));

	private readonly _trustMemento = new Lazy(() => this._register(createTrustMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, this._storageService)));
	private readonly _ongoingLazyActivations = observableValue(this, 0);

	public readonly lazyCollectionState = derived(reader => {
		if (this._enabled.read(reader) === false) {
			return LazyCollectionState.AllKnown;
		}

		if (this._ongoingLazyActivations.read(reader) > 0) {
			return LazyCollectionState.LoadingUnknown;
		}
		const collections = this._collections.read(reader);
		return collections.some(c => c.lazy && c.lazy.isCached === false) ? LazyCollectionState.HasUnknown : LazyCollectionState.AllKnown;
	});

	public get delegates(): IObservable<readonly IMcpHostDelegate[]> {
		return this._delegates;
	}

	private readonly _onDidChangeInputs = this._register(new Emitter<void>());
	public readonly onDidChangeInputs = this._onDidChangeInputs.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IProductService private readonly _productService: IProductService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this._enabled = observableConfigValue(mcpEnabledSection, true, configurationService);
	}

	public registerDelegate(delegate: IMcpHostDelegate): IDisposable {
		const delegates = this._delegates.get().slice();
		delegates.push(delegate);
		delegates.sort((a, b) => b.priority - a.priority);
		this._delegates.set(delegates, undefined);

		return {
			dispose: () => {
				const delegates = this._delegates.get().filter(d => d !== delegate);
				this._delegates.set(delegates, undefined);
			}
		};
	}

	public registerCollection(collection: McpCollectionDefinition): IDisposable {
		const currentCollections = this._collections.get();
		const toReplace = currentCollections.find(c => c.lazy && c.id === collection.id);

		// Incoming collections replace the "lazy" versions. See `ExtensionMcpDiscovery` for an example.
		if (toReplace) {
			this._collections.set(currentCollections.map(c => c === toReplace ? collection : c), undefined);
		} else {
			this._collections.set([...currentCollections, collection]
				.sort((a, b) => (a.presentation?.order || 0) - (b.presentation?.order || 0)), undefined);
		}

		return {
			dispose: () => {
				const currentCollections = this._collections.get();
				this._collections.set(currentCollections.filter(c => c !== collection), undefined);
			}
		};
	}

	public getServerDefinition(collectionRef: McpDefinitionReference, definitionRef: McpDefinitionReference): IObservable<{ server: McpServerDefinition | undefined; collection: McpCollectionDefinition | undefined }> {
		const collectionObs = this._collections.map(cols => cols.find(c => c.id === collectionRef.id));
		return collectionObs.map((collection, reader) => {
			const server = collection?.serverDefinitions.read(reader).find(s => s.id === definitionRef.id);
			return { collection, server };
		});
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

	private _getInputStorage(scope: StorageScope): McpRegistryInputStorage {
		return scope === StorageScope.WORKSPACE ? this._workspaceStorage.value : this._profileStorage.value;
	}

	private _getInputStorageInConfigTarget(configTarget: ConfigurationTarget): McpRegistryInputStorage {
		return this._getInputStorage(
			configTarget === ConfigurationTarget.WORKSPACE || configTarget === ConfigurationTarget.WORKSPACE_FOLDER
				? StorageScope.WORKSPACE
				: StorageScope.PROFILE
		);
	}

	public async clearSavedInputs(scope: StorageScope, inputId?: string) {
		const storage = this._getInputStorage(scope);
		if (inputId) {
			await storage.clear(inputId);
		} else {
			storage.clearAll();
		}

		this._onDidChangeInputs.fire();
	}

	public async editSavedInput(inputId: string, folderData: IWorkspaceFolderData | undefined, configSection: string, target: ConfigurationTarget): Promise<void> {
		const storage = this._getInputStorageInConfigTarget(target);
		const expr = ConfigurationResolverExpression.parse(inputId);

		const stored = await storage.getMap();
		const previous = stored[inputId].value;
		await this._configurationResolverService.resolveWithInteraction(folderData, expr, configSection, previous ? { [inputId.slice(2, -1)]: previous } : {}, target);
		await this._updateStorageWithExpressionInputs(storage, expr);
	}

	public async setSavedInput(inputId: string, target: ConfigurationTarget, value: string): Promise<void> {
		const storage = this._getInputStorageInConfigTarget(target);
		const expr = ConfigurationResolverExpression.parse(inputId);
		for (const unresolved of expr.unresolved()) {
			expr.resolve(unresolved, value);
			break;
		}
		await this._updateStorageWithExpressionInputs(storage, expr);
	}

	public getSavedInputs(scope: StorageScope): Promise<{ [id: string]: IResolvedValue }> {
		return this._getInputStorage(scope).getMap();
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
		const originURI = collection.presentation?.origin;
		const labelWithOrigin = originURI ? `[\`${basename(originURI)}\`](${originURI})` : collection.label;

		const result = await this._dialogService.prompt(
			{
				message: localize('trustTitleWithOrigin', 'Trust MCP servers from {0}?', collection.label),
				custom: {
					icon: Codicon.shield,
					markdownDetails: [{
						markdown: new MarkdownString(localize('mcp.trust.details', '{0} discovered Model Context Protocol servers from {1} (`{2}`). {0} can use their capabilities in Chat.\n\nDo you want to allow running MCP servers from {3}?', this._productService.nameShort, collection.label, collection.serverDefinitions.get().map(s => s.label).join('`, `'), labelWithOrigin)),
						actionHandler: () => {
							const editor = this._editorService.openEditor({ resource: collection.presentation!.origin! }, AUX_WINDOW_GROUP);
							return editor.then(Boolean);
						},
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

	private async _updateStorageWithExpressionInputs(inputStorage: McpRegistryInputStorage, expr: ConfigurationResolverExpression<unknown>): Promise<void> {
		const secrets: Record<string, IResolvedValue> = {};
		const inputs: Record<string, IResolvedValue> = {};
		for (const [replacement, resolved] of expr.resolved()) {
			if (resolved.input?.type === 'promptString' && resolved.input.password) {
				secrets[replacement.id] = resolved;
			} else {
				inputs[replacement.id] = resolved;
			}
		}

		inputStorage.setPlainText(inputs);
		await inputStorage.setSecrets(secrets);
		this._onDidChangeInputs.fire();
	}

	private async _replaceVariablesInLaunch(definition: McpServerDefinition, launch: McpServerLaunch) {
		if (!definition.variableReplacement) {
			return launch;
		}

		const { section, target, folder } = definition.variableReplacement;
		const inputStorage = this._getInputStorageInConfigTarget(target);
		const previouslyStored = await inputStorage.getMap();

		// pre-fill the variables we already resolved to avoid extra prompting
		const expr = ConfigurationResolverExpression.parse(launch);
		for (const replacement of expr.unresolved()) {
			if (previouslyStored.hasOwnProperty(replacement.id)) {
				expr.resolve(replacement, previouslyStored[replacement.id]);
			}
		}

		// resolve variables requiring user input
		await this._configurationResolverService.resolveWithInteraction(folder, expr, section, undefined, target);

		await this._updateStorageWithExpressionInputs(inputStorage, expr);

		// resolve other non-interactive variables, returning the final object
		return await this._configurationResolverService.resolveAsync(folder, expr);
	}

	public async resolveConnection({ collectionRef, definitionRef, forceTrust, logger, debug }: IMcpResolveConnectionOptions): Promise<IMcpServerConnection | undefined> {
		let collection = this._collections.get().find(c => c.id === collectionRef.id);
		if (collection?.lazy) {
			await collection.lazy.load();
			collection = this._collections.get().find(c => c.id === collectionRef.id);
		}

		const definition = collection?.serverDefinitions.get().find(s => s.id === definitionRef.id);
		if (!collection || !definition) {
			throw new Error(`Collection or definition not found for ${collectionRef.id} and ${definitionRef.id}`);
		}

		const delegate = this._delegates.get().find(d => d.canStart(collection, definition));
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

		let launch: McpServerLaunch | undefined = definition.launch;
		if (collection.resolveServerLanch) {
			launch = await collection.resolveServerLanch(definition);
			if (!launch) {
				return undefined; // interaction cancelled by user
			}
		}

		try {
			launch = await this._replaceVariablesInLaunch(definition, launch);

			if (definition.devMode && debug) {
				launch = await this._instantiationService.invokeFunction(accessor => accessor.get(IMcpDevModeDebugging).transform(definition, launch!));
			}
		} catch (e) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('mcp.launchError', 'Error starting {0}: {1}', definition.label, String(e)),
				actions: {
					primary: collection.presentation?.origin && [
						{
							id: 'mcp.launchError.openConfig',
							class: undefined,
							enabled: true,
							tooltip: '',
							label: localize('mcp.launchError.openConfig', 'Open Configuration'),
							run: () => this._editorService.openEditor({
								resource: collection.presentation!.origin,
								options: { selection: definition.presentation?.origin?.range }
							}),
						}
					]
				}
			});
			return;
		}

		return this._instantiationService.createInstance(
			McpServerConnection,
			collection,
			definition,
			delegate,
			launch,
			logger,
		);
	}
}
