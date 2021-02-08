/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from 'vs/base/common/platform';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonLocalPtyService, IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';

export const ILocalPtyMainService = createDecorator<ILocalPtyMainService>('localPtyMainService');

export interface ILocalPtyMainService extends ICommonLocalPtyService { }

export class LocalPtyMainService implements ICommonLocalPtyService {
	declare readonly _serviceBrand: undefined;

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean): Promise<void> {
		console.log('PtyMainService#test', cwd, cols, rows);
	}
}
