/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowConfiguration, IPath, IPathsToWaitFor } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, IExtensionHostDebugParams, IDebugParams } from 'vs/platform/environment/common/environment';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ExportData } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';
import { joinPath } from 'vs/base/common/resources';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';
import { Schemas } from 'vs/base/common/network';

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

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	remoteAuthority: string;

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

export class BrowserWorkbenchEnvironmentService implements IEnvironmentService {
	_serviceBrand: ServiceIdentifier<IEnvironmentService>;

	readonly configuration: IWindowConfiguration = new BrowserWindowConfiguration();

	constructor(configuration: IWorkbenchConstructionOptions, remoteUserDataUri: URI | null) {
		this.args = { _: [] };
		this.appRoot = '/web/';
		this.appNameLong = 'Visual Studio Code - Web';

		this.configuration.remoteAuthority = configuration.remoteAuthority;

		if (remoteUserDataUri) {
			this.appSettingsHome = remoteUserDataUri || URI.file('/User').with({ scheme: Schemas.userData });
			this.settingsResource = joinPath(this.appSettingsHome, 'settings.json');
			this.keybindingsResource = joinPath(this.appSettingsHome, 'keybindings.json');
		} else {
			const appSettingsHome = URI.file('/User').with({ scheme: Schemas.userData });
			this.settingsResource = joinPath(appSettingsHome, 'settings.json');
			this.keybindingsResource = joinPath(appSettingsHome, 'keybindings.json');
		}

		this.keyboardLayoutResource = joinPath(this.appSettingsHome, 'keyboardLayout.json');

		this.logsPath = '/web/logs';

		this.debugExtensionHost = {
			port: null,
			break: false
		};

		this.webviewEndpoint = configuration.webviewEndpoint;
		this.untitledWorkspacesHome = URI.from({ scheme: Schemas.untitled, path: 'Workspaces' });
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
	settingsResource: URI;
	keybindingsResource: URI;
	keyboardLayoutResource: URI;
	machineSettingsHome: URI;
	machineSettingsResource: URI;
	settingsSearchBuildId?: number;
	settingsSearchUrl?: string;
	globalStorageHome: string;
	workspaceStorageHome: string;
	backupHome: string;
	backupWorkspacesPath: string;
	workspacesHome: string;
	isExtensionDevelopment: boolean;
	disableExtensions: boolean | string[];
	builtinExtensionsPath: string;
	extensionsPath: string;
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

	get webviewResourceRoot(): string {
		return this.webviewEndpoint ? this.webviewEndpoint + '/vscode-resource' : 'vscode-resource:';
	}
}
