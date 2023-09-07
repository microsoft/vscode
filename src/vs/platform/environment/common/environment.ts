/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { createDecorator, refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');
export const INativeEnvironmentService = refineServiceDecorator<IEnvironmentService, INativeEnvironmentService>(IEnvironmentService);

export interface IDebugParams {
	port: number | null;
	break: boolean;
}

export interface IExtensionHostDebugParams extends IDebugParams {
	debugId?: string;
	env?: Record<string, string>;
}

/**
 * Type of extension.
 *
 * **NOTE**: This is defined in `platform/environment` because it can appear as a CLI argument.
 */
export type ExtensionKind = 'ui' | 'workspace' | 'web';

/**
 * A basic environment service that can be used in various processes,
 * such as main, renderer and shared process. Use subclasses of this
 * service for specific environment.
 */
export interface IEnvironmentService {

	readonly _serviceBrand: undefined;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE.
	//
	// AS SUCH:
	//   - PUT NON-WEB PROPERTIES INTO NATIVE ENVIRONMENT SERVICE
	//   - PUT WORKBENCH ONLY PROPERTIES INTO WORKBENCH ENVIRONMENT SERVICE
	//   - PUT ELECTRON-MAIN ONLY PROPERTIES INTO MAIN ENVIRONMENT SERVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	// --- user roaming data
	stateResource: URI;
	userRoamingDataHome: URI;
	keyboardLayoutResource: URI;
	argvResource: URI;

	// --- data paths
	untitledWorkspacesHome: URI;
	workspaceStorageHome: URI;
	localHistoryHome: URI;
	cacheHome: URI;

	// --- settings sync
	userDataSyncHome: URI;
	sync: 'on' | 'off' | undefined;

	// --- continue edit session
	continueOn?: string;
	editSessionId?: string;

	// --- extension development
	debugExtensionHost: IExtensionHostDebugParams;
	isExtensionDevelopment: boolean;
	disableExtensions: boolean | string[];
	enableExtensions?: readonly string[];
	extensionDevelopmentLocationURI?: URI[];
	extensionDevelopmentKind?: ExtensionKind[];
	extensionTestsLocationURI?: URI;

	// --- logging
	logsHome: URI;
	logLevel?: string;
	extensionLogLevel?: [string, string][];
	verbose: boolean;
	isBuilt: boolean;

	// --- telemetry
	disableTelemetry: boolean;
	serviceMachineIdResource: URI;

	// --- Policy
	policyFile?: URI;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE.
	//
	// AS SUCH:
	//   - PUT NON-WEB PROPERTIES INTO NATIVE ENVIRONMENT SERVICE
	//   - PUT WORKBENCH ONLY PROPERTIES INTO WORKBENCH ENVIRONMENT SERVICE
	//   - PUT ELECTRON-MAIN ONLY PROPERTIES INTO MAIN ENVIRONMENT SERVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}

/**
 * A subclass of the `IEnvironmentService` to be used only in native
 * environments (Windows, Linux, macOS) but not e.g. web.
 */
export interface INativeEnvironmentService extends IEnvironmentService {

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE.
	//
	// AS SUCH:
	//   - PUT WORKBENCH ONLY PROPERTIES INTO WORKBENCH ENVIRONMENT SERVICE
	//   - PUT ELECTRON-MAIN ONLY PROPERTIES INTO MAIN ENVIRONMENT SERVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	// --- CLI Arguments
	args: NativeParsedArgs;

	// --- data paths
	/**
	 * Root path of the JavaScript sources.
	 *
	 * Note: This is NOT the installation root
	 * directory itself but contained in it at
	 * a level that is platform dependent.
	 */
	appRoot: string;
	userHome: URI;
	appSettingsHome: URI;
	tmpDir: URI;
	userDataPath: string;
	machineSettingsResource: URI;

	// --- extensions
	extensionsPath: string;
	extensionsDownloadLocation: URI;
	builtinExtensionsPath: string;

	// --- use keytar for credentials
	disableKeytar?: boolean;

	crossOriginIsolated?: boolean;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTERFACE AS SMALL AS POSSIBLE.
	//
	// AS SUCH:
	//   - PUT NON-WEB PROPERTIES INTO NATIVE ENVIRONMENT SERVICE
	//   - PUT WORKBENCH ONLY PROPERTIES INTO WORKBENCH ENVIRONMENT SERVICE
	//   - PUT ELECTRON-MAIN ONLY PROPERTIES INTO MAIN ENVIRONMENT SERVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}
