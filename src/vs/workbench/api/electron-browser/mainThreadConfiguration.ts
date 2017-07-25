/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { MainThreadConfigurationShape, ExtHostContext } from '../node/extHost.protocol';

export class MainThreadConfiguration extends MainThreadConfigurationShape {

	private _configurationEditingService: IConfigurationEditingService;
	private _toDispose: IDisposable;

	constructor(
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IThreadService threadService: IThreadService
	) {
		super();
		this._configurationEditingService = configurationEditingService;
		const proxy = threadService.get(ExtHostContext.ExtHostConfiguration);

		this._toDispose = configurationService.onDidUpdateConfiguration(() => {
			proxy.$acceptConfigurationChanged(configurationService.getConfigurationData());
		});
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any, resource: URI): TPromise<void> {
		return this._configurationEditingService.writeConfiguration(target, { key, value }, { donotNotifyError: true, scopes: { resource } });
	}

	$removeConfigurationOption(target: ConfigurationTarget, key: string, resource: URI): TPromise<void> {
		return this._configurationEditingService.writeConfiguration(target, { key, value: undefined }, { donotNotifyError: true, scopes: { resource } });
	}
}
