/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');
export const INativeEnvironmentService = createDecorator<INativeEnvironmentService>('nativeEnvironmentService');

export interface IDebugParams {
	port: number | null;
	break: boolean;
}

export interface IExtensionHostDebugParams extends IDebugParams {
	debugId?: string;
}

/**
 * A basic environment service that can be used in various processes,
 * such as main, renderer and shared process. Use subclasses of this
 * service for specific environment.
 */
export interface IEnvironmentService {

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE. AS SUCH:
	//       - PUT NON-WEB PROPERTIES INTO NATIVE ENV SERVICE
	//       - PUT WORKBENCH ONLY PROPERTIES INTO WB ENV SERVICE
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	readonly _serviceBrand: undefined;

	// --- user roaming data
	userRoamingDataHome: URI;
	settingsResource: URI;
	keybindingsResource: URI;
	keyboardLayoutResource: URI;
	argvResource: URI;
	snippetsHome: URI;

	// --- data paths
	untitledWorkspacesHome: URI;

	globalStorageHome: URI;
	workspaceStorageHome: URI;

	// --- settings sync
	userDataSyncLogResource: URI;
	userDataSyncHome: URI;
	sync: 'on' | 'off' | undefined;

	// --- extension development
	debugExtensionHost: IExtensionHostDebugParams;
	isExtensionDevelopment: boolean;
	disableExtensions: boolean | string[];
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsLocationURI?: URI;

	// --- logging
	logsPath: string;
	logLevel?: string;
	verbose: boolean;
	isBuilt: boolean;

	// --- misc
	disableTelemetry: boolean;
	serviceMachineIdResource: URI;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE. AS SUCH:
	//       - PUT NON-WEB PROPERTIES INTO NATIVE ENV SERVICE
	//       - PUT WORKBENCH ONLY PROPERTIES INTO WB ENV SERVICE
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}

/**
 * A subclass of the `IEnvironmentService` to be used only in native
 * environments (Windows, Linux, macOS) but not e.g. web.
 */
export interface INativeEnvironmentService extends IEnvironmentService {

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE. AS SUCH:
	//       - PUT WORKBENCH ONLY PROPERTIES INTO WB ENV SERVICE
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	// --- CLI Arguments
	args: NativeParsedArgs;

	// --- paths
	appRoot: string;
	userHome: URI;
	appSettingsHome: URI;
	tmpDir: URI;
	userDataPath: string;
	machineSettingsResource: URI;
	backupHome: string;
	backupWorkspacesPath: string;
	nodeCachedDataDir?: string;
	installSourcePath: string;

	// --- IPC Handles
	mainIPCHandle: string;
	sharedIPCHandle: string;

	// --- Extensions
	extensionsPath?: string;
	extensionsDownloadPath: string;
	builtinExtensionsPath: string;

	// --- Smoke test support
	driverHandle?: string;
	driverVerbose: boolean;

	// --- Misc. config
	disableUpdates: boolean;
	sandbox: boolean;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE. AS SUCH:
	//       - PUT WORKBENCH ONLY PROPERTIES INTO WB ENV SERVICE
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}
