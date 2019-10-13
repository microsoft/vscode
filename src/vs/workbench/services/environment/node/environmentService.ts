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
import { join } from 'vs/base/common/path';
import { IDebugParams } from 'vs/platform/environment/common/environment';
import product from 'vs/platform/product/common/product';

export class WorkbenchEnvironmentService extends EnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand: undefined;

	get webviewExternalEndpoint(): string {
		const baseEndpoint = 'https://{{uuid}}.vscode-webview-test.com/{{commit}}';
		return baseEndpoint.replace('{{commit}}', product.commit || '211fa02efe8c041fd7baa8ec3dce199d5185aa44');
	}

	readonly webviewResourceRoot = 'vscode-resource://{{resource}}';
	readonly webviewCspSource = 'vscode-resource:';

	constructor(
		readonly configuration: IWindowConfiguration,
		execPath: string,
		private readonly windowId: number
	) {
		super(configuration, execPath);

		this.configuration.backupWorkspaceResource = this.configuration.backupPath ? toBackupWorkspaceResource(this.configuration.backupPath, this) : undefined;
	}

	get skipReleaseNotes(): boolean { return !!this.args['skip-release-notes']; }

	@memoize
	get userRoamingDataHome(): URI { return this.appSettingsHome.with({ scheme: Schemas.userData }); }

	@memoize
	get logFile(): URI { return URI.file(join(this.logsPath, `renderer${this.windowId}.log`)); }

	get logExtensionHostCommunication(): boolean { return !!this.args.logExtensionHostCommunication; }

	@memoize
	get debugSearch(): IDebugParams { return parseSearchPort(this.args, this.isBuilt); }
}
