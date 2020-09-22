/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { INativeWorkbenchConfiguration, INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { join } from 'vs/base/common/path';
import { IProductService } from 'vs/platform/product/common/productService';

export class NativeWorkbenchEnvironmentService extends NativeEnvironmentService implements INativeWorkbenchEnvironmentService {

	declare readonly _serviceBrand: undefined;

	@memoize
	get webviewExternalEndpoint(): string {
		const baseEndpoint = 'https://{{uuid}}.vscode-webview-test.com/{{commit}}';

		return baseEndpoint.replace('{{commit}}', this.productService.commit || '0d728c31ebdf03869d2687d9be0b017667c9ff37');
	}

	@memoize
	get webviewResourceRoot(): string { return `${Schemas.vscodeWebviewResource}://{{uuid}}/{{resource}}`; }

	@memoize
	get webviewCspSource(): string { return `${Schemas.vscodeWebviewResource}:`; }

	@memoize
	get userRoamingDataHome(): URI { return this.appSettingsHome.with({ scheme: Schemas.userData }); }

	// Do not memoize as `backupPath` can change in configuration
	get backupWorkspaceHome(): URI | undefined { return this.configuration.backupPath ? URI.file(this.configuration.backupPath).with({ scheme: this.userRoamingDataHome.scheme }) : undefined; }

	@memoize
	get logFile(): URI { return URI.file(join(this.logsPath, `renderer${this.configuration.windowId}.log`)); }

	@memoize
	get extHostLogsPath(): URI { return URI.file(join(this.logsPath, `exthost${this.configuration.windowId}`)); }

	@memoize
	get skipReleaseNotes(): boolean { return !!this.args['skip-release-notes']; }

	@memoize
	get logExtensionHostCommunication(): boolean { return !!this.args.logExtensionHostCommunication; }

	get extensionEnabledProposedApi(): string[] | undefined {
		if (Array.isArray(this.args['enable-proposed-api'])) {
			return this.args['enable-proposed-api'];
		}

		if ('enable-proposed-api' in this.args) {
			return [];
		}

		return undefined;
	}

	readonly execPath = this.configuration.execPath;

	constructor(
		readonly configuration: INativeWorkbenchConfiguration,
		private readonly productService: IProductService
	) {
		super(configuration);
	}
}
