/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IServiceManager } from '../ioc/types';
import { IPythonRuntimeManager, PythonRuntimeManager } from './manager';

export function registerErdosTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingleton<IPythonRuntimeManager>(IPythonRuntimeManager, PythonRuntimeManager);
}
