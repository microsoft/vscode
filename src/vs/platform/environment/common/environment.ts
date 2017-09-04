/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ParsedArgs {
	[arg: string]: any;
	_: string[];
	help?: boolean;
	version?: boolean;
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
	verbose?: boolean;
	logExtensionHostCommunication?: boolean;
	'disable-extensions'?: boolean;
	'extensions-dir'?: string;
	extensionDevelopmentPath?: string;
	extensionTestsPath?: string;
	debugBrkPluginHost?: string;
	debugId?: string;
	debugPluginHost?: string;
	'list-extensions'?: boolean;
	'show-versions'?: boolean;
	'install-extension'?: string | string[];
	'uninstall-extension'?: string | string[];
	'enable-proposed-api'?: string | string[];
	'open-url'?: string | string[];
	'skip-getting-started'?: boolean;
}

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IEnvironmentService {
	_serviceBrand: any;

	args: ParsedArgs;

	execPath: string;
	appRoot: string;

	userHome: string;
	userDataPath: string;

	appNameLong: string;
	appQuality: string;
	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;
	machineUUID: string;

	backupHome: string;
	backupWorkspacesPath: string;

	workspacesHome: string;

	isExtensionDevelopment: boolean;
	disableExtensions: boolean;
	extensionsPath: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;

	debugExtensionHost: { port: number; break: boolean; debugId: string };


	logExtensionHostCommunication: boolean;

	isBuilt: boolean;
	verbose: boolean;
	wait: boolean;
	performance: boolean;
	profileStartup: { prefix: string, dir: string } | undefined;

	skipGettingStarted: boolean | undefined;

	mainIPCHandle: string;
	sharedIPCHandle: string;

	nodeCachedDataDir: string;
}
