/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ParsedArgs {
	[arg: string]: any;
	_: string[];
	_urls?: string[];
	help?: boolean;
	version?: boolean;
	status?: boolean;
	wait?: boolean;
	waitMarkerFilePath?: string;
	diff?: boolean;
	add?: boolean;
	goto?: boolean;
	'new-window'?: boolean;
	'unity-launch'?: boolean; // Always open a new window, except if opening the first window or opening a file or folder as part of the launch.
	'reuse-window'?: boolean;
	locale?: string;
	'user-data-dir'?: string;
	performance?: boolean;
	'prof-startup'?: string;
	'prof-startup-prefix'?: string;
	verbose?: boolean;
	log?: string;
	logExtensionHostCommunication?: boolean;
	'disable-extensions'?: boolean;
	'extensions-dir'?: string;
	extensionDevelopmentPath?: string;
	extensionTestsPath?: string;
	debugPluginHost?: string;
	debugBrkPluginHost?: string;
	debugId?: string;
	debugSearch?: string;
	debugBrkSearch?: string;
	'list-extensions'?: boolean;
	'show-versions'?: boolean;
	'install-extension'?: string | string[];
	'uninstall-extension'?: string | string[];
	'enable-proposed-api'?: string | string[];
	'open-url'?: boolean;
	'skip-getting-started'?: boolean;
	'skip-release-notes'?: boolean;
	'sticky-quickopen'?: boolean;
	'disable-restore-windows'?: boolean;
	'disable-telemetry'?: boolean;
	'export-default-configuration'?: string;
	'install-source'?: string;
	'disable-updates'?: string;
	'disable-crash-reporter'?: string;
	'skip-add-to-recently-opened'?: boolean;
	'max-memory'?: number;
	'file-write'?: boolean;
	'file-chmod'?: boolean;
	'upload-logs'?: string;
	'driver'?: string;
}

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IDebugParams {
	port: number;
	break: boolean;
}

export interface IExtensionHostDebugParams extends IDebugParams {
	debugId: string;
}

export interface IEnvironmentService {
	_serviceBrand: any;

	args: ParsedArgs;

	execPath: string;
	cliPath: string;
	appRoot: string;

	userHome: string;
	userDataPath: string;

	appNameLong: string;
	appQuality: string;
	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;

	settingsSearchBuildId: number;
	settingsSearchUrl: string;

	backupHome: string;
	backupWorkspacesPath: string;

	workspacesHome: string;

	isExtensionDevelopment: boolean;
	disableExtensions: boolean;
	extensionsPath: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;

	debugExtensionHost: IExtensionHostDebugParams;
	debugSearch: IDebugParams;


	logExtensionHostCommunication: boolean;

	isBuilt: boolean;
	wait: boolean;
	status: boolean;
	performance: boolean;

	// logging
	logsPath: string;
	verbose: boolean;

	skipGettingStarted: boolean | undefined;
	skipReleaseNotes: boolean | undefined;

	skipAddToRecentlyOpened: boolean;

	mainIPCHandle: string;
	sharedIPCHandle: string;

	nodeCachedDataDir: string;

	installSourcePath: string;
	disableUpdates: boolean;
	disableCrashReporter: boolean;

	driverHandle: string;
}
