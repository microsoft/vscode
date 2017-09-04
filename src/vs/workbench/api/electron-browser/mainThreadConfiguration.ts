/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { MainThreadConfigurationShape, MainContext, ExtHostContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadConfiguration)
export class MainThreadConfiguration implements MainThreadConfigurationShape {

	private readonly _configurationListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IConfigurationEditingService private readonly _configurationEditingService: IConfigurationEditingService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
	) {
		const proxy = extHostContext.get(ExtHostContext.ExtHostConfiguration);

		this._configurationListener = configurationService.onDidUpdateConfiguration(() => {
			proxy.$acceptConfigurationChanged(configurationService.getConfigurationData());
		});
	}

	public dispose(): void {
		this._configurationListener.dispose();
	}

	$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any, resource: URI): TPromise<void> {
		return this.writeConfiguration(target, key, value, resource);
	}

	$removeConfigurationOption(target: ConfigurationTarget, key: string, resource: URI): TPromise<void> {
		return this.writeConfiguration(target, key, undefined, resource);
	}

	private writeConfiguration(target: ConfigurationTarget, key: string, value: any, resource: URI): TPromise<void> {
		target = target !== null && target !== undefined ? target : this.deriveConfigurationTarget(key, resource);
		return this._configurationEditingService.writeConfiguration(target, { key, value }, { donotNotifyError: true, scopes: { resource } });
	}

	private deriveConfigurationTarget(key: string, resource: URI): ConfigurationTarget {
		if (resource && this._workspaceContextService.hasMultiFolderWorkspace()) {
			const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
			if (configurationProperties[key] && configurationProperties[key].scope === ConfigurationScope.RESOURCE) {
				return ConfigurationTarget.FOLDER;
			}
		}
		return ConfigurationTarget.WORKSPACE;
	}
}
