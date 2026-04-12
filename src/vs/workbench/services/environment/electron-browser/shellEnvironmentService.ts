/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export const IShellEnvironmentService = createDecorator<IShellEnvironmentService>('shellEnvironmentService');

export interface IShellEnvironmentService {

	readonly _serviceBrand: undefined;

	getShellEnv(): Promise<IProcessEnvironment>;
}

export class ShellEnvironmentService implements IShellEnvironmentService {

	declare readonly _serviceBrand: undefined;

	getShellEnv(): Promise<IProcessEnvironment> {
		return process.shellEnv();
	}
}

registerSingleton(IShellEnvironmentService, ShellEnvironmentService, InstantiationType.Delayed);
