/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from '../../../base/common/platform.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IShellEnvironmentService = createDecorator<IShellEnvironmentService>('shellEnvironmentService');

export interface IShellEnvironmentService {
	readonly _serviceBrand: undefined;
	getShellEnv(): Promise<IProcessEnvironment>;
}
