/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IShellEnvironmentService } from '../../../../platform/environment/common/shellEnvironmentService.js';

export { IShellEnvironmentService } from '../../../../platform/environment/common/shellEnvironmentService.js';

export class ShellEnvironmentService implements IShellEnvironmentService {

	declare readonly _serviceBrand: undefined;

	getShellEnv(): Promise<IProcessEnvironment> {
		return process.shellEnv();
	}
}

registerSingleton(IShellEnvironmentService, ShellEnvironmentService, InstantiationType.Delayed);
