/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { assertNever } from '../../../../base/common/assert.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, autorunSelfDisposable } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mcpAccessConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IMcpDevModeDebugging } from './mcpDevMode.js';
import { McpRegistryInputStorage } from './mcpRegistryInputStorage.js';
import { IMcpSandboxService } from './mcpSandboxService.js';
import { McpServerConnection } from './mcpServerConnection.js';
import { McpStartServerInteraction, UserInteractionRequiredError } from './mcpTypes.js';
const notTrustedNonce = '__vscode_not_trusted';
let McpRegistry = class McpRegistry extends Disposable {
    get delegates() {
        return this._delegates;
    }
    constructor(_instantiationService, _configurationResolverService, _dialogService, _notificationService, _editorService, configurationService, _quickInputService, _labelService, _logService, _mcpSandboxService, _workspaceTrustManagementService, _workspaceTrustRequestService) {
        super();
        this._instantiationService = _instantiationService;
        this._configurationResolverService = _configurationResolverService;
        this._dialogService = _dialogService;
        this._notificationService = _notificationService;
        this._editorService = _editorService;
        this._quickInputService = _quickInputService;
        this._labelService = _labelService;
        this._logService = _logService;
        this._mcpSandboxService = _mcpSandboxService;
        this._workspaceTrustManagementService = _workspaceTrustManagementService;
        this._workspaceTrustRequestService = _workspaceTrustRequestService;
        this._collections = observableValue('collections', []);
        this._delegates = observableValue('delegates', []);
        this.collections = derived(reader => {
            if (this._mcpAccessValue.read(reader) === "none" /* McpAccessValue.None */) {
                return [];
            }
            return this._collections.read(reader);
        });
        this._workspaceStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */)));
        this._profileStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */)));
        this._ongoingLazyActivations = observableValue(this, 0);
        this.lazyCollectionState = derived(reader => {
            if (this._mcpAccessValue.read(reader) === "none" /* McpAccessValue.None */) {
                return { state: 2 /* LazyCollectionState.AllKnown */, collections: [] };
            }
            if (this._ongoingLazyActivations.read(reader) > 0) {
                return { state: 1 /* LazyCollectionState.LoadingUnknown */, collections: [] };
            }
            const collections = this._collections.read(reader);
            const hasUnknown = collections.some(c => c.lazy && c.lazy.isCached === false);
            return hasUnknown ? { state: 0 /* LazyCollectionState.HasUnknown */, collections: collections.filter(c => c.lazy && c.lazy.isCached === false) } : { state: 2 /* LazyCollectionState.AllKnown */, collections: [] };
        });
        this._onDidChangeInputs = this._register(new Emitter());
        this.onDidChangeInputs = this._onDidChangeInputs.event;
        this._mcpAccessValue = observableConfigValue(mcpAccessConfig, "all" /* McpAccessValue.All */, configurationService);
    }
    registerDelegate(delegate) {
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
    registerCollection(collection) {
        const currentCollections = this._collections.get();
        const toReplace = currentCollections.find(c => c.id === collection.id);
        // Incoming collections replace the "lazy" versions. See `ExtensionMcpDiscovery` for an example.
        if (toReplace && !toReplace.lazy) {
            return Disposable.None;
        }
        else if (toReplace) {
            this._collections.set(currentCollections.map(c => c === toReplace ? collection : c), undefined);
        }
        else {
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
    getServerDefinition(collectionRef, definitionRef) {
        const collectionObs = this._collections.map(cols => cols.find(c => c.id === collectionRef.id));
        return collectionObs.map((collection, reader) => {
            const server = collection?.serverDefinitions.read(reader).find(s => s.id === definitionRef.id);
            return { collection, server };
        });
    }
    async discoverCollections() {
        const toDiscover = this._collections.get().filter(c => c.lazy && !c.lazy.isCached);
        this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() + 1, undefined);
        await Promise.all(toDiscover.map(c => c.lazy?.load())).finally(() => {
            this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() - 1, undefined);
        });
        const found = [];
        const current = this._collections.get();
        for (const collection of toDiscover) {
            const rec = current.find(c => c.id === collection.id);
            if (!rec) {
                // ignored
            }
            else if (rec.lazy) {
                rec.lazy.removed?.(); // did not get replaced by the non-lazy version
            }
            else {
                found.push(rec);
            }
        }
        return found;
    }
    _getInputStorage(scope) {
        return scope === 1 /* StorageScope.WORKSPACE */ ? this._workspaceStorage.value : this._profileStorage.value;
    }
    _getInputStorageInConfigTarget(configTarget) {
        return this._getInputStorage(configTarget === 5 /* ConfigurationTarget.WORKSPACE */ || configTarget === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */
            ? 1 /* StorageScope.WORKSPACE */
            : 0 /* StorageScope.PROFILE */);
    }
    async clearSavedInputs(scope, inputId) {
        const storage = this._getInputStorage(scope);
        if (inputId) {
            await storage.clear(inputId);
        }
        else {
            storage.clearAll();
        }
        this._onDidChangeInputs.fire();
    }
    async editSavedInput(inputId, folderData, configSection, target) {
        const storage = this._getInputStorageInConfigTarget(target);
        const expr = ConfigurationResolverExpression.parse(inputId);
        const stored = await storage.getMap();
        const previous = stored[inputId].value;
        await this._configurationResolverService.resolveWithInteraction(folderData, expr, configSection, previous ? { [inputId.slice(2, -1)]: previous } : {}, target);
        await this._updateStorageWithExpressionInputs(storage, expr);
    }
    async setSavedInput(inputId, target, value) {
        const storage = this._getInputStorageInConfigTarget(target);
        const expr = ConfigurationResolverExpression.parse(inputId);
        for (const unresolved of expr.unresolved()) {
            expr.resolve(unresolved, value);
            break;
        }
        await this._updateStorageWithExpressionInputs(storage, expr);
    }
    getSavedInputs(scope) {
        return this._getInputStorage(scope).getMap();
    }
    async _checkTrust(collection, definition, { trustNonceBearer, interaction, promptType = 'only-new', autoTrustChanges = false, errorOnUserInteraction = false, }) {
        if (collection.scope === 1 /* StorageScope.WORKSPACE */ && !this._workspaceTrustManagementService.isWorkspaceTrusted()) {
            if (errorOnUserInteraction) {
                throw new UserInteractionRequiredError('workspaceTrust');
            }
            else if (!await this._workspaceTrustRequestService.requestWorkspaceTrust({ message: localize('runTrust', "This MCP server definition is defined in your workspace files.") })) {
                return false;
            }
        }
        if (collection.trustBehavior === 0 /* McpServerTrust.Kind.Trusted */) {
            this._logService.trace(`MCP server ${definition.id} is trusted, no trust prompt needed`);
            return true;
        }
        else if (collection.trustBehavior === 1 /* McpServerTrust.Kind.TrustedOnNonce */) {
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
                }
                else {
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
        }
        else {
            assertNever(collection.trustBehavior);
        }
    }
    async _promptForTrust(definition, collection, interaction, trustNonceBearer) {
        interaction ??= new McpStartServerInteraction();
        interaction.participants.set(definition.id, { s: 'waiting', definition, collection });
        const trustedDefinitionIds = await new Promise(resolve => {
            autorunSelfDisposable(reader => {
                const map = interaction.participants.observable.read(reader);
                if (Iterable.some(map.values(), p => p.s === 'unknown')) {
                    return; // wait to gather all calls
                }
                reader.dispose();
                interaction.choice ??= this._promptForTrustOpenDialog([...map.values()].map((v) => v.s === 'waiting' ? v : undefined).filter(isDefined));
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
    async _promptForTrustOpenDialog(definitions) {
        function labelFor(r) {
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
            const { result } = await this._dialogService.prompt({
                message: localize('trustTitleWithOrigin', 'Trust and run MCP server {0}?', def.definition.label),
                custom: {
                    icon: Codicon.shield,
                    markdownDetails: [{
                            markdown: new MarkdownString(localize('mcp.trust.details', 'The MCP server {0} was updated. MCP servers may add context to your chat session and lead to unexpected behavior. Do you want to trust and run this server?', labelFor(def))),
                            actionHandler: () => {
                                const editor = this._editorService.openEditor({ resource: originURI }, AUX_WINDOW_GROUP);
                                return editor.then(Boolean);
                            },
                        }]
                },
                buttons: [
                    { label: localize('mcp.trust.yes', 'Trust'), run: () => true },
                    { label: localize('mcp.trust.no', 'Do not trust'), run: () => false }
                ],
            });
            return result === undefined ? undefined : (result ? [def.definition.id] : []);
        }
        const list = definitions.map(d => `- ${labelFor(d)}`).join('\n');
        const { result } = await this._dialogService.prompt({
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
        });
        if (result === undefined) {
            return undefined;
        }
        else if (result === 'all') {
            return definitions.map(d => d.definition.id);
        }
        else if (result === 'none') {
            return [];
        }
        function isActionableButton(obj) {
            return typeof obj.action === 'function';
        }
        const store = new DisposableStore();
        const picker = store.add(this._quickInputService.createQuickPick({ useSeparators: false }));
        picker.canSelectMany = true;
        picker.items = definitions.map(({ definition, collection }) => {
            const buttons = [];
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
        return new Promise(resolve => {
            store.add(picker.onDidAccept(() => {
                resolve(picker.selectedItems.map(item => item.definitonId));
                picker.hide();
            }));
            store.add(picker.onDidHide(() => {
                resolve(undefined);
            }));
            picker.show();
        }).finally(() => store.dispose());
    }
    async _updateStorageWithExpressionInputs(inputStorage, expr) {
        const secrets = {};
        const inputs = {};
        for (const [replacement, resolved] of expr.resolved()) {
            if (resolved.input?.type === 'promptString' && resolved.input.password) {
                secrets[replacement.id] = resolved;
            }
            else {
                inputs[replacement.id] = resolved;
            }
        }
        inputStorage.setPlainText(inputs);
        await inputStorage.setSecrets(secrets);
        this._onDidChangeInputs.fire();
    }
    async _replaceVariablesInLaunch(delegate, definition, launch, errorOnUserInteraction) {
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
    async resolveConnection(opts) {
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
        let launch = definition.launch;
        if (collection.resolveServerLanch) {
            launch = await collection.resolveServerLanch(definition);
            if (!launch) {
                return undefined; // interaction cancelled by user
            }
        }
        try {
            launch = await this._replaceVariablesInLaunch(delegate, definition, launch, opts.errorOnUserInteraction);
            if (definition.devMode && debug) {
                launch = await this._instantiationService.invokeFunction(accessor => accessor.get(IMcpDevModeDebugging).transform(definition, launch));
            }
            // If sandbox is enabled for this server, attempt to launch in sandbox
            launch = await this._mcpSandboxService.launchInSandboxIfEnabled(definition, launch, collection.remoteAuthority ?? undefined, collection.configTarget);
        }
        catch (e) {
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
                                resource: collection.presentation.origin,
                                options: { selection: definition.presentation?.origin?.range }
                            }),
                        }
                    ]
                }
            });
            return;
        }
        return this._instantiationService.createInstance(McpServerConnection, collection, definition, delegate, launch, logger, opts.errorOnUserInteraction, opts.taskManager);
    }
};
McpRegistry = __decorate([
    __param(0, IInstantiationService),
    __param(1, IConfigurationResolverService),
    __param(2, IDialogService),
    __param(3, INotificationService),
    __param(4, IEditorService),
    __param(5, IConfigurationService),
    __param(6, IQuickInputService),
    __param(7, ILabelService),
    __param(8, ILogService),
    __param(9, IMcpSandboxService),
    __param(10, IWorkspaceTrustManagementService),
    __param(11, IWorkspaceTrustRequestService)
], McpRegistry);
export { McpRegistry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFJlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBZSxlQUFlLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNySCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDeEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxh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