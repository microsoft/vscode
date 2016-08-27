/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {IWorkbenchConfigurationService} from 'vs/workbench/services/configuration/common/configuration';
import {IConfigurationEditingService, ConfigurationTarget} from 'vs/workbench/services/configuration/common/configurationEditing';
import {MainThreadConfigurationShape, ExtHostContext} from './extHost.protocol';

export class MainThreadConfiguration extends MainThreadConfigurationShape {

	private _configurationEditingService: IConfigurationEditingService;
	private _toDispose: IDisposable;

	constructor(
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService,
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
		@IThreadService threadService: IThreadService
	) {
		super();
		this._configurationEditingService = configurationEditingService;
		const proxy = threadService.get(ExtHostContext.ExtHostConfiguration);
		this._toDispose = configurationService.onDidUpdateConfiguration(event => proxy.$acceptConfigurationChanged(event.config));
		proxy.$acceptConfigurationChanged(configurationService.getConfiguration());
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<void> {
		return this._configurationEditingService.writeConfiguration(target, [{ key, value }]);
	}
}
