/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PerformanceMark } from 'vs/base/common/performance';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IColorScheme, INativeWindowConfiguration, IOSConfiguration, IPath, IPathsToWaitFor } from 'vs/platform/window/common/window';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AbstractNativeEnvironmentService } from 'vs/platform/environment/common/environmentService';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { join } from 'vs/base/common/path';
import { IProductService } from 'vs/platform/product/common/productService';
import { joinPath } from 'vs/base/common/resources';

export const INativeWorkbenchEnvironmentService = refineServiceDecorator<IEnvironmentService, INativeWorkbenchEnvironmentService>(IEnvironmentService);

/**
 * A subclass of the `IWorkbenchEnvironmentService` to be used only in native
 * environments (Windows, Linux, macOS) but not e.g. web.
 */
export interface INativeWorkbenchEnvironmentService extends IBrowserWorkbenchEnvironmentService, INativeEnvironmentService {

	// --- Window
	readonly window: {
		id: number;
		colorScheme: IColorScheme;
		maximized?: boolean;
		accessibilitySupport?: boolean;
		isInitialStartup?: boolean;
		isCodeCaching?: boolean;
		perfMarks: PerformanceMark[];
	};

	// --- Main
	readonly mainPid: number;
	readonly os: IOSConfiguration;
	readonly machineId: string;

	// --- Paths
	readonly execPath: string;
	readonly backupPath?: string;

	// --- Development
	readonly crashReporterDirectory?: string;
	readonly crashReporterId?: string;

	// --- Editors to --wait
	readonly filesToWait?: IPathsToWaitFor;
}

export class NativeWorkbenchEnvironmentService extends AbstractNativeEnvironmentService implements INativeWorkbenchEnvironmentService {

	@memoize
	get mainPid() { return this.configuration.mainPid; }

	@memoize
	get machineId() { return this.configuration.machineId; }

	@memoize
	get remoteAuthority() { return this.configuration.remoteAuthority; }

	@memoize
	get execPath() { return this.configuration.execPath; }

	@memoize
	get backupPath() { return this.configuration.backupPath; }

	@memoize
	get window() {
		return {
			id: this.configuration.windowId,
			colorScheme: this.configuration.colorScheme,
			maximized: this.configuration.maximized,
			accessibilitySupport: this.configuration.accessibilitySupport,
			perfMarks: this.configuration.perfMarks,
			isInitialStartup: this.configuration.isInitialStartup,
			isCodeCaching: typeof this.configuration.codeCachePath === 'string'
		};
	}

	@memoize
	override get userRoamingDataHome(): URI { return this.appSettingsHome.with({ scheme: Schemas.vscodeUserData }); }

	@memoize
	get windowLogsPath(): URI { return URI.file(join(this.logsPath, `window${this.configuration.windowId}`)); }

	@memoize
	get logFile(): URI { return joinPath(this.windowLogsPath, `renderer.log`); }

	@memoize
	get extHostLogsPath(): URI { return joinPath(this.windowLogsPath, 'exthost'); }

	@memoize
	get extHostTelemetryLogFile(): URI {
		return joinPath(this.extHostLogsPath, 'telemetry.log');
	}

	@memoize
	get webviewExternalEndpoint(): string { return `${Schemas.vscodeWebview}://{{uuid}}`; }

	@memoize
	get skipReleaseNotes(): boolean { return !!this.args['skip-release-notes']; }

	@memoize
	get skipWelcome(): boolean { return !!this.args['skip-welcome']; }

	@memoize
	get logExtensionHostCommunication(): boolean { return !!this.args.logExtensionHostCommunication; }

	@memoize
	get enableSmokeTestDriver(): boolean { return !!this.args['enable-smoke-test-driver']; }

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

	@memoize
	get os(): IOSConfiguration { return this.configuration.os; }

	@memoize
	get filesToOpenOrCreate(): IPath[] | undefined { return this.configuration.filesToOpenOrCreate; }

	@memoize
	get filesToDiff(): IPath[] | undefined { return this.configuration.filesToDiff; }

	@memoize
	get filesToMerge(): IPath[] | undefined { return this.configuration.filesToMerge; }

	@memoize
	get filesToWait(): IPathsToWaitFor | undefined { return this.configuration.filesToWait; }

	constructor(
		private readonly configuration: INativeWindowConfiguration,
		productService: IProductService
	) {
		super(configuration, { homeDir: configuration.homeDir, tmpDir: configuration.tmpDir, userDataDir: configuration.userDataDir }, productService);
	}
}
