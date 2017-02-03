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
	diff?: boolean;
	goto?: boolean;
	'new-window'?: boolean;
	'new-window-if-not-first'?: boolean;
	'reuse-window'?: boolean;
	locale?: string;
	'user-data-dir'?: string;
	performance?: boolean;
	verbose?: boolean;
	logExtensionHostCommunication?: boolean;
	'disable-extensions'?: boolean;
	'extensions-dir'?: string;
	extensionDevelopmentPath?: string;
	extensionTestsPath?: string;
	debugBrkPluginHost?: string;
	debugPluginHost?: string;
	'list-extensions'?: boolean;
	'show-versions'?: boolean;
	'install-extension'?: string | string[];
	'uninstall-extension'?: string | string[];
	'open-url'?: string | string[];
}

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IEnvironmentService {
	_serviceBrand: any;

	args: ParsedArgs;

	execPath: string;
	appRoot: string;

	userHome: string;
	userProductHome: string;
	userDataPath: string;

	appNameLong: string;
	appQuality: string;
	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;

	backupHome: string;
	backupWorkspacesPath: string;

	isExtensionDevelopment: boolean;
	disableExtensions: boolean;
	extensionsPath: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;

	debugExtensionHost: { port: number; break: boolean; };

	logExtensionHostCommunication: boolean;

	isBuilt: boolean;
	verbose: boolean;
	wait: boolean;
	performance: boolean;

	mainIPCHandle: string;
	sharedIPCHandle: string;

	nodeCachedDataDir: string;
}
