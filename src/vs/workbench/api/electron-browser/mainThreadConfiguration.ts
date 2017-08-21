/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { MainThreadConfigurationShape, MainContext, ExtHostContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from "vs/workbench/api/electron-browser/extHostCustomers";

@extHostNamedCustomer(MainContext.MainThreadConfiguration)
export class MainThreadConfiguration implements MainThreadConfigurationShape {

	private readonly _configurationEditingService: IConfigurationEditingService;
	private readonly _configurationListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
	) {
		this._configurationEditingService = configurationEditingService;
		const proxy = extHostContext.get(ExtHostContext.ExtHostConfiguration);

		this._configurationListener = configurationService.onDidUpdateConfiguration(() => {
			proxy.$acceptConfigurationChanged(configurationService.getConfigurationData());
		});
	}

	public dispose(): void {
		this._configurationListener.dispose();
	}

	$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any, resource: URI): TPromise<void> {
		return this._configurationEditingService.writeConfiguration(target, { key, value }, { donotNotifyError: true, scopes: { resource } });
	}

	$removeConfigurationOption(target: ConfigurationTarget, key: string, resource: URI): TPromise<void> {
		return this._configurationEditingService.writeConfiguration(target, { key, value: undefined }, { donotNotifyError: true, scopes: { resource } });
	}
}
