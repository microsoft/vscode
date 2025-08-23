// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { IServiceManager } from '../../ioc/types';
import { FileSystem } from './fileSystem';
import { PlatformService } from './platformService';
import { RegistryImplementation } from './registry';
import { IFileSystem, IPlatformService, IRegistry } from './types';

export function registerTypes(serviceManager: IServiceManager) {
    serviceManager.addSingleton<IPlatformService>(IPlatformService, PlatformService);
    serviceManager.addSingleton<IFileSystem>(IFileSystem, FileSystem);
    serviceManager.addSingleton<IRegistry>(IRegistry, RegistryImplementation);
}
