/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IExtensionManagementService, IExtensionIdentifier, IGlobalExtensionEnablementService, ENABLED_EXTENSIONS_STORAGE_PATH, DISABLED_EXTENSIONS_STORAGE_PATH, InstallOperation, IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService, IExtensionManagementServer, ExtensionInstallLocation } from '../common/extensionManagement.js';
import { areSameExtensions, BetterMergeId, getExtensionDependencies, isMalicious } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ExtensionType, IExtension, isAuthenticationProviderExtension, isLanguagePackExtension, isResolverExtension } from '../../../../platform/extensions/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { StorageManager } from '../../../../platform/extensionManagement/common/extensionEnablementService.js';
import { webWorkerExtHostConfig, WebWorkerExtHostConfigValue } from '../../extensions/common/extensions.js';
import { IUserDataSyncAccountService } from '../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { ILifecycleService, LifecyclePhase } from '../../lifecycle/common/lifecycle.js';
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

const SOURCE = 'IWorkbenchExtensionEnablementService';

type WorkspaceType = { readonly virtual: boolean; readonly trusted: boolean };

export class ExtensionEnablementService extends Disposable implements IWorkbenchExtensionEnablementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onEnablementChanged = new Emitter<readonly IExtension[]>();
	public readonly onEnablementChanged: Event<readonly IExtension[]> = this._onEnablementChanged.event;

	protected readonly extensionsManager: ExtensionsManager;
	private readonly storageManager: StorageManager;
	private extensionsDisabledExtensions: IExtension[] = [];
	private readonly delayer = this._register(new Delayer<void>(0));

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IGlobalExtensionEnablementService protected readonly globalExtensionEnablementService: IGlobalExtensionEnablementService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncAccountService private readonly userDataSyncAccountService: IUserDataSyncAccountService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHostService hostService: IHostService,
		@IExtensionBisectService private readonly extensionBisectService: IExtensionBisectService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
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

		// delay notification for extensions disabled until workbench restored
		if (this.allUserExtensionsDisabled) {
			this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
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

	private get hasWorkspace(): boolean {
		return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	private get allUserExtensionsDisabled(): boolean {
		return this.environmentService.disableExtensions === true;
	}

	getEnablementState(extension: IExtension): EnablementState {
		return this._computeEnablementState(extension, this.extensionsManager.extensions, this.getWorkspaceType());
	}

	getEnablementStates(extensions: IExtension[], workspaceTypeOverrides: Partial<WorkspaceType> = {}): EnablementState[] {
		const extensionsEnablements = new Map<IExtension, EnablementState>();
		const workspaceType = { ...this.getWorkspaceType(), ...workspaceTypeOverrides };
		return extensions.map(extension => this._computeEnablementState(extension, extensions, workspaceType, extensionsEnablements));
	}

	getDependenciesEnablementStates(extension: IExtension): [IExtension, EnablementState][] {
		return getExtensionDependencies(this.extensionsManager.extensions, extension).map(e => [e, this.getEnablementState(e)]);
	}

	canChangeEnablement(extension: IExtension): boolean {
		try {
			this.throwErrorIfCannotChangeEnablement(extension);
			return true;
		} catch (error) {
			return false;
		}
	}

	canChangeWorkspaceEnablement(extension: IExtension): boolean {
		if (!this.canChangeEnablement(extension)) {
			return false;
		}

		try {
			this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
			return true;
		} catch (error) {
			return false;
		}
	}

	private throwErrorIfCannotChangeEnablement(extension: IExtension, donotCheckDependencies?: boolean): void {
		if (isLanguagePackExtension(extension.manifest)) {
			throw new Error(localize('cannot disable language pack extension', "Cannot change enablement of {0} extension because it contributes language packs.", extension.manifest.displayName || extension.identifier.id));
		}

		if (this.userDataSyncEnablementService.isEnabled() && this.userDataSyncAccountService.account &&
			isAuthenticationProviderExtension(extension.manifest) && extension.manifest.contributes!.authentication!.some(a => a.id === this.userDataSyncAccountService.account!.authenticationProviderId)) {
			throw new Error(localize('cannot disable auth extension', "Cannot change enablement {0} extension because Settings Sync depends on it.", extension.manifest.displayName || extension.identifier.id));
		}

		if (this._isEnabledInEnv(extension)) {
			throw new Error(localize('cannot change enablement environment', "Cannot change enablement of {0} extension because it is enabled in environment", extension.manifest.displayName || extension.identifier.id));
		}

		this.throwErrorIfEnablementStateCannotBeChanged(extension, this.getEnablementState(extension), donotCheckDependencies);
	}

	private throwErrorIfEnablementStateCannotBeChanged(extension: IExtension, enablementStateOfExtension: EnablementState, donotCheckDependencies?: boolean): void {
		switch (enablementStateOfExtension) {
			case EnablementState.DisabledByEnvironment:
				throw new Error(localize('cannot change disablement environment', "Cannot change enablement of {0} extension because it is disabled in environment", extension.manifest.displayName || extension.identifier.id));
			case EnablementState.DisabledByMalicious:
				throw new Error(localize('cannot change enablement malicious', "Cannot change enablement of {0} extension because it is malicious", extension.manifest.displayName || extension.identifier.id));
			case EnablementState.DisabledByVirtualWorkspace:
				throw new Error(localize('cannot change enablement virtual workspace', "Cannot change enablement of {0} extension because it does not support virtual workspaces", extension.manifest.displayName || extension.identifier.id));
			case EnablementState.DisabledByExtensionKind:
				throw new Error(localize('cannot change enablement extension kind', "Cannot change enablement of {0} extension because of its extension kind", extension.manifest.displayName || extension.identifier.id));
			case EnablementState.DisabledByAllowlist:
				throw new Error(localize('cannot change disallowed extension enablement', "Cannot change enablement of {0} extension because it is disallowed", extension.manifest.displayName || extension.identifier.id));
			case EnablementState.DisabledByInvalidExtension:
				throw new Error(localize('cannot change invalid extension enablement', "Cannot change enablement of {0} extension because of it is invalid", extension.manifest.displayName || extension.identifier.id));
			case EnablementState.DisabledByExtensionDependency:
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

	private throwErrorIfCannotChangeWorkspaceEnablement(extension: IExtension): void {
		if (!this.hasWorkspace) {
			throw new Error(localize('noWorkspace', "No workspace."));
		}
		if (isAuthenticationProviderExtension(extension.manifest)) {
			throw new Error(localize('cannot disable auth extension in workspace', "Cannot change enablement of {0} extension in workspace because it contributes authentication providers", extension.manifest.displayName || extension.identifier.id));
		}
	}

	async setEnablement(extensions: IExtension[], newState: EnablementState): Promise<boolean[]> {
		await this.extensionsManager.whenInitialized();

		if (newState === EnablementState.EnabledGlobally || newState === EnablementState.EnabledWorkspace) {
			extensions.push(...this.getExtensionsToEnableRecursively(extensions, this.extensionsManager.extensions, newState, { dependencies: true, pack: true }));
		}

		const workspace = newState === EnablementState.DisabledWorkspace || newState === EnablementState.EnabledWorkspace;
		for (const extension of extensions) {
			if (workspace) {
				this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
			} else {
				this.throwErrorIfCannotChangeEnablement(extension);
			}
		}

		const result: boolean[] = [];
		for (const extension of extensions) {
			const enablementState = this.getEnablementState(extension);
			if (enablementState === EnablementState.DisabledByTrustRequirement
				/* All its disabled dependencies are disabled by Trust Requirement */
				|| (enablementState === EnablementState.DisabledByExtensionDependency && this.getDependenciesEnablementStates(extension).every(([, e]) => this.isEnabledEnablementState(e) || e === EnablementState.DisabledByTrustRequirement))
			) {
				const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust();
				result.push(trustState ?? false);
			} else {
				result.push(await this._setUserEnablementState(extension, newState));
			}
		}

		const changedExtensions = extensions.filter((e, index) => result[index]);
		if (changedExtensions.length) {
			this._onEnablementChanged.fire(changedExtensions);
		}
		return result;
	}

	private getExtensionsToEnableRecursively(extensions: IExtension[], allExtensions: ReadonlyArray<IExtension>, enablementState: EnablementState, options: { dependencies: boolean; pack: boolean }, checked: IExtension[] = []): IExtension[] {
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

		const extensionsToEnable: IExtension[] = [];
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
			if (enablementStateOfExtension === EnablementState.DisabledByExtensionKind) {
				continue;
			}

			// Check if the extension is a dependency or in extension pack
			if (extensions.some(e =>
				(options.dependencies && e.manifest.extensionDependencies?.some(id => areSameExtensions({ id }, extension.identifier)))
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
					} catch (error) { /*Do not add*/ }
				}
			}
		}

		if (extensionsToEnable.length) {
			extensionsToEnable.push(...this.getExtensionsToEnableRecursively(extensionsToEnable, allExtensions, enablementState, options, checked));
		}

		return extensionsToEnable;
	}

	private _setUserEnablementState(extension: IExtension, newState: EnablementState): Promise<boolean> {

		const currentState = this._getUserEnablementState(extension.identifier);

		if (currentState === newState) {
			return Promise.resolve(false);
		}

		switch (newState) {
			case EnablementState.EnabledGlobally:
				this._enableExtension(extension.identifier);
				break;
			case EnablementState.DisabledGlobally:
				this._disableExtension(extension.identifier);
				break;
			case EnablementState.EnabledWorkspace:
				this._enableExtensionInWorkspace(extension.identifier);
				break;
			case EnablementState.DisabledWorkspace:
				this._disableExtensionInWorkspace(extension.identifier);
				break;
		}

		return Promise.resolve(true);
	}

	isEnabled(extension: IExtension): boolean {
		const enablementState = this.getEnablementState(extension);
		return this.isEnabledEnablementState(enablementState);
	}

	isEnabledEnablementState(enablementState: EnablementState): boolean {
		return enablementState === EnablementState.EnabledByEnvironment || enablementState === EnablementState.EnabledWorkspace || enablementState === EnablementState.EnabledGlobally;
	}

	isDisabledGlobally(extension: IExtension): boolean {
		return this._isDisabledGlobally(extension.identifier);
	}

	private _computeEnablementState(extension: IExtension, extensions: ReadonlyArray<IExtension>, workspaceType: WorkspaceType, computedEnablementStates?: Map<IExtension, EnablementState>): EnablementState {
		computedEnablementStates = computedEnablementStates ?? new Map<IExtension, EnablementState>();
		let enablementState = computedEnablementStates.get(extension);
		if (enablementState !== undefined) {
			return enablementState;
		}

		enablementState = this._getUserEnablementState(extension.identifier);
		const isEnabled = this.isEnabledEnablementState(enablementState);

		if (isMalicious(extension.identifier, this.getMaliciousExtensions().map(e => ({ extensionOrPublisher: e })))) {
			enablementState = EnablementState.DisabledByMalicious;
		}

		else if (isEnabled && extension.type === ExtensionType.User && this.allowedExtensionsService.isAllowed(extension) !== true) {
			enablementState = EnablementState.DisabledByAllowlist;
		}

		else if (isEnabled && !extension.isValid) {
			enablementState = EnablementState.DisabledByInvalidExtension;
		}

		else if (this.extensionBisectService.isDisabledByBisect(extension)) {
			enablementState = EnablementState.DisabledByEnvironment;
		}

		else if (this._isDisabledInEnv(extension)) {
			enablementState = EnablementState.DisabledByEnvironment;
		}

		else if (this._isDisabledByVirtualWorkspace(extension, workspaceType)) {
			enablementState = EnablementState.DisabledByVirtualWorkspace;
		}

		else if (isEnabled && this._isDisabledByWorkspaceTrust(extension, workspaceType)) {
			enablementState = EnablementState.DisabledByTrustRequirement;
		}

		else if (this._isDisabledByExtensionKind(extension)) {
			enablementState = EnablementState.DisabledByExtensionKind;
		}

		else if (isEnabled && this._isDisabledByExtensionDependency(extension, extensions, workspaceType, computedEnablementStates)) {
			enablementState = EnablementState.DisabledByExtensionDependency;
		}

		else if (!isEnabled && this._isEnabledInEnv(extension)) {
			enablementState = EnablementState.EnabledByEnvironment;
		}

		computedEnablementStates.set(extension, enablementState);
		return enablementState;
	}

	private _isDisabledInEnv(extension: IExtension): boolean {
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

	private _isEnabledInEnv(extension: IExtension): boolean {
		const enabledExtensions = this.environmentService.enableExtensions;
		if (Array.isArray(enabledExtensions)) {
			return enabledExtensions.some(id => areSameExtensions({ id }, extension.identifier));
		}
		return false;
	}

	private _isDisabledByVirtualWorkspace(extension: IExtension, workspaceType: WorkspaceType): boolean {
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

	private _isDisabledByExtensionKind(extension: IExtension): boolean {
		if (this.extensionManagementServerService.remoteExtensionManagementServer || this.extensionManagementServerService.webExtensionManagementServer) {
			const installLocation = this.extensionManagementServerService.getExtensionInstallLocation(extension);
			for (const extensionKind of this.extensionManifestPropertiesService.getExtensionKind(extension.manifest)) {
				if (extensionKind === 'ui') {
					if (installLocation === ExtensionInstallLocation.Local) {
						return false;
					}
				}
				if (extensionKind === 'workspace') {
					if (installLocation === ExtensionInstallLocation.Remote) {
						return false;
					}
				}
				if (extensionKind === 'web') {
					if (this.extensionManagementServerService.webExtensionManagementServer /* web */) {
						if (installLocation === ExtensionInstallLocation.Web || installLocation === ExtensionInstallLocation.Remote) {
							return false;
						}
					} else if (installLocation === ExtensionInstallLocation.Local) {
						const enableLocalWebWorker = this.configurationService.getValue<WebWorkerExtHostConfigValue>(webWorkerExtHostConfig);
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

	private _isDisabledByWorkspaceTrust(extension: IExtension, workspaceType: WorkspaceType): boolean {
		if (workspaceType.trusted) {
			return false;
		}

		if (this.contextService.isInsideWorkspace(extension.location)) {
			return true;
		}

		return this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.manifest) === false;
	}

	private _isDisabledByExtensionDependency(extension: IExtension, extensions: ReadonlyArray<IExtension>, workspaceType: WorkspaceType, computedEnablementStates: Map<IExtension, EnablementState>): boolean {

		if (!extension.manifest.extensionDependencies) {
			return false;
		}

		// Find dependency that is from the same server or does not exports any API
		const dependencyExtensions = extensions.filter(e =>
			extension.manifest.extensionDependencies?.some(id => areSameExtensions(e.identifier, { id })
				&& (this.extensionManagementServerService.getExtensionManagementServer(e) === this.extensionManagementServerService.getExtensionManagementServer(extension) || ((e.manifest.main || e.manifest.browser) && e.manifest.api === 'none'))));

		if (!dependencyExtensions.length) {
			return false;
		}

		const hasEnablementState = computedEnablementStates.has(extension);
		if (!hasEnablementState) {
			// Placeholder to handle cyclic deps
			computedEnablementStates.set(extension, EnablementState.EnabledGlobally);
		}
		try {
			for (const dependencyExtension of dependencyExtensions) {
				const enablementState = this._computeEnablementState(dependencyExtension, extensions, workspaceType, computedEnablementStates);
				if (!this.isEnabledEnablementState(enablementState) && enablementState !== EnablementState.DisabledByExtensionKind) {
					return true;
				}
			}
		} finally {
			if (!hasEnablementState) {
				// remove the placeholder
				computedEnablementStates.delete(extension);
			}
		}

		return false;
	}

	private _getUserEnablementState(identifier: IExtensionIdentifier): EnablementState {
		if (this.hasWorkspace) {
			if (this._getWorkspaceEnabledExtensions().filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.EnabledWorkspace;
			}

			if (this._getWorkspaceDisabledExtensions().filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.DisabledWorkspace;
			}
		}
		if (this._isDisabledGlobally(identifier)) {
			return EnablementState.DisabledGlobally;
		}
		return EnablementState.EnabledGlobally;
	}

	private _isDisabledGlobally(identifier: IExtensionIdentifier): boolean {
		return this.globalExtensionEnablementService.getDisabledExtensions().some(e => areSameExtensions(e, identifier));
	}

	private _enableExtension(identifier: IExtensionIdentifier): Promise<boolean> {
		this._removeFromWorkspaceDisabledExtensions(identifier);
		this._removeFromWorkspaceEnabledExtensions(identifier);
		return this.globalExtensionEnablementService.enableExtension(identifier, SOURCE);
	}

	private _disableExtension(identifier: IExtensionIdentifier): Promise<boolean> {
		this._removeFromWorkspaceDisabledExtensions(identifier);
		this._removeFromWorkspaceEnabledExtensions(identifier);
		return this.globalExtensionEnablementService.disableExtension(identifier, SOURCE);
	}

	private _enableExtensionInWorkspace(identifier: IExtensionIdentifier): void {
		this._removeFromWorkspaceDisabledExtensions(identifier);
		this._addToWorkspaceEnabledExtensions(identifier);
	}

	private _disableExtensionInWorkspace(identifier: IExtensionIdentifier): void {
		this._addToWorkspaceDisabledExtensions(identifier);
		this._removeFromWorkspaceEnabledExtensions(identifier);
	}

	private _addToWorkspaceDisabledExtensions(identifier: IExtensionIdentifier): Promise<boolean> {
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

	private async _removeFromWorkspaceDisabledExtensions(identifier: IExtensionIdentifier): Promise<boolean> {
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

	private _addToWorkspaceEnabledExtensions(identifier: IExtensionIdentifier): boolean {
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

	private _removeFromWorkspaceEnabledExtensions(identifier: IExtensionIdentifier): boolean {
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

	protected _getWorkspaceEnabledExtensions(): IExtensionIdentifier[] {
		return this._getExtensions(ENABLED_EXTENSIONS_STORAGE_PATH);
	}

	private _setEnabledExtensions(enabledExtensions: IExtensionIdentifier[]): void {
		this._setExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, enabledExtensions);
	}

	protected _getWorkspaceDisabledExtensions(): IExtensionIdentifier[] {
		return this._getExtensions(DISABLED_EXTENSIONS_STORAGE_PATH);
	}

	private _setDisabledExtensions(disabledExtensions: IExtensionIdentifier[]): void {
		this._setExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions);
	}

	private _getExtensions(storageId: string): IExtensionIdentifier[] {
		if (!this.hasWorkspace) {
			return [];
		}
		return this.storageManager.get(storageId, StorageScope.WORKSPACE);
	}

	private _setExtensions(storageId: string, extensions: IExtensionIdentifier[]): void {
		this.storageManager.set(storageId, extensions, StorageScope.WORKSPACE);
	}

	private async _onDidChangeGloballyDisabledExtensions(extensionIdentifiers: ReadonlyArray<IExtensionIdentifier>, source?: string): Promise<void> {
		if (source !== SOURCE) {
			await this.extensionsManager.whenInitialized();
			const extensions = this.extensionsManager.extensions.filter(installedExtension => extensionIdentifiers.some(identifier => areSameExtensions(identifier, installedExtension.identifier)));
			this._onEnablementChanged.fire(extensions);
		}
	}

	private _onDidChangeExtensions(added: ReadonlyArray<IExtension>, removed: ReadonlyArray<IExtension>, isProfileSwitch: boolean): void {
		const changedExtensions: IExtension[] = added.filter(e => !this.isEnabledEnablementState(this.getEnablementState(e)));
		const existingDisabledExtensions = this.extensionsDisabledExtensions;
		this.extensionsDisabledExtensions = this.extensionsManager.extensions.filter(extension => {
			const enablementState = this.getEnablementState(extension);
			return enablementState === EnablementState.DisabledByExtensionDependency || enablementState === EnablementState.DisabledByAllowlist || enablementState === EnablementState.DisabledByMalicious;
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

	public async updateExtensionsEnablementsWhenWorkspaceTrustChanges(): Promise<void> {
		await this.extensionsManager.whenInitialized();

		const computeEnablementStates = (workspaceType: WorkspaceType): [IExtension, EnablementState][] => {
			const extensionsEnablements = new Map<IExtension, EnablementState>();
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

	private getWorkspaceType(): WorkspaceType {
		return { trusted: this.workspaceTrustManagementService.isWorkspaceTrusted(), virtual: isVirtualWorkspace(this.contextService.getWorkspace()) };
	}

	private _reset(extension: IExtensionIdentifier) {
		this._removeFromWorkspaceDisabledExtensions(extension);
		this._removeFromWorkspaceEnabledExtensions(extension);
		this.globalExtensionEnablementService.enableExtension(extension);
	}

	private loopCheckForMaliciousExtensions(): void {
		this.checkForMaliciousExtensions()
			.then(() => this.delayer.trigger(() => { }, 1000 * 60 * 5)) // every five minutes
			.then(() => this.loopCheckForMaliciousExtensions());
	}

	private async checkForMaliciousExtensions(): Promise<void> {
		try {
			const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
			const changed = this.storeMaliciousExtensions(extensionsControlManifest.malicious.map(({ extensionOrPublisher }) => extensionOrPublisher));
			if (changed) {
				this._onDidChangeExtensions([], [], false);
			}
		} catch (err) {
			this.logService.error(err);
		}
	}

	private getMaliciousExtensions(): ReadonlyArray<IExtensionIdentifier | string> {
		return this.storageService.getObject('extensionsEnablement/malicious', StorageScope.APPLICATION, []);
	}

	private storeMaliciousExtensions(extensions: ReadonlyArray<IExtensionIdentifier | string>): boolean {
		const existing = this.getMaliciousExtensions();
		if (equals(existing, extensions, (a, b) => !isString(a) && !isString(b) ? areSameExtensions(a, b) : a === b)) {
			return false;
		}
		this.storageService.store('extensionsEnablement/malicious', JSON.stringify(extensions), StorageScope.APPLICATION, StorageTarget.MACHINE);
		return true;
	}
}

class ExtensionsManager extends Disposable {

	private _extensions: IExtension[] = [];
	get extensions(): readonly IExtension[] { return this._extensions; }

	private _onDidChangeExtensions = this._register(new Emitter<{ added: readonly IExtension[]; removed: readonly IExtension[]; readonly isProfileSwitch: boolean }>());
	readonly onDidChangeExtensions = this._onDidChangeExtensions.event;

	private readonly initializePromise;
	private disposed: boolean = false;

	constructor(
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._register(toDisposable(() => this.disposed = true));
		this.initializePromise = this.initialize();
	}

	whenInitialized(): Promise<void> {
		return this.initializePromise;
	}

	private async initialize(): Promise<void> {
		try {
			this._extensions = [
				...await this.extensionManagementService.getInstalled(),
				...await this.extensionManagementService.getInstalledWorkspaceExtensions(true)
			];
			if (this.disposed) {
				return;
			}
			this._onDidChangeExtensions.fire({ added: this.extensions, removed: [], isProfileSwitch: false });
		} catch (error) {
			this.logService.error(error);
		}
		this._register(this.extensionManagementService.onDidInstallExtensions(e =>
			this.updateExtensions(e.reduce<IExtension[]>((result, { local, operation }) => {
				if (local && operation !== InstallOperation.Migrate) { result.push(local); } return result;
			}, []), [], undefined, false)));
		this._register(Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error))(e => this.updateExtensions([], [e.identifier], e.server, false)));
		this._register(this.extensionManagementService.onDidChangeProfile(({ added, removed, server }) => {
			this.updateExtensions(added, removed.map(({ identifier }) => identifier), server, true);
		}));
	}

	private updateExtensions(added: IExtension[], identifiers: IExtensionIdentifier[], server: IExtensionManagementServer | undefined, isProfileSwitch: boolean): void {
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
		const removed: IExtension[] = [];
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
}

registerSingleton(IWorkbenchExtensionEnablementService, ExtensionEnablementService, InstantiationType.Delayed);
