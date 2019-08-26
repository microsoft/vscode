/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentService, parseSearchPort } from 'vs/platform/environment/node/environmentService';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { toBackupWorkspaceResource } from 'vs/workbench/services/backup/common/backup';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { join } from 'vs/base/common/path';
import { IDebugParams } from 'vs/platform/environment/common/environment';

export class WorkbenchEnvironmentService extends EnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand!: ServiceIdentifier<any>;

	readonly webviewResourceRoot = 'vscode-resource:{{resource}}';
	readonly webviewCspSource = 'vscode-resource:';

	constructor(
		readonly configuration: IWindowConfiguration,
		execPath: string
	) {
		super(configuration, execPath);

		this.configuration.backupWorkspaceResource = this.configuration.backupPath ? toBackupWorkspaceResource(this.configuration.backupPath, this) : undefined;
	}

	get skipGettingStarted(): boolean { return !!this.args['skip-getting-started']; }

	get skipReleaseNotes(): boolean { return !!this.args['skip-release-notes']; }

	@memoize
	get userRoamingDataHome(): URI { return this.appSettingsHome.with({ scheme: Schemas.userData }); }

	@memoize
	get logFile(): URI { return URI.file(join(this.logsPath, `renderer${this.configuration.windowId}.log`)); }

	get logExtensionHostCommunication(): boolean { return !!this.args.logExtensionHostCommunication; }

	@memoize
	get debugSearch(): IDebugParams { return parseSearchPort(this.args, this.isBuilt); }
}
