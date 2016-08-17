/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IEnvironmentService {
	_serviceBrand: any;

	appRoot: string;

	userHome: string;
	userDataPath: string;

	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;

	extensionsPath: string;
	extensionDevelopmentPath: string;

	isBuilt: boolean;
	verbose: boolean;

	debugBrkFileWatcherPort: number;

	createPaths(): TPromise<void>;
}