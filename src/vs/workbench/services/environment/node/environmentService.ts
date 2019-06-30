/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class WorkbenchEnvironmentService extends EnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand: any;

	constructor(
		private _configuration: IWindowConfiguration,
		execPath: string
	) {
		super(_configuration, execPath);
	}

	get configuration(): IWindowConfiguration {
		return this._configuration;
	}
}
