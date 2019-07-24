/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, getScopes } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { MainThreadConfigurationShape, MainContext, ExtHostContext, IExtHostContext, IWorkspaceConfigurationChangeEventData, IConfigurationInitData } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationModel, IConfigurationService } from 'vs/platform/configuration/common/configuration';
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
			proxy.$acceptConfigurationChanged(this._getConfigurationData(), this.toConfigurationChangeEventData(e));
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

	$updateConfigurationOption(target: ConfigurationTarget | null, key: string, value: any, resourceUriComponenets: UriComponents | undefined): Promise<void> {
		const resource = resourceUriComponenets ? URI.revive(resourceUriComponenets) : null;
		return this.writeConfiguration(target, key, value, resource);
	}

	$removeConfigurationOption(target: ConfigurationTarget | null, key: string, resourceUriComponenets: UriComponents | undefined): Promise<void> {
		const resource = resourceUriComponenets ? URI.revive(resourceUriComponenets) : null;
		return this.writeConfiguration(target, key, undefined, resource);
	}

	private writeConfiguration(target: ConfigurationTarget | null, key: string, value: any, resource: URI | null): Promise<void> {
		target = target !== null && target !== undefined ? target : this.deriveConfigurationTarget(key, resource);
		return this.configurationService.updateValue(key, value, { resource }, target, true);
	}

	private deriveConfigurationTarget(key: string, resource: URI | null): ConfigurationTarget {
		if (resource && this._workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
			if (configurationProperties[key] && configurationProperties[key].scope === ConfigurationScope.RESOURCE) {
				return ConfigurationTarget.WORKSPACE_FOLDER;
			}
		}
		return ConfigurationTarget.WORKSPACE;
	}

	private toConfigurationChangeEventData(event: IConfigurationChangeEvent): IWorkspaceConfigurationChangeEventData {
		return {
			changedConfiguration: this.toJSONConfiguration(event.changedConfiguration),
			changedConfigurationByResource: event.changedConfigurationByResource.keys().reduce((result, resource) => {
				result[resource.toString()] = this.toJSONConfiguration(event.changedConfigurationByResource.get(resource));
				return result;
			}, Object.create({}))
		};
	}

	private toJSONConfiguration({ contents, keys, overrides }: IConfigurationModel = { contents: {}, keys: [], overrides: [] }): IConfigurationModel {
		return {
			contents,
			keys,
			overrides
		};
	}
}
