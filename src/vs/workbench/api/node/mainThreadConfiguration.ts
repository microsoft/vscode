/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ExtHostContext, ExtHostConfigurationShape} from './extHostProtocol';

export class MainThreadConfiguration {

	private _configurationService: IConfigurationService;
	private _toDispose: IDisposable;
	private _proxy: ExtHostConfigurationShape;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IThreadService threadService: IThreadService
	) {

		this._configurationService = configurationService;
		this._proxy = threadService.get(ExtHostContext.ExtHostConfiguration);

		this._toDispose = this._configurationService.onDidUpdateConfiguration(event => this._proxy.$acceptConfigurationChanged(event.config));
		this._proxy.$acceptConfigurationChanged(this._configurationService.getConfiguration());
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}
}
