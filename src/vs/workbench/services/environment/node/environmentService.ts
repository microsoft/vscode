/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { toBackupWorkspaceResource } from 'vs/workbench/services/backup/common/backup';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class WorkbenchEnvironmentService extends EnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand!: ServiceIdentifier<any>;

	constructor(
		private _configuration: IWindowConfiguration,
		execPath: string
	) {
		super(_configuration, execPath);

		this._configuration.backupWorkspaceResource = this._configuration.backupPath ? toBackupWorkspaceResource(this._configuration.backupPath, this) : undefined;
	}

	get configuration(): IWindowConfiguration {
		return this._configuration;
	}

	@memoize
	get userRoamingDataHome(): URI { return this.appSettingsHome.with({ scheme: Schemas.userData }); }
}
