/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IDebugParams {
	port: number | null;
	break: boolean;
}

export interface IExtensionHostDebugParams extends IDebugParams {
	debugId?: string;
}

export const BACKUPS = 'Backups';

export interface IEnvironmentService {

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: DO NOT ADD ANY OTHER PROPERTY INTO THE COLLECTION HERE
	// UNLESS THIS PROPERTY IS SUPPORTED BOTH IN WEB AND DESKTOP!!!!
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	_serviceBrand: undefined;

	// --- user roaming data
	userRoamingDataHome: URI;
	settingsResource: URI;
	keybindingsResource: URI;
	keyboardLayoutResource: URI;
	argvResource: URI;
	snippetsHome: URI;

	// --- settings sync
	userDataSyncLogResource: URI;
	userDataSyncHome: URI;
	sync: 'on' | 'off';

	// --- extension development
	debugExtensionHost: IExtensionHostDebugParams;
	isExtensionDevelopment: boolean;
	disableExtensions: boolean | string[];
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsLocationURI?: URI;
	extensionEnabledProposedApi?: string[];
	logExtensionHostCommunication?: boolean;

	// --- logging
	logsPath: string;
	logLevel?: string;
	verbose: boolean;
	isBuilt: boolean;

	// --- data paths
	backupHome: URI;
	untitledWorkspacesHome: URI;

	// --- misc
	disableTelemetry: boolean;

	serviceMachineIdResource: URI;

	/**
	 * @deprecated use IRemotePathService#userHome instead (https://github.com/microsoft/vscode/issues/94506)
	 */
	userHome?: URI;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: DO NOT ADD ANY OTHER PROPERTY INTO THE COLLECTION HERE
	// UNLESS THIS PROPERTY IS SUPPORTED BOTH IN WEB AND DESKTOP!!!!
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}
