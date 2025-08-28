/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServiceManager } from '../ioc/types';
import { IPythonRuntimeManager, PythonRuntimeManager } from './manager';

export function registerErdosTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingleton<IPythonRuntimeManager>(IPythonRuntimeManager, PythonRuntimeManager);
}
