/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchConfiguration, IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { INativeWindowConfiguration, IOSConfiguration } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AbstractNativeEnvironmentService, INativeEnvironmentPaths } from 'vs/platform/environment/common/environmentService';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { join } from 'vs/base/common/path';
import { IProductService } from 'vs/platform/product/common/productService';

export const INativeWorkbenchEnvironmentService = refineServiceDecorator<IEnvironmentService, INativeWorkbenchEnvironmentService>(IEnvironmentService);

export interface INativeWorkbenchConfiguration extends IWorkbenchConfiguration, INativeWindowConfiguration { }

/**
 * A subclass of the `IWorkbenchEnvironmentService` to be used only in native
 * environments (Windows, Linux, macOS) but not e.g. web.
 */
export interface INativeWorkbenchEnvironmentService extends IWorkbenchEnvironmentService, INativeEnvironmentService {

	readonly machineId: string;

	readonly crashReporterDirectory?: string;
	readonly crashReporterId?: string;

	readonly execPath: string;

	readonly log?: string;

	readonly os: IOSConfiguration;

	/**
	 * @deprecated this property will go away eventually as it
	 * duplicates many properties of the environment service
	 *
	 * Please consider using the environment service directly
	 * if you can.
	 */
	readonly configuration: INativeWorkbenchConfiguration;
}

export class NativeWorkbenchEnvironmentService extends AbstractNativeEnvironmentService implements INativeWorkbenchEnvironmentService {

	@memoize
	get machineId() { return this.configuration.machineId; }

	@memoize
	get sessionId() { return this.configuration.sessionId; }

	@memoize
	get remoteAuthority() { return this.configuration.remoteAuthority; }

	@memoize
	get execPath() { return this.configuration.execPath; }

	@memoize
	get userRoamingDataHome(): URI { return this.appSettingsHome.with({ scheme: Schemas.userData }); }

	@memoize
	get logFile(): URI { return URI.file(join(this.logsPath, `renderer${this.configuration.windowId}.log`)); }

	@memoize
	get extHostLogsPath(): URI { return URI.file(join(this.logsPath, `exthost${this.configuration.windowId}`)); }

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
	get skipReleaseNotes(): boolean { return !!this.args['skip-release-notes']; }

	@memoize
	get logExtensionHostCommunication(): boolean { return !!this.args.logExtensionHostCommunication; }

	@memoize
	get extensionEnabledProposedApi(): string[] | undefined {
		if (Array.isArray(this.args['enable-proposed-api'])) {
			return this.args['enable-proposed-api'];
		}

		if ('enable-proposed-api' in this.args) {
			return [];
		}

		return undefined;
	}

	get os(): IOSConfiguration {
		return this.configuration.os;
	}

	constructor(
		readonly configuration: INativeWorkbenchConfiguration,
		paths: INativeEnvironmentPaths,
		productService: IProductService
	) {
		super(configuration, paths, productService);
	}
}
