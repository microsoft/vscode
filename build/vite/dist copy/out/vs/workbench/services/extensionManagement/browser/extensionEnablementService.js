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
import { localize } from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IExtensionManagementService, IGlobalExtensionEnablementService, ENABLED_EXTENSIONS_STORAGE_PATH, DISABLED_EXTENSIONS_STORAGE_PATH, IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../common/extensionManagement.js';
import { areSameExtensions, BetterMergeId, getExtensionDependencies, isMalicious } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { isAuthenticationProviderExtension, isLanguagePackExtension, isResolverExtension } from '../../../../platform/extensions/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { StorageManager } from '../../../../platform/extensionManagement/common/extensionEnablementService.js';
import { webWorkerExtHostConfig } from '../../extensions/common/extensions.js';
import { IUserDataSyncAccountService } from '../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IHostService } from '../../host/browser/host.js';
import { IExtensionBisectService } from './extensionBisect.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { equals } from '../../../../base/common/arrays.js';
import { isString } from '../../../../base/common/types.js';
import { Delayer } from '../../../../base/common/async.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isWeb } from '../../../../base/common/platform.js';
const SOURCE = 'IWorkbenchExtensionEnablementService';
const EXTENSION_UNIFICATION_SETTING = 'chat.extensionUnification.enabled';
let ExtensionEnablementService = class ExtensionEnablementService extends Disposable {
    constructor(storageService, globalExtensionEnablementService, contextService, environmentService, extensionManagementService, configurationService, extensionManagementServerService, userDataSyncEnablementService, userDataSyncAccountService, lifecycleService, notificationService, hostService, extensionBisectService, allowedExtensionsService, workspaceTrustManagementService, workspaceTrustRequestService, extensionManifestPropertiesService, instantiationService, logService, productService) {
        super();
        this.storageService = storageService;
        this.globalExtensionEnablementService = globalExtensionEnablementService;
        this.contextService = contextService;
        this.environmentService = environmentService;
        this.extensionManagementService = extensionManagementService;
        this.configurationService = configurationService;
        this.extensionManagementServerService = extensionManagementServerService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.userDataSyncAccountService = userDataSyncAccountService;
        this.lifecycleService = lifecycleService;
        this.notificationService = notificationService;
        this.extensionBisectService = extensionBisectService;
        this.allowedExtensionsService = allowedExtensionsService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.logService = logService;
        this._onEnablementChanged = this._register(new Emitter());
        this.onEnablementChanged = this._onEnablementChanged.event;
        this.extensionsDisabledExtensions = [];
        this.delayer = this._register(new Delayer(0));
        this.storageManager = this._register(new StorageManager(storageService));
        const uninstallDisposable = this._register(Event.filter(extensionManagementService.onDidUninstallExtension, e => !e.error)(({ identifier }) => this._reset(identifier)));
        let isDisposed = false;
        this._register(toDisposable(() => isDisposed = true));
        this.extensionsManager = this._register(instantiationService.createInstance(ExtensionsManager));
        this.extensionsManager.whenInitialized().then(() => {
            if (!isDisposed) {
                uninstallDisposable.dispose();
                this._onDidChangeExtensions([], [], false);
                this._register(this.extensionsManager.onDidChangeExtensions(({ added, removed, isProfileSwitch }) => this._onDidChangeExtensions(added, removed, isProfileSwitch)));
                this.loopCheckForMaliciousExtensions();
            }
        });
        this._register(this.globalExtensionEnablementService.onDidChangeEnablement(({ extensions, source }) => this._onDidChangeGloballyDisabledExtensions(extensions, source)));
        this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this._onDidChangeExtensions([], [], false)));
        // Extension unification
        this._completionsExtensionId = productService.defaultChatAgent?.extensionId.toLowerCase();
        this._chatExtensionId = productService.defaultChatAgent?.chatExtensionId.toLowerCase();
        const unificationExtensions = [this._completionsExtensionId, this._chatExtensionId].filter(id => !!id);
        // Disabling extension unification should immediately disable the unified extension flow
        // Enabling extension unification will only take effect after restart
        // Extension Unification is disabled in web when there is no remote authority
        if (isWeb && this.environmentService.remoteAuthority === undefined) {
            this._extensionUnificationEnabled = false;
        }
        else {
            this._extensionUnificationEnabled = this.configurationService.getValue(EXTENSION_UNIFICATION_SETTING);
        }
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(EXTENSION_UNIFICATION_SETTING)) {
                const extensionUnificationEnabled = this.configurationService.getValue(EXTENSION_UNIFICATION_SETTING);
                if (!extensionUnificationEnabled) {
                    this._extensionUnificationEnabled = false;
                    this._onEnablementChanged.fire(this.extensionsManager.extensions.filter(ext => unificationExtensions.includes(ext.identifier.id.toLowerCase())));
                }
            }
        }));
        // delay notification for extensions disabled until workbench restored
        if (this.allUserExtensionsDisabled) {
            this.lifecycleService.when(4 /* LifecyclePhase.Eventually */).then(() => {
                this.notificationService.prompt(Severity.Info, localize('extensionsDisabled', "All installed extensions are temporarily disabled."), [{
                        label: localize('Reload', "Reload and Enable Extensions"),
                        run: () => hostService.reload({ disableExtensions: false })
                    }], {
                    sticky: true,
                    priority: NotificationPriority.URGENT
                });
            });
        }
    }
    get hasWorkspace() {
        return this.contextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    }
    get allUserExtensionsDisabled() {
        return this.environmentService.disableExtensions === true;
    }
    getEnablementState(extension) {
        return this._computeEnablementState(extension, this.extensionsManager.extensions, this.getWorkspaceType());
    }
    getEnablementStates(extensions, workspaceTypeOverrides = {}) {
        const extensionsEnablements = new Map();
        const workspaceType = { ...this.getWorkspaceType(), ...workspaceTypeOverrides };
        return extensions.map(extension => this._computeEnablementState(extension, extensions, workspaceType, extensionsEnablements));
    }
    getDependenciesEnablementStates(extension) {
        return getExtensionDependencies(this.extensionsManager.extensions, extension).map(e => [e, this.getEnablementState(e)]);
    }
    canChangeEnablement(extension) {
        try {
            this.throwErrorIfCannotChangeEnablement(extension);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    canChangeWorkspaceEnablement(extension) {
        if (!this.canChangeEnablement(extension)) {
            return false;
        }
        try {
            this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    throwErrorIfCannotChangeEnablement(extension, donotCheckDependencies) {
        if (isLanguagePackExtension(extension.manifest)) {
            throw new Error(localize('cannot disable language pack extension', "Cannot change enablement of {0} extension because it contributes language packs.", extension.manifest.displayName || extension.identifier.id));
        }
        if (this.userDataSyncEnablementService.isEnabled() && this.userDataSyncAccountService.account &&
            isAuthenticationProviderExtension(extension.manifest) && extension.manifest.contributes.authentication.some(a => a.id === this.userDataSyncAccountService.account.authenticationProviderId)) {
            throw new Error(localize('cannot disable auth extension', "Cannot change enablement {0} extension because Settings Sync depends on it.", extension.manifest.displayName || extension.identifier.id));
        }
        if (this._isEnabledInEnv(extension)) {
            throw new Error(localize('cannot change enablement environment', "Cannot change enablement of {0} extension because it is enabled in environment", extension.manifest.displayName || extension.identifier.id));
        }
        this.throwErrorIfEnablementStateCannotBeChanged(extension, this.getEnablementState(extension), donotCheckDependencies);
    }
    throwErrorIfEnablementStateCannotBeChanged(extension, enablementStateOfExtension, donotCheckDependencies) {
        switch (enablementStateOfExtension) {
            case 2 /* EnablementState.DisabledByEnvironment */:
                throw new Error(localize('cannot change disablement environment', "Cannot change enablement of {0} extension because it is disabled in environment", extension.manifest.displayName || extension.identifier.id));
            case 4 /* EnablementState.DisabledByMalicious */:
                throw new Error(localize('cannot change enablement malicious', "Cannot change enablement of {0} extension because it is malicious", extension.manifest.displayName || extension.identifier.id));
            case 5 /* EnablementState.DisabledByVirtualWorkspace */:
                throw new Error(localize('cannot change enablement virtual workspace', "Cannot change enablement of {0} extension because it does not support virtual workspaces", extension.manifest.displayName || extension.identifier.id));
            case 1 /* EnablementState.DisabledByExtensionKind */:
                throw new Error(localize('cannot change enablement extension kind', "Cannot change enablement of {0} extension because of its extension kind", extension.manifest.displayName || extension.identifier.id));
            case 7 /* EnablementState.DisabledByAllowlist */:
                throw new Error(localize('cannot change disallowed extension enablement', "Cannot change enablement of {0} extension because it is disallowed", extension.manifest.displayName || extension.identifier.id));
            case 6 /* EnablementState.DisabledByInvalidExtension */:
                throw new Error(localize('cannot change invalid extension enablement', "Cannot change enablement of {0} extension because of it is invalid", extension.manifest.displayName || extension.identifier.id));
            case 8 /* EnablementState.DisabledByExtensionDependency */:
                if (donotCheckDependencies) {
                    break;
                }
                // Can be changed only when all its dependencies enablements can be changed
                for (const dependency of getExtensionDependencies(this.extensionsManager.extensions, extension)) {
                    if (this.isEnabled(dependency)) {
                        continue;
                    }
                    throw new Error(localize('cannot change enablement dependency', "Cannot enable '{0}' extension because it depends on '{1}' extension that cannot be enabled", extension.manifest.displayName || extension.identifier.id, dependency.manifest.displayName || dependency.identifier.id));
                }
        }
    }
    throwErrorIfCannotChangeWorkspaceEnablement(extension) {
        if (!this.hasWorkspace) {
            throw new Error(localize('noWorkspace', "No workspace."));
        }
        if (isAuthenticationProviderExtension(extension.manifest)) {
            throw new Error(localize('cannot disable auth extension in workspace', "Cannot change enablement of {0} extension in workspace because it contributes authentication providers", extension.manifest.displayName || extension.identifier.id));
        }
    }
    async setEnablement(extensions, newState) {
        await this.extensionsManager.whenInitialized();
        if (newState === 12 /* EnablementState.EnabledGlobally */ || newState === 13 /* EnablementState.EnabledWorkspace */) {
            extensions.push(...this.getExtensionsToEnableRecursively(extensions, this.extensionsManager.extensions, newState, { dependencies: true, pack: true }));
        }
        const workspace = newState === 11 /* EnablementState.DisabledWorkspace */ || newState === 13 /* EnablementState.EnabledWorkspace */;
        for (const extension of extensions) {
            if (workspace) {
                this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
            }
            else {
                this.throwErrorIfCannotChangeEnablement(extension);
            }
        }
        const result = [];
        for (const extension of extensions) {
            const enablementState = this.getEnablementState(extension);
            if (enablementState === 0 /* EnablementState.DisabledByTrustRequirement */
                /* All its disabled dependencies are disabled by Trust Requirement */
                || (enablementState === 8 /* EnablementState.DisabledByExtensionDependency */ && this.getDependenciesEnablementStates(extension).every(([, e]) => this.isEnabledEnablementState(e) || e === 0 /* EnablementState.DisabledByTrustRequirement */))) {
                const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust();
                result.push(trustState ?? false);
            }
            else {
                result.push(await this._setUserEnablementState(extension, newState));
            }
        }
        const changedExtensions = extensions.filter((e, index) => result[index]);
        if (changedExtensions.length) {
            this._onEnablementChanged.fire(changedExtensions);
        }
        return result;
    }
    getExtensionsToEnableRecursively(extensions, allExtensions, enablementState, options, checked = []) {
        if (!options.dependencies && !options.pack) {
            return [];
        }
        const toCheck = extensions.filter(e => checked.indexOf(e) === -1);
        if (!toCheck.length) {
            return [];
        }
        for (const extension of toCheck) {
            checked.push(extension);
        }
        const extensionsToEnable = [];
        for (const extension of allExtensions) {
            // Extension is already checked
            if (checked.some(e => areSameExtensions(e.identifier, extension.identifier))) {
                continue;
            }
            const enablementStateOfExtension = this.getEnablementState(extension);
            // Extension is enabled
            if (this.isEnabledEnablementState(enablementStateOfExtension)) {
                continue;
            }
            // Skip if dependency extension is disabled by extension kind
            if (enablementStateOfExtension === 1 /* EnablementState.DisabledByExtensionKind */) {
                continue;
            }
            // Check if the extension is a dependency or in extension pack
            if (extensions.some(e => (options.dependencies && e.manifest.extensionDependencies?.some(id => areSameExtensions({ id }, extension.identifier)))
                || (options.pack && e.manifest.extensionPack?.some(id => areSameExtensions({ id }, extension.identifier))))) {
                const index = extensionsToEnable.findIndex(e => areSameExtensions(e.identifier, extension.identifier));
                // Extension is not added to the disablement list so add it
                if (index === -1) {
                    extensionsToEnable.push(extension);
                }
                // Extension is there already in the disablement list.
                else {
                    try {
                        // Replace only if the enablement state can be changed
                        this.throwErrorIfEnablementStateCannotBeChanged(extension, enablementStateOfExtension, true);
                        extensionsToEnable.splice(index, 1, extension);
                    }
                    catch (error) { /*Do not add*/ }
                }
            }
        }
        if (extensionsToEnable.length) {
            extensionsToEnable.push(...this.getExtensionsToEnableRecursively(extensionsToEnable, allExtensions, enablementState, options, checked));
        }
        return extensionsToEnable;
    }
    _setUserEnablementState(extension, newState) {
        const currentState = this._getUserEnablementState(extension.identifier);
        if (currentState === newState) {
            return Promise.resolve(false);
        }
        switch (newState) {
            case 12 /* EnablementState.EnabledGlobally */:
                this._enableExtension(extension.identifier);
                break;
            case 10 /* EnablementState.DisabledGlobally */:
                this._disableExtension(extension.identifier);
                break;
            case 13 /* EnablementState.EnabledWorkspace */:
                this._enableExtensionInWorkspace(extension.identifier);
                break;
            case 11 /* EnablementState.DisabledWorkspace */:
                this._disableExtensionInWorkspace(extension.identifier);
                break;
        }
        return Promise.resolve(true);
    }
    isEnabled(extension) {
        const enablementState = this.getEnablementState(extension);
        return this.isEnabledEnablementState(enablementState);
    }
    isEnabledEnablementState(enablementState) {
        return enablementState === 3 /* EnablementState.EnabledByEnvironment */ || enablementState === 13 /* EnablementState.EnabledWorkspace */ || enablementState === 12 /* EnablementState.EnabledGlobally */;
    }
    isDisabledGlobally(extension) {
        return this._isDisabledGlobally(extension.identifier);
    }
    _computeEnablementState(extension, extensions, workspaceType, computedEnablementStates) {
        computedEnablementStates = computedEnablementStates ?? new Map();
        let enablementState = computedEnablementStates.get(extension);
        if (enablementState !== undefined) {
            return enablementState;
        }
        enablementState = this._getUserEnablementState(extension.identifier);
        const isEnabled = this.isEnabledEnablementState(enablementState);
        if (isMalicious(extension.identifier, this.getMaliciousExtensions().map(e => ({ extensionOrPublisher: e })))) {
            enablementState = 4 /* EnablementState.DisabledByMalicious */;
        }
        else if (isEnabled && extension.type === 1 /* ExtensionType.User */ && this.allowedExtensionsService.isAllowed(extension) !== true) {
            enablementState = 7 /* EnablementState.DisabledByAllowlist */;
        }
        else if (isEnabled && !extension.isValid) {
            enablementState = 6 /* EnablementState.DisabledByInvalidExtension */;
        }
        else if (this.extensionBisectService.isDisabledByBisect(extension)) {
            enablementState = 2 /* EnablementState.DisabledByEnvironment */;
        }
        else if (this._isDisabledInEnv(extension)) {
            enablementState = 2 /* EnablementState.DisabledByEnvironment */;
        }
        else if (this._isDisabledByVirtualWorkspace(extension, workspaceType)) {
            enablementState = 5 /* EnablementState.DisabledByVirtualWorkspace */;
        }
        else if (isEnabled && this._isDisabledByWorkspaceTrust(extension, workspaceType)) {
            enablementState = 0 /* EnablementState.DisabledByTrustRequirement */;
        }
        else if (this._isDisabledByExtensionKind(extension)) {
            enablementState = 1 /* EnablementState.DisabledByExtensionKind */;
        }
        else if (isEnabled && this._isDisabledByExtensionDependency(extension, extensions, workspaceType, computedEnablementStates)) {
            enablementState = 8 /* EnablementState.DisabledByExtensionDependency */;
        }
        else if (this._isDisabledByUnification(extension.identifier)) {
            enablementState = 9 /* EnablementState.DisabledByUnification */;
        }
        else if (!isEnabled && this._isEnabledInEnv(extension)) {
            enablementState = 3 /* EnablementState.EnabledByEnvironment */;
        }
        computedEnablementStates.set(extension, enablementState);
        return enablementState;
    }
    _isDisabledInEnv(extension) {
        if (this.allUserExtensionsDisabled) {
            return !extension.isBuiltin && !isResolverExtension(extension.manifest, this.environmentService.remoteAuthority);
        }
        const disabledExtensions = this.environmentService.disableExtensions;
        if (Array.isArray(disabledExtensions)) {
            return disabledExtensions.some(id => areSameExtensions({ id }, extension.identifier));
        }
        // Check if this is the better merge extension which was migrated to a built-in extension
        if (areSameExtensions({ id: BetterMergeId.value }, extension.identifier)) {
            return true;
        }
        return false;
    }
    _isEnabledInEnv(extension) {
        const enabledExtensions = this.environmentService.enableExtensions;
        if (Array.isArray(enabledExtensions)) {
            return enabledExtensions.some(id => areSameExtensions({ id }, extension.identifier));
        }
        return false;
    }
    _isDisabledByVirtualWorkspace(extension, workspaceType) {
        // Not a virtual workspace
        if (!workspaceType.virtual) {
            return false;
        }
        // Supports virtual workspace
        if (this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.manifest) !== false) {
            return false;
        }
        // Web extension from web extension management server
        if (this.extensionManagementServerService.getExtensionManagementServer(extension) === this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
            return false;
        }
        return true;
    }
    _isDisabledByExtensionKind(extension) {
        if (this.extensionManagementServerService.remoteExtensionManagementServer || this.extensionManagementServerService.webExtensionManagementServer) {
            const installLocation = this.extensionManagementServerService.getExtensionInstallLocation(extension);
            for (const extensionKind of this.extensionManifestPropertiesService.getExtensionKind(extension.manifest)) {
                if (extensionKind === 'ui') {
                    if (installLocation === 1 /* ExtensionInstallLocation.Local */) {
                        return false;
                    }
                }
                if (extensionKind === 'workspace') {
                    if (installLocation === 2 /* ExtensionInstallLocation.Remote */) {
                        return false;
                    }
                }
                if (extensionKind === 'web') {
                    if (this.extensionManagementServerService.webExtensionManagementServer /* web */) {
                        if (installLocation === 3 /* ExtensionInstallLocation.Web */ || installLocation === 2 /* ExtensionInstallLocation.Remote */) {
                            return false;
                        }
                    }
                    else if (installLocation === 1 /* ExtensionInstallLocation.Local */) {
                        const enableLocalWebWorker = this.configurationService.getValue(webWorkerExtHostConfig);
                        if (enableLocalWebWorker === true || enableLocalWebWorker === 'auto') {
                            // Web extensions are enabled on all configurations
                            return false;
                        }
                    }
                }
            }
            return true;
        }
        return false;
    }
    _isDisabledByWorkspaceTrust(extension, workspaceType) {
        if (workspaceType.trusted) {
            return false;
        }
        if (this.contextService.isInsideWorkspace(extension.location)) {
            return true;
        }
        return this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.manifest) === false;
    }
    _isDisabledByExtensionDependency(extension, extensions, workspaceType, computedEnablementStates) {
        if (!extension.manifest.extensionDependencies) {
            return false;
        }
        // Find dependency that is from the same server or does not exports any API
        const dependencyExtensions = extensions.filter(e => extension.manifest.extensionDependencies?.some(id => areSameExtensions(e.identifier, { id })
            && (this.extensionManagementServerService.getExtensionManagementServer(e) === this.extensionManagementServerService.getExtensionManagementServer(extension) || ((e.manifest.main || e.manifest.browser) && e.manifest.api === 'none'))));
        if (!dependencyExtensions.length) {
            return false;
        }
        const hasEnablementState = computedEnablementStates.has(extension);
        if (!hasEnablementState) {
            // Placeholder to handle cyclic deps
            computedEnablementStates.set(extension, 12 /* EnablementState.EnabledGlobally */);
        }
        try {
            for (const dependencyExtension of dependencyExtensions) {
                const enablementState = this._computeEnablementState(dependencyExtension, extensions, workspaceType, computedEnablementStates);
                if (!this.isEnabledEnablementState(enablementState) && enablementState !== 1 /* EnablementState.DisabledByExtensionKind */) {
                    return true;
                }
            }
        }
        finally {
            if (!hasEnablementState) {
                // remove the placeholder
                computedEnablementStates.delete(extension);
            }
        }
        return false;
    }
    _getUserEnablementState(identifier) {
        if (this.hasWorkspace) {
            if (this._getWorkspaceEnabledExtensions().filter(e => areSameExtensions(e, identifier))[0]) {
                return 13 /* EnablementState.EnabledWorkspace */;
            }
            if (this._getWorkspaceDisabledExtensions().filter(e => areSameExtensions(e, identifier))[0]) {
                return 11 /* EnablementState.DisabledWorkspace */;
            }
        }
        if (this._isDisabledGlobally(identifier)) {
            return 10 /* EnablementState.DisabledGlobally */;
        }
        return 12 /* EnablementState.EnabledGlobally */;
    }
    _isDisabledGlobally(identifier) {
        return this.globalExtensionEnablementService.getDisabledExtensions().some(e => areSameExtensions(e, identifier));
    }
    _isDisabledByUnification(identifier) {
        return this._extensionUnificationEnabled && identifier.id.toLowerCase() === this._completionsExtensionId;
    }
    _enableExtension(identifier) {
        this._removeFromWorkspaceDisabledExtensions(identifier);
        this._removeFromWorkspaceEnabledExtensions(identifier);
        return this.globalExtensionEnablementService.enableExtension(identifier, SOURCE);
    }
    _disableExtension(identifier) {
        this._removeFromWorkspaceDisabledExtensions(identifier);
        this._removeFromWorkspaceEnabledExtensions(identifier);
        return this.globalExtensionEnablementService.disableExtension(identifier, SOURCE);
    }
    _enableExtensionInWorkspace(identifier) {
        this._removeFromWorkspaceDisabledExtensions(identifier);
        this._addToWorkspaceEnabledExtensions(identifier);
    }
    _disableExtensionInWorkspace(identifier) {
        this._addToWorkspaceDisabledExtensions(identifier);
        this._removeFromWorkspaceEnabledExtensions(identifier);
    }
    _addToWorkspaceDisabledExtensions(identifier) {
        if (!this.hasWorkspace) {
            return Promise.resolve(false);
        }
        const disabledExtensions = this._getWorkspaceDisabledExtensions();
        if (disabledExtensions.every(e => !areSameExtensions(e, identifier))) {
            disabledExtensions.push(identifier);
            this._setDisabledExtensions(disabledExtensions);
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    async _removeFromWorkspaceDisabledExtensions(identifier) {
        if (!this.hasWorkspace) {
            return false;
        }
        const disabledExtensions = this._getWorkspaceDisabledExtensions();
        for (let index = 0; index < disabledExtensions.length; index++) {
            const disabledExtension = disabledExtensions[index];
            if (areSameExtensions(disabledExtension, identifier)) {
                disabledExtensions.splice(index, 1);
                this._setDisabledExtensions(disabledExtensions);
                return true;
            }
        }
        return false;
    }
    _addToWorkspaceEnabledExtensions(identifier) {
        if (!this.hasWorkspace) {
            return false;
        }
        const enabledExtensions = this._getWorkspaceEnabledExtensions();
        if (enabledExtensions.every(e => !areSameExtensions(e, identifier))) {
            enabledExtensions.push(identifier);
            this._setEnabledExtensions(enabledExtensions);
            return true;
        }
        return false;
    }
    _removeFromWorkspaceEnabledExtensions(identifier) {
        if (!this.hasWorkspace) {
            return false;
        }
        const enabledExtensions = this._getWorkspaceEnabledExtensions();
        for (let index = 0; index < enabledExtensions.length; index++) {
            const disabledExtension = enabledExtensions[index];
            if (areSameExtensions(disabledExtension, identifier)) {
                enabledExtensions.splice(index, 1);
                this._setEnabledExtensions(enabledExtensions);
                return true;
            }
        }
        return false;
    }
    _getWorkspaceEnabledExtensions() {
        return this._getExtensions(ENABLED_EXTENSIONS_STORAGE_PATH);
    }
    _setEnabledExtensions(enabledExtensions) {
        this._setExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, enabledExtensions);
    }
    _getWorkspaceDisabledExtensions() {
        return this._getExtensions(DISABLED_EXTENSIONS_STORAGE_PATH);
    }
    _setDisabledExtensions(disabledExtensions) {
        this._setExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions);
    }
    _getExtensions(storageId) {
        if (!this.hasWorkspace) {
            return [];
        }
        return this.storageManager.get(storageId, 1 /* StorageScope.WORKSPACE */);
    }
    _setExtensions(storageId, extensions) {
        this.storageManager.set(storageId, extensions, 1 /* StorageScope.WORKSPACE */);
    }
    async _onDidChangeGloballyDisabledExtensions(extensionIdentifiers, source) {
        if (source !== SOURCE) {
            await this.extensionsManager.whenInitialized();
            const extensions = this.extensionsManager.extensions.filter(installedExtension => extensionIdentifiers.some(identifier => areSameExtensions(identifier, installedExtension.identifier)));
            this._onEnablementChanged.fire(extensions);
        }
    }
    _onDidChangeExtensions(added, removed, isProfileSwitch) {
        const changedExtensions = added.filter(e => !this.isEnabledEnablementState(this.getEnablementState(e)));
        const existingDisabledExtensions = this.extensionsDisabledExtensions;
        this.extensionsDisabledExtensions = this.extensionsManager.extensions.filter(extension => {
            const enablementState = this.getEnablementState(extension);
            return enablementState === 8 /* EnablementState.DisabledByExtensionDependency */ || enablementState === 7 /* EnablementState.DisabledByAllowlist */ || enablementState === 4 /* EnablementState.DisabledByMalicious */;
        });
        for (const extension of existingDisabledExtensions) {
            if (this.extensionsDisabledExtensions.every(e => !areSameExtensions(e.identifier, extension.identifier))) {
                changedExtensions.push(extension);
            }
        }
        for (const extension of this.extensionsDisabledExtensions) {
            if (existingDisabledExtensions.every(e => !areSameExtensions(e.identifier, extension.identifier))) {
                changedExtensions.push(extension);
            }
        }
        if (changedExtensions.length) {
            this._onEnablementChanged.fire(changedExtensions);
        }
        if (!isProfileSwitch) {
            removed.forEach(({ identifier }) => this._reset(identifier));
        }
    }
    async updateExtensionsEnablementsWhenWorkspaceTrustChanges() {
        await this.extensionsManager.whenInitialized();
        const computeEnablementStates = (workspaceType) => {
            const extensionsEnablements = new Map();
            return this.extensionsManager.extensions.map(extension => [extension, this._computeEnablementState(extension, this.extensionsManager.extensions, workspaceType, extensionsEnablements)]);
        };
        const workspaceType = this.getWorkspaceType();
        const enablementStatesWithTrustedWorkspace = computeEnablementStates({ ...workspaceType, trusted: true });
        const enablementStatesWithUntrustedWorkspace = computeEnablementStates({ ...workspaceType, trusted: false });
        const enablementChangedExtensionsBecauseOfTrust = enablementStatesWithTrustedWorkspace.filter(([, enablementState], index) => enablementState !== enablementStatesWithUntrustedWorkspace[index][1]).map(([extension]) => extension);
        if (enablementChangedExtensionsBecauseOfTrust.length) {
            this._onEnablementChanged.fire(enablementChangedExtensionsBecauseOfTrust);
        }
    }
    getWorkspaceType() {
        return { trusted: this.workspaceTrustManagementService.isWorkspaceTrusted(), virtual: isVirtualWorkspace(this.contextService.getWorkspace()) };
    }
    _reset(extension) {
        this._removeFromWorkspaceDisabledExtensions(extension);
        this._removeFromWorkspaceEnabledExtensions(extension);
        this.globalExtensionEnablementService.enableExtension(extension);
    }
    loopCheckForMaliciousExtensions() {
        this.checkForMaliciousExtensions()
            .then(() => this.delayer.trigger(() => { }, 1000 * 60 * 5)) // every five minutes
            .then(() => this.loopCheckForMaliciousExtensions());
    }
    async checkForMaliciousExtensions() {
        try {
            const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
            const changed = this.storeMaliciousExtensions(extensionsControlManifest.malicious.map(({ extensionOrPublisher }) => extensionOrPublisher));
            if (changed) {
                this._onDidChangeExtensions([], [], false);
            }
        }
        catch (err) {
            this.logService.error(err);
        }
    }
    getMaliciousExtensions() {
        return this.storageService.getObject('extensionsEnablement/malicious', -1 /* StorageScope.APPLICATION */, []);
    }
    storeMaliciousExtensions(extensions) {
        const existing = this.getMaliciousExtensions();
        if (equals(existing, extensions, (a, b) => !isString(a) && !isString(b) ? areSameExtensions(a, b) : a === b)) {
            return false;
        }
        this.storageService.store('extensionsEnablement/malicious', JSON.stringify(extensions), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        return true;
    }
};
ExtensionEnablementService = __decorate([
    __param(0, IStorageService),
    __param(1, IGlobalExtensionEnablementService),
    __param(2, IWorkspaceContextService),
    __param(3, IWorkbenchEnvironmentService),
    __param(4, IExtensionManagementService),
    __param(5, IConfigurationService),
    __param(6, IExtensionManagementServerService),
    __param(7, IUserDataSyncEnablementService),
    __param(8, IUserDataSyncAccountService),
    __param(9, ILifecycleService),
    __param(10, INotificationService),
    __param(11, IHostService),
    __param(12, IExtensionBisectService),
    __param(13, IAllowedExtensionsService),
    __param(14, IWorkspaceTrustManagementService),
    __param(15, IWorkspaceTrustRequestService),
    __param(16, IExtensionManifestPropertiesService),
    __param(17, IInstantiationService),
    __param(18, ILogService),
    __param(19, IProductService)
], ExtensionEnablementService);
export { ExtensionEnablementService };
let ExtensionsManager = class ExtensionsManager extends Disposable {
    get extensions() { return this._extensions; }
    constructor(extensionManagementService, extensionManagementServerService, logService) {
        super();
        this.extensionManagementService = extensionManagementService;
        this.extensionManagementServerService = extensionManagementServerService;
        this.logService = logService;
        this._extensions = [];
        this._onDidChangeExtensions = this._register(new Emitter());
        this.onDidChangeExtensions = this._onDidChangeExtensions.event;
        this.disposed = false;
        this._register(toDisposable(() => this.disposed = true));
        this.initializePromise = this.initialize();
    }
    whenInitialized() {
        return this.initializePromise;
    }
    async initialize() {
        try {
            this._extensions = [
                ...await this.extensionManagementService.getInstalled(),
                ...await this.extensionManagementService.getInstalledWorkspaceExtensions(true)
            ];
            if (this.disposed) {
                return;
            }
            this._onDidChangeExtensions.fire({ added: this.extensions, removed: [], isProfileSwitch: false });
        }
        catch (error) {
            this.logService.error(error);
        }
        this._register(this.extensionManagementService.onDidInstallExtensions(e => this.updateExtensions(e.reduce((result, { local, operation }) => {
            if (local && operation !== 4 /* InstallOperation.Migrate */) {
                result.push(local);
            }
            return result;
        }, []), [], undefined, false)));
        this._register(Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error))(e => this.updateExtensions([], [e.identifier], e.server, false)));
        this._register(this.extensionManagementService.onDidChangeProfile(({ added, removed, server }) => {
            this.updateExtensions(added, removed.map(({ identifier }) => identifier), server, true);
        }));
    }
    updateExtensions(added, identifiers, server, isProfileSwitch) {
        if (added.length) {
            for (const extension of added) {
                const extensionServer = this.extensionManagementServerService.getExtensionManagementServer(extension);
                const index = this._extensions.findIndex(e => areSameExtensions(e.identifier, extension.identifier) && this.extensionManagementServerService.getExtensionManagementServer(e) === extensionServer);
                if (index !== -1) {
                    this._extensions.splice(index, 1);
                }
            }
            this._extensions.push(...added);
        }
        const removed = [];
        for (const identifier of identifiers) {
            const index = this._extensions.findIndex(e => areSameExtensions(e.identifier, identifier) && this.extensionManagementServerService.getExtensionManagementServer(e) === server);
            if (index !== -1) {
                removed.push(...this._extensions.splice(index, 1));
            }
        }
        if (added.length || removed.length) {
            this._onDidChangeExtensions.fire({ added, removed, isProfileSwitch });
        }
    }
};
ExtensionsManager = __decorate([
    __param(0, IWorkbenchExtensionManagementService),
    __param(1, IExtensionManagementServerService),
    __param(2, ILogService)
], ExtensionsManager);
registerSingleton(IWorkbenchExtensionEnablementService, ExtensionEnablementService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9icm93c2VyL2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLDJCQUEyQixFQUF3QixpQ0FBaUMsRUFBRSwrQkFBK0IsRUFBRSxnQ0FBZ0MsRUFBb0IseUJBQXlCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUM5UixPQUFPLEVBQUUsb0NBQW9DLEVBQW1CLGlDQUFpQyxFQUFFLG9DQUFvQyxFQUF3RCxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hPLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsd0JBQXdCLEVBQUUsV0FBVyxFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDckssT0FBTyxFQUFFLHdCQUF3QixFQUFrQixNQUFNLG9EQUFvRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDOUYsT0FBTyxFQUE2QixpQ0FBaUMsRUFBRSx1QkFBdUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xMLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8s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