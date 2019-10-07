/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { ExportData } from 'vs/base/common/performance';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { BACKUPS, IDebugParams, IExtensionHostDebugParams } from 'vs/platform/environment/common/environment';
import { LogLevel } from 'vs/platform/log/common/log';
import { IPath, IPathsToWaitFor, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';
import product from 'vs/platform/product/common/product';

export class BrowserWindowConfiguration implements IWindowConfiguration {

	_: any[];

	machineId: string;
	windowId: number;
	logLevel: LogLevel;

	mainPid: number;

	appRoot: string;
	execPath: string;
	isInitialStartup?: boolean;

	userEnv: IProcessEnvironment;
	nodeCachedDataDir?: string;

	backupPath?: string;
	backupWorkspaceResource?: URI;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	remoteAuthority?: string;
	connectionToken?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	frameless?: boolean;
	accessibilitySupport?: boolean;
	partsSplashPath?: string;

	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
	perfEntries: ExportData;

	filesToOpenOrCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;
}

interface IBrowserWorkbenchEnvironemntConstructionOptions extends IWorkbenchConstructionOptions {
	workspaceId: string;
	logsPath: URI;
}

export class BrowserWorkbenchEnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand: undefined;

	readonly configuration: IWindowConfiguration = new BrowserWindowConfiguration();

	constructor(readonly options: IBrowserWorkbenchEnvironemntConstructionOptions) {
		this.args = { _: [] };
		this.logsPath = options.logsPath.path;
		this.logFile = joinPath(options.logsPath, 'window.log');
		this.appRoot = '/web/';
		this.appNameLong = 'Visual Studio Code - Web';

		this.configuration.remoteAuthority = options.remoteAuthority;
		this.configuration.machineId = generateUuid();
		this.userRoamingDataHome = URI.file('/User').with({ scheme: Schemas.userData });
		this.settingsResource = joinPath(this.userRoamingDataHome, 'settings.json');
		this.settingsSyncPreviewResource = joinPath(this.userRoamingDataHome, '.settings.json');
		this.userDataSyncLogResource = joinPath(options.logsPath, 'userDataSync.log');
		this.keybindingsResource = joinPath(this.userRoamingDataHome, 'keybindings.json');
		this.keyboardLayoutResource = joinPath(this.userRoamingDataHome, 'keyboardLayout.json');
		this.localeResource = joinPath(this.userRoamingDataHome, 'locale.json');
		this.backupHome = joinPath(this.userRoamingDataHome, BACKUPS);
		this.configuration.backupWorkspaceResource = joinPath(this.backupHome, options.workspaceId);
		this.configuration.connectionToken = options.connectionToken || getCookieValue('vscode-tkn');

		this.debugExtensionHost = {
			port: null,
			break: false
		};

		this.untitledWorkspacesHome = URI.from({ scheme: Schemas.untitled, path: 'Workspaces' });

		if (document && document.location && document.location.search) {
			const map = new Map<string, string>();
			const query = document.location.search.substring(1);
			const vars = query.split('&');
			for (let p of vars) {
				const pair = p.split('=');
				if (pair.length >= 2) {
					map.set(pair[0], decodeURIComponent(pair[1]));
				}
			}

			const edp = map.get('edp');
			if (edp) {
				this.extensionDevelopmentLocationURI = [URI.parse(edp)];
				this.isExtensionDevelopment = true;
			}

			const di = map.get('di');
			if (di) {
				this.debugExtensionHost.debugId = di;
			}

			const ibe = map.get('ibe');
			if (ibe) {
				this.debugExtensionHost.port = parseInt(ibe);
				this.debugExtensionHost.break = false;
			}
		}
	}

	untitledWorkspacesHome: URI;
	extensionTestsLocationURI?: URI;
	args: any;
	execPath: string;
	cliPath: string;
	appRoot: string;
	userHome: string;
	userDataPath: string;
	appNameLong: string;
	appQuality?: string;
	appSettingsHome: URI;
	userRoamingDataHome: URI;
	settingsResource: URI;
	keybindingsResource: URI;
	keyboardLayoutResource: URI;
	localeResource: URI;
	settingsSyncPreviewResource: URI;
	userDataSyncLogResource: URI;
	machineSettingsHome: URI;
	machineSettingsResource: URI;
	globalStorageHome: string;
	workspaceStorageHome: string;
	backupHome: URI;
	backupWorkspacesPath: string;
	workspacesHome: string;
	isExtensionDevelopment: boolean;
	disableExtensions: boolean | string[];
	builtinExtensionsPath: string;
	extensionsPath?: string;
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsPath?: string;
	debugExtensionHost: IExtensionHostDebugParams;
	debugSearch: IDebugParams;
	logExtensionHostCommunication: boolean;
	isBuilt: boolean;
	wait: boolean;
	status: boolean;
	log?: string;
	logsPath: string;
	verbose: boolean;
	skipReleaseNotes: boolean;
	mainIPCHandle: string;
	sharedIPCHandle: string;
	nodeCachedDataDir?: string;
	installSourcePath: string;
	disableUpdates: boolean;
	disableCrashReporter: boolean;
	driverHandle?: string;
	driverVerbose: boolean;
	galleryMachineIdResource?: URI;
	readonly logFile: URI;

	get webviewExternalEndpoint(): string {
		// TODO: get fallback from product.json
		return (this.options.webviewEndpoint || 'https://{{uuid}}.vscode-webview-test.com/{{commit}}')
			.replace('{{commit}}', product.commit || '211fa02efe8c041fd7baa8ec3dce199d5185aa44');
	}

	get webviewResourceRoot(): string {
		return `${this.webviewExternalEndpoint}/vscode-resource/{{resource}}`;
	}

	get webviewCspSource(): string {
		return this.webviewExternalEndpoint
			.replace('{{uuid}}', '*');
	}
}

/**
 * See https://stackoverflow.com/a/25490531
 */
function getCookieValue(name: string): string | undefined {
	const m = document.cookie.match('(^|[^;]+)\\s*' + name + '\\s*=\\s*([^;]+)');
	return m ? m.pop() : undefined;
}
