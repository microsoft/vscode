/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowConfiguration, IPath, IPathsToWaitFor } from 'vs/platform/windows/common/windows';
import { IExtensionHostDebugParams, IDebugParams, BACKUPS } from 'vs/platform/environment/common/environment';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ExportData } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';
import { joinPath } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';
import { generateUuid } from 'vs/base/common/uuid';

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

export interface IBrowserWindowConfiguration {
	workspaceId: string;
	remoteAuthority?: string;
	webviewEndpoint?: string;
	connectionToken?: string;
}

export class BrowserWorkbenchEnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand!: ServiceIdentifier<IWorkbenchEnvironmentService>;

	readonly configuration: IWindowConfiguration = new BrowserWindowConfiguration();

	constructor(workspaceId: string, public readonly options: IWorkbenchConstructionOptions) {
		this.args = { _: [] };
		this.appRoot = '/web/';
		this.appNameLong = 'Visual Studio Code - Web';

		this.configuration.remoteAuthority = options.remoteAuthority;
		this.configuration.machineId = generateUuid();
		this.userRoamingDataHome = URI.file('/User').with({ scheme: Schemas.userData });
		this.settingsResource = joinPath(this.userRoamingDataHome, 'settings.json');
		this.keybindingsResource = joinPath(this.userRoamingDataHome, 'keybindings.json');
		this.keyboardLayoutResource = joinPath(this.userRoamingDataHome, 'keyboardLayout.json');
		this.localeResource = joinPath(this.userRoamingDataHome, 'locale.json');
		this.backupHome = joinPath(this.userRoamingDataHome, BACKUPS);
		this.configuration.backupWorkspaceResource = joinPath(this.backupHome, workspaceId);
		this.configuration.connectionToken = options.connectionToken || this.getConnectionTokenFromLocation();

		this.logsPath = '/web/logs';

		this.debugExtensionHost = {
			port: null,
			break: false
		};

		this.webviewEndpoint = options.webviewEndpoint;
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
	skipGettingStarted: boolean;
	skipReleaseNotes: boolean;
	skipAddToRecentlyOpened: boolean;
	mainIPCHandle: string;
	sharedIPCHandle: string;
	nodeCachedDataDir?: string;
	installSourcePath: string;
	disableUpdates: boolean;
	disableCrashReporter: boolean;
	driverHandle?: string;
	driverVerbose: boolean;
	webviewEndpoint?: string;
	galleryMachineIdResource?: URI;

	get webviewResourceRoot(): string {
		return this.webviewEndpoint ? this.webviewEndpoint + '/vscode-resource{{resource}}' : 'vscode-resource:{{resource}}';
	}

	get webviewCspSource(): string {
		return this.webviewEndpoint ? this.webviewEndpoint : 'vscode-resource:';
	}

	private getConnectionTokenFromLocation(): string | undefined {
		// TODO: Check with @alexd where the token will be: search or hash?
		let connectionToken: string | undefined = undefined;
		if (document.location.search) {
			connectionToken = this.getConnectionToken(document.location.search);
		}
		if (!connectionToken && document.location.hash) {
			connectionToken = this.getConnectionToken(document.location.hash);
		}
		return connectionToken;
	}

	private getConnectionToken(str: string): string | undefined {
		const m = str.match(/[#&?]tkn=([^&]+)/);
		return m ? m[1] : undefined;
	}
}
