/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { MainThreadConfigurationShape, MainContext, ExtHostContext, IExtHostContext, IWorkspaceConfigurationChangeEventData } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationModel } from 'vs/platform/configuration/common/configuration';

@extHostNamedCustomer(MainContext.MainThreadConfiguration)
export class MainThreadConfiguration implements MainThreadConfigurationShape {

	private readonly _configurationListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService
	) {
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostConfiguration);

		this._configurationListener = configurationService.onDidChangeConfiguration(e => {
			proxy.$acceptConfigurationChanged(configurationService.getConfigurationData(), this.toConfigurationChangeEventData(e));
		});
	}

	public dispose(): void {
		this._configurationListener.dispose();
	}

	$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any, resourceUriComponenets: UriComponents): TPromise<void> {
		const resource = resourceUriComponenets ? URI.revive(resourceUriComponenets) : null;
		return this.writeConfiguration(target, key, value, resource);
	}

	$removeConfigurationOption(target: ConfigurationTarget, key: string, resourceUriComponenets: UriComponents): TPromise<void> {
		const resource = resourceUriComponenets ? URI.revive(resourceUriComponenets) : null;
		return this.writeConfiguration(target, key, undefined, resource);
	}

	private writeConfiguration(target: ConfigurationTarget, key: string, value: any, resource: URI): TPromise<void> {
		target = target !== null && target !== undefined ? target : this.deriveConfigurationTarget(key, resource);
		return this.configurationService.updateValue(key, value, { resource }, target, true);
	}

	private deriveConfigurationTarget(key: string, resource: URI): ConfigurationTarget {
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
