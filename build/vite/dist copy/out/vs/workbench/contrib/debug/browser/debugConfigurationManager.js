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
import { distinct } from '../../../../base/common/arrays.js';
import { sequence } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import * as json from '../../../../base/common/json.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import * as resources from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI as uri } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { OS } from '../../../../base/common/platform.js';
import { launchSchemaId } from '../../../services/configuration/common/configuration.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { CONTEXT_DEBUG_CONFIGURATION_TYPE, DebugConfigurationProviderTriggerKind, isDebugConfig } from '../common/debug.js';
import { launchSchema } from '../common/debugSchemas.js';
import { getEffectiveConfigForPlatform, getVisibleAndSorted } from '../common/debugUtils.js';
import { debugConfigure } from './debugIcons.js';
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema(launchSchemaId, launchSchema);
const DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';
const DEBUG_SELECTED_ROOT = 'debug.selectedroot';
// Debug type is only stored if a dynamic configuration is used for better restore
const DEBUG_SELECTED_TYPE = 'debug.selectedtype';
const DEBUG_RECENT_DYNAMIC_CONFIGURATIONS = 'debug.recentdynamicconfigurations';
const ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME = 'onDebugDynamicConfigurations';
let ConfigurationManager = class ConfigurationManager {
    constructor(adapterManager, contextService, configurationService, quickInputService, instantiationService, storageService, extensionService, historyService, uriIdentityService, remoteAgentService, contextKeyService, logService) {
        this.adapterManager = adapterManager;
        this.contextService = contextService;
        this.configurationService = configurationService;
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.storageService = storageService;
        this.extensionService = extensionService;
        this.historyService = historyService;
        this.uriIdentityService = uriIdentityService;
        this.remoteAgentService = remoteAgentService;
        this.logService = logService;
        this.getSelectedConfig = () => Promise.resolve(undefined);
        this.selectedDynamic = false;
        this._onDidSelectConfigurationName = new Emitter();
        this._onDidChangeConfigurationProviders = new Emitter();
        this.onDidChangeConfigurationProviders = this._onDidChangeConfigurationProviders.event;
        this.targetOperatingSystem = OS;
        this.configProviders = [];
        this.toDispose = [this._onDidChangeConfigurationProviders, this._onDidSelectConfigurationName];
        this.initLaunches();
        this.setCompoundSchemaValues();
        this.registerListeners();
        const previousSelectedRoot = this.storageService.get(DEBUG_SELECTED_ROOT, 1 /* StorageScope.WORKSPACE */);
        const previousSelectedType = this.storageService.get(DEBUG_SELECTED_TYPE, 1 /* StorageScope.WORKSPACE */);
        const previousSelectedLaunch = this.launches.find(l => l.uri.toString() === previousSelectedRoot);
        const previousSelectedName = this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, 1 /* StorageScope.WORKSPACE */);
        this.debugConfigurationTypeContext = CONTEXT_DEBUG_CONFIGURATION_TYPE.bindTo(contextKeyService);
        const dynamicConfig = previousSelectedType ? { type: previousSelectedType } : undefined;
        if (previousSelectedLaunch && previousSelectedLaunch.getConfigurationNames().length) {
            this.selectConfiguration(previousSelectedLaunch, previousSelectedName, undefined, dynamicConfig);
        }
        else if (this.launches.length > 0) {
            this.selectConfiguration(undefined, previousSelectedName, undefined, dynamicConfig);
        }
        this.resolveTargetOperatingSystem();
    }
    resolveTargetOperatingSystem() {
        this.remoteAgentService.getEnvironment().then(environment => {
            const targetOperatingSystem = environment?.os ?? OS;
            if (this.targetOperatingSystem !== targetOperatingSystem) {
                this.targetOperatingSystem = targetOperatingSystem;
                this._onDidSelectConfigurationName.fire();
            }
        }, () => {
            // Ignore remote environment failures and fall back to the local OS.
        });
    }
    getTargetOperatingSystem() {
        return this.targetOperatingSystem;
    }
    registerDebugConfigurationProvider(debugConfigurationProvider) {
        this.configProviders.push(debugConfigurationProvider);
        this._onDidChangeConfigurationProviders.fire();
        return {
            dispose: () => {
                this.unregisterDebugConfigurationProvider(debugConfigurationProvider);
                this._onDidChangeConfigurationProviders.fire();
            }
        };
    }
    unregisterDebugConfigurationProvider(debugConfigurationProvider) {
        const ix = this.configProviders.indexOf(debugConfigurationProvider);
        if (ix >= 0) {
            this.configProviders.splice(ix, 1);
        }
    }
    /**
     * if scope is not specified,a value of DebugConfigurationProvideTrigger.Initial is assumed.
     */
    hasDebugConfigurationProvider(debugType, triggerKind) {
        if (triggerKind === undefined) {
            triggerKind = DebugConfigurationProviderTriggerKind.Initial;
        }
        // check if there are providers for the given type that contribute a provideDebugConfigurations method
        const provider = this.configProviders.find(p => p.provideDebugConfigurations && (p.type === debugType) && (p.triggerKind === triggerKind));
        return !!provider;
    }
    async resolveConfigurationByProviders(folderUri, type, config, token) {
        const resolveDebugConfigurationForType = async (type, config) => {
            if (type !== '*') {
                await this.adapterManager.activateDebuggers('onDebugResolve', type);
            }
            for (const p of this.configProviders) {
                if (p.type === type && p.resolveDebugConfiguration && config) {
                    config = await p.resolveDebugConfiguration(folderUri, config, token);
                }
            }
            return config;
        };
        let resolvedType = config.type ?? type;
        let result = config;
        for (let seen = new Set(); result && !seen.has(resolvedType);) {
            seen.add(resolvedType);
            result = await resolveDebugConfigurationForType(resolvedType, result);
            result = await resolveDebugConfigurationForType('*', result);
            resolvedType = result?.type ?? type;
        }
        return result;
    }
    async resolveDebugConfigurationWithSubstitutedVariables(folderUri, type, config, token) {
        // pipe the config through the promises sequentially. Append at the end the '*' types
        const providers = this.configProviders.filter(p => p.type === type && p.resolveDebugConfigurationWithSubstitutedVariables)
            .concat(this.configProviders.filter(p => p.type === '*' && p.resolveDebugConfigurationWithSubstitutedVariables));
        let result = config;
        await sequence(providers.map(provider => async () => {
            // If any provider returned undefined or null make sure to respect that and do not pass the result to more resolver
            if (result) {
                result = await provider.resolveDebugConfigurationWithSubstitutedVariables(folderUri, result, token);
            }
        }));
        return result;
    }
    async provideDebugConfigurations(folderUri, type, token) {
        await this.adapterManager.activateDebuggers('onDebugInitialConfigurations');
        const results = await Promise.all(this.configProviders.filter(p => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Initial && p.provideDebugConfigurations).map(p => p.provideDebugConfigurations(folderUri, token)));
        return results.reduce((first, second) => first.concat(second), []);
    }
    async getDynamicProviders() {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const debugDynamicExtensionsTypes = this.extensionService.extensions.reduce((acc, e) => {
            if (!e.activationEvents) {
                return acc;
            }
            const explicitTypes = [];
            let hasGenericEvent = false;
            for (const event of e.activationEvents) {
                if (event === ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME) {
                    hasGenericEvent = true;
                }
                else if (event.startsWith(`${ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME}:`)) {
                    explicitTypes.push(event.slice(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME.length + 1));
                }
            }
            if (explicitTypes.length) {
                explicitTypes.forEach(t => acc.add(t));
            }
            else if (hasGenericEvent) {
                const debuggerType = e.contributes?.debuggers?.[0].type;
                if (debuggerType) {
                    acc.add(debuggerType);
                }
            }
            return acc;
        }, new Set());
        for (const configProvider of this.configProviders) {
            if (configProvider.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic) {
                debugDynamicExtensionsTypes.add(configProvider.type);
            }
        }
        return [...debugDynamicExtensionsTypes].map(type => {
            return {
                label: this.adapterManager.getDebuggerLabel(type),
                getProvider: async () => {
                    await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
                    return this.configProviders.find(p => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
                },
                type,
                pick: async () => {
                    // Do a late 'onDebugDynamicConfigurationsName' activation so extensions are not activated too early #108578
                    await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
                    const disposables = new DisposableStore();
                    const token = new CancellationTokenSource();
                    disposables.add(token);
                    const input = disposables.add(this.quickInputService.createQuickPick());
                    input.busy = true;
                    input.placeholder = nls.localize('selectConfiguration', "Select Launch Configuration");
                    const chosenPromise = new Promise(resolve => {
                        disposables.add(input.onDidAccept(() => resolve(input.activeItems[0])));
                        disposables.add(input.onDidTriggerItemButton(async (context) => {
                            resolve(undefined);
                            const { launch, config } = context.item;
                            await launch.openConfigFile({ preserveFocus: false, type: config.type, suppressInitialConfigs: true });
                            // Only Launch have a pin trigger button
                            await launch.writeConfiguration(config);
                            await this.selectConfiguration(launch, config.name);
                            this.removeRecentDynamicConfigurations(config.name, config.type);
                        }));
                        disposables.add(input.onDidHide(() => resolve(undefined)));
                    }).finally(() => token.cancel());
                    let items;
                    try {
                        // This await invokes the extension providers, which might fail due to several reasons,
                        // therefore we gate this logic under a try/catch to prevent leaving the Debug Tab
                        // selector in a borked state.
                        items = await this.getDynamicConfigurationsByType(type, token.token);
                    }
                    catch (err) {
                        this.logService.error(err);
                        disposables.dispose();
                        return;
                    }
                    input.items = items;
                    input.busy = false;
                    input.show();
                    const chosen = await chosenPromise;
                    disposables.dispose();
                    return chosen;
                }
            };
        });
    }
    async getDynamicConfigurationsByType(type, token = CancellationToken.None) {
        // Do a late 'onDebugDynamicConfigurationsName' activation so extensions are not activated too early #108578
        await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
        const picks = [];
        const provider = this.configProviders.find(p => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
        this.getLaunches().forEach(launch => {
            if (provider) {
                picks.push(provider.provideDebugConfigurations(launch.workspace?.uri, token).then(configurations => configurations.map(config => ({
                    label: config.name,
                    description: launch.name,
                    config,
                    buttons: [{
                            iconClass: ThemeIcon.asClassName(debugConfigure),
                            tooltip: nls.localize('editLaunchConfig', "Edit Debug Configuration in launch.json")
                        }],
                    launch
                }))));
            }
        });
        return (await Promise.all(picks)).flat();
    }
    getAllConfigurations() {
        const all = [];
        for (const l of this.launches) {
            for (const name of l.getConfigurationNames()) {
                const config = l.getConfiguration(name) || l.getCompound(name);
                if (config) {
                    all.push({ launch: l, name, presentation: config.presentation });
                }
            }
        }
        return getVisibleAndSorted(all);
    }
    removeRecentDynamicConfigurations(name, type) {
        const remaining = this.getRecentDynamicConfigurations().filter(c => c.name !== name || c.type !== type);
        this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(remaining), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        if (this.selectedConfiguration.name === name && this.selectedType === type && this.selectedDynamic) {
            this.selectConfiguration(undefined, undefined);
        }
        else {
            this._onDidSelectConfigurationName.fire();
        }
    }
    getRecentDynamicConfigurations() {
        return JSON.parse(this.storageService.get(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, 1 /* StorageScope.WORKSPACE */, '[]'));
    }
    registerListeners() {
        this.toDispose.push(Event.any(this.contextService.onDidChangeWorkspaceFolders, this.contextService.onDidChangeWorkbenchState)(() => {
            this.initLaunches();
            this.selectConfiguration(undefined);
            this.setCompoundSchemaValues();
        }));
        this.toDispose.push(this.configurationService.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('launch')) {
                // A change happen in the launch.json. If there is already a launch configuration selected, do not change the selection.
                await this.selectConfiguration(undefined);
                this.setCompoundSchemaValues();
            }
        }));
        this.toDispose.push(this.adapterManager.onDidDebuggersExtPointRead(() => {
            this.setCompoundSchemaValues();
        }));
    }
    initLaunches() {
        this.launches = this.contextService.getWorkspace().folders.map(folder => this.instantiationService.createInstance(Launch, this, this.adapterManager, folder));
        if (this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            this.launches.push(this.instantiationService.createInstance(WorkspaceLaunch, this, this.adapterManager));
        }
        this.launches.push(this.instantiationService.createInstance(UserLaunch, this, this.adapterManager));
        if (this.selectedLaunch && this.launches.indexOf(this.selectedLaunch) === -1) {
            this.selectConfiguration(undefined);
        }
    }
    setCompoundSchemaValues() {
        const compoundConfigurationsSchema = launchSchema.properties['compounds'].items.properties['configurations'];
        const launchNames = this.launches.map(l => l.getConfigurationNames(true)).reduce((first, second) => first.concat(second), []);
        compoundConfigurationsSchema.items.oneOf[0].enum = launchNames;
        compoundConfigurationsSchema.items.oneOf[1].properties.name.enum = launchNames;
        const folderNames = this.contextService.getWorkspace().folders.map(f => f.name);
        compoundConfigurationsSchema.items.oneOf[1].properties.folder.enum = folderNames;
        jsonRegistry.registerSchema(launchSchemaId, launchSchema);
    }
    getLaunches() {
        return this.launches;
    }
    getLaunch(workspaceUri) {
        if (!uri.isUri(workspaceUri)) {
            return undefined;
        }
        return this.launches.find(l => l.workspace && this.uriIdentityService.extUri.isEqual(l.workspace.uri, workspaceUri));
    }
    get selectedConfiguration() {
        return {
            launch: this.selectedLaunch,
            name: this.selectedName,
            getConfig: this.getSelectedConfig,
            type: this.selectedType
        };
    }
    get onDidSelectConfiguration() {
        return this._onDidSelectConfigurationName.event;
    }
    getWorkspaceLaunch() {
        if (this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            return this.launches[this.launches.length - 1];
        }
        return undefined;
    }
    async selectConfiguration(launch, name, config, dynamicConfig) {
        if (typeof launch === 'undefined') {
            const rootUri = this.historyService.getLastActiveWorkspaceRoot();
            launch = this.getLaunch(rootUri);
            if (!launch || launch.getConfigurationNames().length === 0) {
                launch = this.launches.find(l => !!(l && l.getConfigurationNames().length)) || launch || this.launches[0];
            }
        }
        const previousLaunch = this.selectedLaunch;
        const previousName = this.selectedName;
        const previousSelectedDynamic = this.selectedDynamic;
        this.selectedLaunch = launch;
        if (this.selectedLaunch) {
            this.storageService.store(DEBUG_SELECTED_ROOT, this.selectedLaunch.uri.toString(), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(DEBUG_SELECTED_ROOT, 1 /* StorageScope.WORKSPACE */);
        }
        const names = launch ? launch.getConfigurationNames() : [];
        this.getSelectedConfig = () => {
            const selected = this.selectedName ? launch?.getConfiguration(this.selectedName) : undefined;
            return Promise.resolve(selected || config);
        };
        let type = config?.type;
        if (name && names.indexOf(name) >= 0) {
            this.setSelectedLaunchName(name);
        }
        else if (dynamicConfig && dynamicConfig.type) {
            // We could not find the previously used name and config is not passed. We should get all dynamic configurations from providers
            // And potentially auto select the previously used dynamic configuration #96293
            type = dynamicConfig.type;
            if (!config) {
                const providers = (await this.getDynamicProviders()).filter(p => p.type === type);
                this.getSelectedConfig = async () => {
                    const activatedProviders = await Promise.all(providers.map(p => p.getProvider()));
                    const provider = activatedProviders.length > 0 ? activatedProviders[0] : undefined;
                    if (provider && launch && launch.workspace) {
                        const token = new CancellationTokenSource();
                        const dynamicConfigs = await provider.provideDebugConfigurations(launch.workspace.uri, token.token);
                        const dynamicConfig = dynamicConfigs.find(c => c.name === name);
                        if (dynamicConfig) {
                            return dynamicConfig;
                        }
                    }
                    return undefined;
                };
            }
            this.setSelectedLaunchName(name);
            let recentDynamicProviders = this.getRecentDynamicConfigurations();
            if (name && dynamicConfig.type) {
                // We need to store the recently used dynamic configurations to be able to show them in UI #110009
                recentDynamicProviders.unshift({ name, type: dynamicConfig.type });
                recentDynamicProviders = distinct(recentDynamicProviders, t => `${t.name} : ${t.type}`);
                this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(recentDynamicProviders), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            }
        }
        else if (!this.selectedName || names.indexOf(this.selectedName) === -1) {
            // We could not find the configuration to select, pick the first one, or reset the selection if there is no launch configuration
            const nameToSet = names.length ? names[0] : undefined;
            this.setSelectedLaunchName(nameToSet);
        }
        if (!config && launch && this.selectedName) {
            config = launch.getConfiguration(this.selectedName);
            type = config?.type;
        }
        this.selectedType = dynamicConfig?.type || config?.type;
        this.selectedDynamic = !!dynamicConfig;
        // Only store the selected type if we are having a dynamic configuration. Otherwise restoring this configuration from storage might be misindentified as a dynamic configuration
        this.storageService.store(DEBUG_SELECTED_TYPE, dynamicConfig ? this.selectedType : undefined, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        if (type) {
            this.debugConfigurationTypeContext.set(type);
        }
        else {
            this.debugConfigurationTypeContext.reset();
        }
        if (this.selectedLaunch !== previousLaunch || this.selectedName !== previousName || previousSelectedDynamic !== this.selectedDynamic) {
            this._onDidSelectConfigurationName.fire();
        }
    }
    setSelectedLaunchName(selectedName) {
        this.selectedName = selectedName;
        if (this.selectedName) {
            this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.selectedName, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(DEBUG_SELECTED_CONFIG_NAME_KEY, 1 /* StorageScope.WORKSPACE */);
        }
    }
    dispose() {
        this.toDispose = dispose(this.toDispose);
    }
};
ConfigurationManager = __decorate([
    __param(1, IWorkspaceContextService),
    __param(2, IConfigurationService),
    __param(3, IQuickInputService),
    __param(4, IInstantiationService),
    __param(5, IStorageService),
    __param(6, IExtensionService),
    __param(7, IHistoryService),
    __param(8, IUriIdentityService),
    __param(9, IRemoteAgentService),
    __param(10, IContextKeyService),
    __param(11, ILogService)
], ConfigurationManager);
export { ConfigurationManager };
class AbstractLaunch {
    constructor(configurationManager, adapterManager) {
        this.configurationManager = configurationManager;
        this.adapterManager = adapterManager;
    }
    getCompound(name) {
        const config = this.getDeduplicatedConfig();
        if (!config || !config.compounds) {
            return undefined;
        }
        return config.compounds.find(compound => compound.name === name);
    }
    getConfigurationNames(ignoreCompoundsAndPresentation = false) {
        const config = this.getDeduplicatedConfig();
        if (!config || (!Array.isArray(config.configurations) && !Array.isArray(config.compounds))) {
            return [];
        }
        else {
            const configurations = [];
            if (config.configurations) {
                configurations.push(...config.configurations.filter(cfg => cfg && typeof cfg.name === 'string'));
            }
            if (ignoreCompoundsAndPresentation) {
                return configurations.map(c => c.name);
            }
            if (config.compounds) {
                configurations.push(...config.compounds.filter(compound => typeof compound.name === 'string' && compound.configurations && compound.configurations.length));
            }
            const resolved = configurations.map(c => isDebugConfig(c) ? getEffectiveConfigForPlatform(c, this.configurationManager.getTargetOperatingSystem()) : c);
            return getVisibleAndSorted(resolved).map(c => c.name);
        }
    }
    getConfiguration(name) {
        // We need to clone the configuration in order to be able to make changes to it #42198
        const config = this.getDeduplicatedConfig();
        if (!config || !config.configurations) {
            return undefined;
        }
        const configuration = config.configurations.find(config => config && config.name === name);
        if (!configuration) {
            return;
        }
        const effectiveConfiguration = getEffectiveConfigForPlatform(configuration, this.configurationManager.getTargetOperatingSystem());
        if (this instanceof UserLaunch) {
            return { ...effectiveConfiguration, __configurationTarget: 2 /* ConfigurationTarget.USER */ };
        }
        else if (this instanceof WorkspaceLaunch) {
            return { ...effectiveConfiguration, __configurationTarget: 5 /* ConfigurationTarget.WORKSPACE */ };
        }
        else {
            return { ...effectiveConfiguration, __configurationTarget: 6 /* ConfigurationTarget.WORKSPACE_FOLDER */ };
        }
    }
    async getInitialConfigurationContent(folderUri, type, useInitialConfigs, token) {
        let content = '';
        const adapter = type
            ? { debugger: this.adapterManager.getEnabledDebugger(type) }
            : await this.adapterManager.guessDebugger(true);
        if (adapter?.withConfig && adapter.debugger) {
            content = await adapter.debugger.getInitialConfigurationContent([adapter.withConfig.config]);
        }
        else if (adapter?.debugger) {
            const initialConfigs = useInitialConfigs ?
                await this.configurationManager.provideDebugConfigurations(folderUri, adapter.debugger.type, token || CancellationToken.None) :
                [];
            content = await adapter.debugger.getInitialConfigurationContent(initialConfigs);
        }
        return content;
    }
    get hidden() {
        return false;
    }
    getDeduplicatedConfig() {
        const original = this.getConfig();
        return original && {
            version: original.version,
            compounds: original.compounds && distinguishConfigsByName(original.compounds),
            configurations: original.configurations && distinguishConfigsByName(original.configurations),
        };
    }
}
function distinguishConfigsByName(things) {
    const seen = new Map();
    return things.map(thing => {
        const no = seen.get(thing.name) || 0;
        seen.set(thing.name, no + 1);
        return no === 0 ? thing : { ...thing, name: `${thing.name} (${no})` };
    });
}
let Launch = class Launch extends AbstractLaunch {
    constructor(configurationManager, adapterManager, workspace, fileService, textFileService, editorService, configurationService) {
        super(configurationManager, adapterManager);
        this.workspace = workspace;
        this.fileService = fileService;
        this.textFileService = textFileService;
        this.editorService = editorService;
        this.configurationService = configurationService;
    }
    get uri() {
        return resources.joinPath(this.workspace.uri, '/.vscode/launch.json');
    }
    get name() {
        return this.workspace.name;
    }
    getConfig() {
        return this.configurationService.inspect('launch', { resource: this.workspace.uri }).workspaceFolderValue;
    }
    async openConfigFile({ preserveFocus, type, suppressInitialConfigs }, token) {
        const resource = this.uri;
        let created = false;
        let content = '';
        try {
            const fileContent = await this.fileService.readFile(resource);
            content = fileContent.value.toString();
        }
        catch {
            // launch.json not found: create one by collecting launch configs from debugConfigProviders
            content = await this.getInitialConfigurationContent(this.workspace.uri, type, !suppressInitialConfigs, token);
            if (!content) {
                // Cancelled
                return { editor: null, created: false };
            }
            created = true; // pin only if config file is created #8727
            try {
                await this.textFileService.write(resource, content);
            }
            catch (error) {
                throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error.message));
            }
        }
        const index = content.indexOf(`"${this.configurationManager.selectedConfiguration.name}"`);
        let startLineNumber = 1;
        for (let i = 0; i < index; i++) {
            if (content.charAt(i) === '\n') {
                startLineNumber++;
            }
        }
        const selection = startLineNumber > 1 ? { startLineNumber, startColumn: 4 } : undefined;
        const editor = await this.editorService.openEditor({
            resource,
            options: {
                selection,
                preserveFocus,
                pinned: created,
                revealIfVisible: true
            },
        }, ACTIVE_GROUP);
        return ({
            editor: editor ?? null,
            created
        });
    }
    async writeConfiguration(configuration) {
        // note: we don't get the deduplicated config since we don't want that to 'leak' into the file
        const fullConfig = { ...(this.getConfig() ?? {}) };
        fullConfig.configurations = [...fullConfig.configurations || [], configuration];
        await this.configurationService.updateValue('launch', fullConfig, { resource: this.workspace.uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
    }
};
Launch = __decorate([
    __param(3, IFileService),
    __param(4, ITextFileService),
    __param(5, IEditorService),
    __param(6, IConfigurationService)
], Launch);
let WorkspaceLaunch = class WorkspaceLaunch extends AbstractLaunch {
    constructor(configurationManager, adapterManager, editorService, configurationService, contextService) {
        super(configurationManager, adapterManager);
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.contextService = contextService;
    }
    get workspace() {
        return undefined;
    }
    get uri() {
        return this.contextService.getWorkspace().configuration;
    }
    get name() {
        return nls.localize('workspace', "workspace");
    }
    getConfig() {
        return this.configurationService.inspect('launch').workspaceValue;
    }
    async openConfigFile({ preserveFocus, type, useInitialConfigs }, token) {
        const launchExistInFile = !!this.getConfig();
        if (!launchExistInFile) {
            // Launch property in workspace config not found: create one by collecting launch configs from debugConfigProviders
            const content = await this.getInitialConfigurationContent(undefined, type, useInitialConfigs, token);
            if (content) {
                await this.configurationService.updateValue('launch', json.parse(content), 5 /* ConfigurationTarget.WORKSPACE */);
            }
            else {
                return { editor: null, created: false };
            }
        }
        const editor = await this.editorService.openEditor({
            resource: this.contextService.getWorkspace().configuration,
            options: { preserveFocus }
        }, ACTIVE_GROUP);
        return ({
            editor: editor ?? null,
            created: false
        });
    }
};
WorkspaceLaunch = __decorate([
    __param(2, IEditorService),
    __param(3, IConfigurationService),
    __param(4, IWorkspaceContextService)
], WorkspaceLaunch);
let UserLaunch = class UserLaunch extends AbstractLaunch {
    constructor(configurationManager, adapterManager, configurationService, preferencesService) {
        super(configurationManager, adapterManager);
        this.configurationService = configurationService;
        this.preferencesService = preferencesService;
    }
    get workspace() {
        return undefined;
    }
    get uri() {
        return this.preferencesService.userSettingsResource;
    }
    get name() {
        return nls.localize('user settings', "user settings");
    }
    get hidden() {
        return true;
    }
    getConfig() {
        return this.configurationService.inspect('launch').userValue;
    }
    async openConfigFile({ preserveFocus, type, useInitialContent }) {
        const editor = await this.preferencesService.openUserSettings({ jsonEditor: true, preserveFocus, revealSetting: { key: 'launch' } });
        return ({
            editor: editor ?? null,
            created: false
        });
    }
};
UserLaunch = __decorate([
    __param(2, IConfigurationService),
    __param(3, IPreferencesService)
], UserLaunch);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdDb25maWd1cmF0aW9uTWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdDb25maWd1cmF0aW9uTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsZUFBZSxFQUFlLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdGLE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxHQUFHLElBQUksR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDNUQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDeEgsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBNkIsVUFBVSxJQUFJLGNBQWMs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