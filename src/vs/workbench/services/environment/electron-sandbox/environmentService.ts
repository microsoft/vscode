/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchConfiguration } from 'vs/workbench/services/environment/common/environmentService';
import { PerformanceMark } from 'vs/base/common/performance';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IColorScheme, INativeWindowConfiguration, IOSConfiguration, IPath, IPathsToWaitFor } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AbstractNativeEnvironmentService } from 'vs/platform/environment/common/environmentService';
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
export interface INativeWorkbenchEnvironmentService extends IBrowserWorkbenchEnvironmentService, INativeEnvironmentService {

	readonly windowId: number;

	readonly mainPid: number;

	readonly machineId: string;

	readonly crashReporterDirectory?: string;
	readonly crashReporterId?: string;

	readonly execPath: string;

	readonly backupPath?: string;

	readonly log?: string;

	readonly os: IOSConfiguration;

	readonly filesToWait?: IPathsToWaitFor;

	readonly accessibilitySupport?: boolean;

	readonly windowMaximized?: boolean;

	readonly colorScheme: IColorScheme;

	readonly perf: {
		codeCachePath?: string;
		isInitialStartup?: boolean;
		marks: PerformanceMark[];
	}

	/**
	 * @deprecated this property will go away eventually as it
	 * duplicates many properties of the environment service
	 *
	 * Please consider using the environment service directly
	 * if you can.
	 */
	readonly configuration2: INativeWorkbenchConfiguration;
}

export class NativeWorkbenchEnvironmentService extends AbstractNativeEnvironmentService implements INativeWorkbenchEnvironmentService {

	@memoize
	get windowId() { return this.configuration2.windowId; }

	@memoize
	get mainPid() { return this.configuration2.mainPid; }

	@memoize
	get machineId() { return this.configuration2.machineId; }

	@memoize
	get remoteAuthority() { return this.configuration2.remoteAuthority; }

	@memoize
	get execPath() { return this.configuration2.execPath; }

	@memoize
	get backupPath() { return this.configuration2.backupPath; }

	@memoize
	get accessibilitySupport() { return this.configuration2.accessibilitySupport; }

	@memoize
	get windowMaximized() { return this.configuration2.maximized; }

	@memoize
	get colorScheme() { return this.configuration2.colorScheme; }

	@memoize
	get perf() {
		return {
			codeCachePath: this.configuration2.codeCachePath,
			isInitialStartup: this.configuration2.isInitialStartup,
			marks: this.configuration2.perfMarks
		};
	}

	@memoize
	override get userRoamingDataHome(): URI { return this.appSettingsHome.with({ scheme: Schemas.userData }); }

	@memoize
	get logFile(): URI { return URI.file(join(this.logsPath, `renderer${this.configuration2.windowId}.log`)); }

	@memoize
	get extHostLogsPath(): URI { return URI.file(join(this.logsPath, `exthost${this.configuration2.windowId}`)); }

	@memoize
	get webviewExternalEndpoint(): string { return `${Schemas.vscodeWebview}://{{uuid}}`; }

	@memoize
	get skipReleaseNotes(): boolean { return !!this.args['skip-release-notes']; }

	@memoize
	get skipWelcome(): boolean { return !!this.args['skip-welcome']; }

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
		return this.configuration2.os;
	}

	@memoize
	get filesToOpenOrCreate(): IPath[] | undefined {
		return this.configuration2.filesToOpenOrCreate;
	}

	@memoize
	get filesToDiff(): IPath[] | undefined {
		return this.configuration2.filesToDiff;
	}

	@memoize
	get filesToWait(): IPathsToWaitFor | undefined {
		return this.configuration2.filesToWait;
	}

	constructor(
		readonly configuration2: INativeWorkbenchConfiguration,
		productService: IProductService
	) {
		super(configuration2, { homeDir: configuration2.homeDir, tmpDir: configuration2.tmpDir, userDataDir: configuration2.userDataDir }, productService);
	}
}
