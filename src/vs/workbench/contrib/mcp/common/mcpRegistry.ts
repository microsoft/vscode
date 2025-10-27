/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../base/common/assert.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue, autorunSelfDisposable } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderData } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression, IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IMcpDevModeDebugging } from './mcpDevMode.js';
import { McpRegistryInputStorage } from './mcpRegistryInputStorage.js';
import { IMcpHostDelegate, IMcpRegistry, IMcpResolveConnectionOptions } from './mcpRegistryTypes.js';
import { McpServerConnection } from './mcpServerConnection.js';
import { IMcpServerConnection, LazyCollectionState, McpCollectionDefinition, McpDefinitionReference, McpServerDefinition, McpServerLaunch, McpServerTrust, McpStartServerInteraction, UserInteractionRequiredError } from './mcpTypes.js';

const notTrustedNonce = '__vscode_not_trusted';

export class McpRegistry extends Disposable implements IMcpRegistry {
	declare public readonly _serviceBrand: undefined;

	private readonly _collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);
	private readonly _delegates = observableValue<readonly IMcpHostDelegate[]>('delegates', []);
	private readonly _mcpAccessValue: IObservable<string>;
	public readonly collections: IObservable<readonly McpCollectionDefinition[]> = derived(reader => {
		if (this._mcpAccessValue.read(reader) === McpAccessValue.None) {
			return [];
		}
		return this._collections.read(reader);
	});

	private readonly _workspaceStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.WORKSPACE, StorageTarget.USER)));
	private readonly _profileStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.PROFILE, StorageTarget.USER)));

	private readonly _ongoingLazyActivations = observableValue(this, 0);

	public readonly lazyCollectionState = derived(reader => {
		if (this._mcpAccessValue.read(reader) === McpAccessValue.None) {
			return { state: LazyCollectionState.AllKnown, collections: [] };
		}

		if (this._ongoingLazyActivations.read(reader) > 0) {
			return { state: LazyCollectionState.LoadingUnknown, collections: [] };
		}
		const collections = this._collections.read(reader);
		const hasUnknown = collections.some(c => c.lazy && c.lazy.isCached === false);
		return hasUnknown ? { state: LazyCollectionState.HasUnknown, collections: collections.filter(c => c.lazy && c.lazy.isCached === false) } : { state: LazyCollectionState.AllKnown, collections: [] };
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
		@INotificationService private readonly _notificationService: INotificationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ILabelService private readonly _labelService: ILabelService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._mcpAccessValue = observableConfigValue(mcpAccessConfig, McpAccessValue.All, configurationService);
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

	private async _checkTrust(collection: McpCollectionDefinition, definition: McpServerDefinition, {
		trustNonceBearer,
		interaction,
		promptType = 'only-new',
		autoTrustChanges = false,
		errorOnUserInteraction = false,
	}: IMcpResolveConnectionOptions) {
		if (collection.trustBehavior === McpServerTrust.Kind.Trusted) {
			this._logService.trace(`MCP server ${definition.id} is trusted, no trust prompt needed`);
			return true;
		} else if (collection.trustBehavior === McpServerTrust.Kind.TrustedOnNonce) {
			if (definition.cacheNonce === trustNonceBearer.trustedAtNonce) {
				this._logService.trace(`MCP server ${definition.id} is unchanged, no trust prompt needed`);
				return true;
			}

			if (autoTrustChanges) {
				this._logService.trace(`MCP server ${definition.id} is was changed but user explicitly executed`);
				trustNonceBearer.trustedAtNonce = definition.cacheNonce;
				return true;
			}

			if (trustNonceBearer.trustedAtNonce === notTrustedNonce) {
				if (promptType === 'all-untrusted') {
					if (errorOnUserInteraction) {
						throw new UserInteractionRequiredError('serverTrust');
					}
					return this._promptForTrust(definition, collection, interaction, trustNonceBearer);
				} else {
					this._logService.trace(`MCP server ${definition.id} is untrusted, denying trust prompt`);
					return false;
				}
			}

			if (promptType === 'never') {
				this._logService.trace(`MCP server ${definition.id} trust state is unknown, skipping prompt`);
				return false;
			}

			if (errorOnUserInteraction) {
				throw new UserInteractionRequiredError('serverTrust');
			}

			const didTrust = await this._promptForTrust(definition, collection, interaction, trustNonceBearer);
			if (didTrust) {
				return true;
			}
			if (didTrust === undefined) {
				return undefined;
			}

			trustNonceBearer.trustedAtNonce = notTrustedNonce;
			return false;
		} else {
			assertNever(collection.trustBehavior);
		}
	}

	private async _promptForTrust(definition: McpServerDefinition, collection: McpCollectionDefinition, interaction: McpStartServerInteraction | undefined, trustNonceBearer: { trustedAtNonce: string | undefined }): Promise<boolean> {
		interaction ??= new McpStartServerInteraction();
		interaction.participants.set(definition.id, { s: 'waiting', definition, collection });

		const trustedDefinitionIds = await new Promise<string[] | undefined>(resolve => {
			autorunSelfDisposable(reader => {
				const map = interaction.participants.observable.read(reader);
				if (Iterable.some(map.values(), p => p.s === 'unknown')) {
					return; // wait to gather all calls
				}

				reader.dispose();
				interaction.choice ??= this._promptForTrustOpenDialog(
					[...map.values()].map((v) => v.s === 'waiting' ? v : undefined).filter(isDefined),
				);
				resolve(interaction.choice);
			});
		});

		this._logService.trace(`MCP trusted servers:`, trustedDefinitionIds);

		if (trustedDefinitionIds) {
			trustNonceBearer.trustedAtNonce = trustedDefinitionIds.includes(definition.id)
				? definition.cacheNonce
				: notTrustedNonce;
		}

		return !!trustedDefinitionIds?.includes(definition.id);
	}

	/**
	 * Confirms with the user which of the provided definitions should be trusted.
	 * Returns undefined if the user cancelled the flow, or the list of trusted
	 * definition IDs otherwise.
	 */
	protected async _promptForTrustOpenDialog(definitions: { definition: McpServerDefinition; collection: McpCollectionDefinition }[]): Promise<string[] | undefined> {
		function labelFor(r: { definition: McpServerDefinition; collection: McpCollectionDefinition }) {
			const originURI = r.definition.presentation?.origin?.uri || r.collection.presentation?.origin;
			let labelWithOrigin = originURI ? `[\`${r.definition.label}\`](${originURI})` : '`' + r.definition.label + '`';

			if (r.collection.source instanceof ExtensionIdentifier) {
				labelWithOrigin += ` (${localize('trustFromExt', 'from {0}', r.collection.source.value)})`;
			}

			return labelWithOrigin;
		}

		if (definitions.length === 1) {
			const def = definitions[0];
			const originURI = def.definition.presentation?.origin?.uri;

			const { result } = await this._dialogService.prompt(
				{
					message: localize('trustTitleWithOrigin', 'Trust and run MCP server {0}?', def.definition.label),
					custom: {
						icon: Codicon.shield,
						markdownDetails: [{
							markdown: new MarkdownString(localize('mcp.trust.details', 'The MCP server {0} was updated. MCP servers may add context to your chat session and lead to unexpected behavior. Do you want to trust and run this server?', labelFor(def))),
							actionHandler: () => {
								const editor = this._editorService.openEditor({ resource: originURI! }, AUX_WINDOW_GROUP);
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

			return result === undefined ? undefined : (result ? [def.definition.id] : []);
		}

		const list = definitions.map(d => `- ${labelFor(d)}`).join('\n');
		const { result } = await this._dialogService.prompt(
			{
				message: localize('trustTitleWithOriginMulti', 'Trust and run {0} MCP servers?', definitions.length),
				custom: {
					icon: Codicon.shield,
					markdownDetails: [{
						markdown: new MarkdownString(localize('mcp.trust.detailsMulti', 'Several updated MCP servers were discovered:\n\n{0}\n\n MCP servers may add context to your chat session and lead to unexpected behavior. Do you want to trust and run these server?', list)),
						actionHandler: (uri) => {
							const editor = this._editorService.openEditor({ resource: URI.parse(uri) }, AUX_WINDOW_GROUP);
							return editor.then(Boolean);
						},
					}]
				},
				buttons: [
					{ label: localize('mcp.trust.yes', 'Trust'), run: () => 'all' },
					{ label: localize('mcp.trust.pick', 'Pick Trusted'), run: () => 'pick' },
					{ label: localize('mcp.trust.no', 'Do not trust'), run: () => 'none' },
				],
			},
		);

		if (result === undefined) {
			return undefined;
		} else if (result === 'all') {
			return definitions.map(d => d.definition.id);
		} else if (result === 'none') {
			return [];
		}

		type ActionableButton = IQuickInputButton & { action: () => void };
		function isActionableButton(obj: IQuickInputButton): obj is ActionableButton {
			return typeof (obj as ActionableButton).action === 'function';
		}

		const store = new DisposableStore();
		const picker = store.add(this._quickInputService.createQuickPick<IQuickPickItem & { definitonId: string }>({ useSeparators: false }));
		picker.canSelectMany = true;
		picker.items = definitions.map(({ definition, collection }) => {
			const buttons: ActionableButton[] = [];
			if (definition.presentation?.origin) {
				const origin = definition.presentation.origin;
				buttons.push({
					iconClass: 'codicon-go-to-file',
					tooltip: 'Go to Definition',
					action: () => this._editorService.openEditor({ resource: origin.uri, options: { selection: origin.range } })
				});
			}

			return {
				type: 'item',
				label: definition.label,
				definitonId: definition.id,
				description: collection.source instanceof ExtensionIdentifier
					? collection.source.value
					: (definition.presentation?.origin ? this._labelService.getUriLabel(definition.presentation.origin.uri) : undefined),
				picked: false,
				buttons
			};
		});
		picker.placeholder = 'Select MCP servers to trust';
		picker.ignoreFocusOut = true;

		store.add(picker.onDidTriggerItemButton(e => {
			if (isActionableButton(e.button)) {
				e.button.action();
			}
		}));

		return new Promise<string[] | undefined>(resolve => {
			picker.onDidAccept(() => {
				resolve(picker.selectedItems.map(item => item.definitonId));
				picker.hide();
			});
			picker.onDidHide(() => {
				resolve(undefined);
			});
			picker.show();
		}).finally(() => store.dispose());
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

	private async _replaceVariablesInLaunch(delegate: IMcpHostDelegate, definition: McpServerDefinition, launch: McpServerLaunch, errorOnUserInteraction?: boolean) {
		if (!definition.variableReplacement) {
			return launch;
		}

		const { section, target, folder } = definition.variableReplacement;
		const inputStorage = this._getInputStorageInConfigTarget(target);
		const [previouslyStored, withRemoteFilled] = await Promise.all([
			inputStorage.getMap(),
			delegate.substituteVariables(definition, launch),
		]);

		// pre-fill the variables we already resolved to avoid extra prompting
		const expr = ConfigurationResolverExpression.parse(withRemoteFilled);
		for (const replacement of expr.unresolved()) {
			if (previouslyStored.hasOwnProperty(replacement.id)) {
				expr.resolve(replacement, previouslyStored[replacement.id]);
			}
		}

		// Check if there are still unresolved variables that would require interaction
		if (errorOnUserInteraction) {
			const unresolved = Array.from(expr.unresolved());
			if (unresolved.length > 0) {
				throw new UserInteractionRequiredError('variables');
			}
		}
		// resolve variables requiring user input
		await this._configurationResolverService.resolveWithInteraction(folder, expr, section, undefined, target);

		await this._updateStorageWithExpressionInputs(inputStorage, expr);

		// resolve other non-interactive variables, returning the final object
		return await this._configurationResolverService.resolveAsync(folder, expr);
	}

	public async resolveConnection(opts: IMcpResolveConnectionOptions): Promise<IMcpServerConnection | undefined> {
		const { collectionRef, definitionRef, interaction, logger, debug } = opts;
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

		const trusted = await this._checkTrust(collection, definition, opts);
		interaction?.participants.set(definition.id, { s: 'resolved' });
		if (!trusted) {
			return undefined;
		}

		let launch: McpServerLaunch | undefined = definition.launch;
		if (collection.resolveServerLanch) {
			launch = await collection.resolveServerLanch(definition);
			if (!launch) {
				return undefined; // interaction cancelled by user
			}
		}

		try {
			launch = await this._replaceVariablesInLaunch(delegate, definition, launch, opts.errorOnUserInteraction);

			if (definition.devMode && debug) {
				launch = await this._instantiationService.invokeFunction(accessor => accessor.get(IMcpDevModeDebugging).transform(definition, launch!));
			}
		} catch (e) {
			if (e instanceof UserInteractionRequiredError) {
				throw e;
			}

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
			opts.errorOnUserInteraction,
		);
	}
}
