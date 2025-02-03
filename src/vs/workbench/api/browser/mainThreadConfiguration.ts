/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, getScopes } from '../../../platform/configuration/common/configurationRegistry.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../platform/workspace/common/workspace.js';
import { MainThreadConfigurationShape, MainContext, ExtHostContext, IConfigurationInitData } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ConfigurationTarget, IConfigurationService, IConfigurationOverrides } from '../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';

@extHostNamedCustomer(MainContext.MainThreadConfiguration)
export class MainThreadConfiguration implements MainThreadConfigurationShape {

	private readonly _configurationListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostConfiguration);

		proxy.$initializeConfiguration(this._getConfigurationData());
		this._configurationListener = configurationService.onDidChangeConfiguration(e => {
			proxy.$acceptConfigurationChanged(this._getConfigurationData(), e.change);
		});
	}

	private _getConfigurationData(): IConfigurationInitData {
		const configurationData: IConfigurationInitData = { ...(this.configurationService.getConfigurationData()!), configurationScopes: [] };
		// Send configurations scopes only in development mode.
		if (!this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment) {
			configurationData.configurationScopes = getScopes();
		}
		return configurationData;
	}

	public dispose(): void {
		this._configurationListener.dispose();
	}

	$updateConfigurationOption(target: ConfigurationTarget | null, key: string, value: any, overrides: IConfigurationOverrides | undefined, scopeToLanguage: boolean | undefined): Promise<void> {
		overrides = { resource: overrides?.resource ? URI.revive(overrides.resource) : undefined, overrideIdentifier: overrides?.overrideIdentifier };
		return this.writeConfiguration(target, key, value, overrides, scopeToLanguage);
	}

	$removeConfigurationOption(target: ConfigurationTarget | null, key: string, overrides: IConfigurationOverrides | undefined, scopeToLanguage: boolean | undefined): Promise<void> {
		overrides = { resource: overrides?.resource ? URI.revive(overrides.resource) : undefined, overrideIdentifier: overrides?.overrideIdentifier };
		return this.writeConfiguration(target, key, undefined, overrides, scopeToLanguage);
	}

	private writeConfiguration(target: ConfigurationTarget | null, key: string, value: any, overrides: IConfigurationOverrides, scopeToLanguage: boolean | undefined): Promise<void> {
		target = target !== null && target !== undefined ? target : this.deriveConfigurationTarget(key, overrides);
		const configurationValue = this.configurationService.inspect(key, overrides);
		switch (target) {
			case ConfigurationTarget.MEMORY:
				return this._updateValue(key, value, target, configurationValue?.memory?.override, overrides, scopeToLanguage);
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return this._updateValue(key, value, target, configurationValue?.workspaceFolder?.override, overrides, scopeToLanguage);
			case ConfigurationTarget.WORKSPACE:
				return this._updateValue(key, value, target, configurationValue?.workspace?.override, overrides, scopeToLanguage);
			case ConfigurationTarget.USER_REMOTE:
				return this._updateValue(key, value, target, configurationValue?.userRemote?.override, overrides, scopeToLanguage);
			default:
				return this._updateValue(key, value, target, configurationValue?.userLocal?.override, overrides, scopeToLanguage);
		}
	}

	private _updateValue(key: string, value: any, configurationTarget: ConfigurationTarget, overriddenValue: any | undefined, overrides: IConfigurationOverrides, scopeToLanguage: boolean | undefined): Promise<void> {
		overrides = scopeToLanguage === true ? overrides
			: scopeToLanguage === false ? { resource: overrides.resource }
				: overrides.overrideIdentifier && overriddenValue !== undefined ? overrides
					: { resource: overrides.resource };
		return this.configurationService.updateValue(key, value, overrides, configurationTarget, { donotNotifyError: true });
	}

	private deriveConfigurationTarget(key: string, overrides: IConfigurationOverrides): ConfigurationTarget {
		if (overrides.resource && this._workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
			if (configurationProperties[key] && (configurationProperties[key].scope === ConfigurationScope.RESOURCE || configurationProperties[key].scope === ConfigurationScope.LANGUAGE_OVERRIDABLE)) {
				return ConfigurationTarget.WORKSPACE_FOLDER;
			}
		}
		return ConfigurationTarget.WORKSPACE;
	}
}
