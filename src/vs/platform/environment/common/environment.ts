/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {ParsedArgs} from 'vs/platform/environment/node/argv';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IEnvironmentService {
	_serviceBrand: any;

	args: ParsedArgs;

	execPath: string;
	appRoot: string;

	userHome: string;
	userDataPath: string;

	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;

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
}