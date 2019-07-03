/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';

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

	@memoize
	get settingsResource(): URI { return joinPath(this.appSettingsHome, 'settings.json').with({ scheme: Schemas.userData }); }

	@memoize
	get keybindingsResource(): URI { return joinPath(this.appSettingsHome, 'keybindings.json').with({ scheme: Schemas.userData }); }
}
