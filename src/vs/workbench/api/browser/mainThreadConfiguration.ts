/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, getScopes } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { MainThreadConfigurationShape, MainContext, ExtHostContext, IExtHostContext, IConfigurationInitData } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ConfigurationTarget, IConfigurationService, IConfigurationOverrides, IConfigurationValue } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

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

	$updateConfigurationOption(target: ConfigurationTarget | null, key: string, value: any, overrides: IConfigurationOverrides | undefined): Promise<void> {
		overrides = { resource: overrides?.resource ? URI.revive(overrides.resource) : undefined, overrideIdentifier: overrides?.overrideIdentifier };
		return this.writeConfiguration(target, key, value, overrides);
	}

	$removeConfigurationOption(target: ConfigurationTarget | null, key: string, overrides: IConfigurationOverrides | undefined): Promise<void> {
		overrides = { resource: overrides?.resource ? URI.revive(overrides.resource) : undefined, overrideIdentifier: overrides?.overrideIdentifier };
		return this.writeConfiguration(target, key, undefined, overrides);
	}

	private writeConfiguration(target: ConfigurationTarget | null, key: string, value: any, overrides: IConfigurationOverrides): Promise<void> {
		const configurationValue = this.configurationService.inspect(key, overrides);
		target = target !== null && target !== undefined ? target : this.deriveConfigurationTarget(key, configurationValue, overrides);
		switch (target) {
			case ConfigurationTarget.MEMORY:
				return this._updateValue(key, value, target, configurationValue.memory?.override, overrides);
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return this._updateValue(key, value, target, configurationValue.workspaceFolder?.override, overrides);
			case ConfigurationTarget.WORKSPACE:
				return this._updateValue(key, value, target, configurationValue.workspace?.override, overrides);
			case ConfigurationTarget.USER_REMOTE:
				return this._updateValue(key, value, target, configurationValue.userRemote?.override, overrides);
			default:
				return this._updateValue(key, value, target, configurationValue.userLocal?.override, overrides);
		}
	}

	private _updateValue(key: string, value: any, configurationTarget: ConfigurationTarget, overriddenValue: any | undefined, overrides: IConfigurationOverrides): Promise<void> {
		if (overrides.overrideIdentifier && overriddenValue !== undefined) {
			return this.configurationService.updateValue(key, value, overrides, configurationTarget);
		} else {
			return this.configurationService.updateValue(key, value, { resource: overrides.resource }, configurationTarget);
		}
	}

	private deriveConfigurationTarget(key: string, configurationValue: IConfigurationValue<any>, overrides: IConfigurationOverrides): ConfigurationTarget {
		if (overrides.overrideIdentifier) {
			if (configurationValue.memory?.override !== undefined) {
				return ConfigurationTarget.MEMORY;
			}
			if (configurationValue.workspaceFolder?.override !== undefined) {
				return ConfigurationTarget.WORKSPACE_FOLDER;
			}
			if (configurationValue.workspace?.override !== undefined) {
				return ConfigurationTarget.WORKSPACE;
			}
			if (configurationValue.userRemote?.override !== undefined) {
				return ConfigurationTarget.USER_REMOTE;
			}
			if (configurationValue.userLocal?.override !== undefined) {
				return ConfigurationTarget.USER_LOCAL;
			}
		}
		if (overrides.resource && this._workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
			if (configurationProperties[key] && (configurationProperties[key].scope === ConfigurationScope.RESOURCE || configurationProperties[key].scope === ConfigurationScope.RESOURCE_LANGUAGE)) {
				return ConfigurationTarget.WORKSPACE_FOLDER;
			}
		}
		return ConfigurationTarget.WORKSPACE;
	}
}
