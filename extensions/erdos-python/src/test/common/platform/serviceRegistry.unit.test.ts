// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { instance, mock, verify } from 'ts-mockito';
import { FileSystem } from '../../../client/common/platform/fileSystem';
import { PlatformService } from '../../../client/common/platform/platformService';
import { RegistryImplementation } from '../../../client/common/platform/registry';
import { registerTypes } from '../../../client/common/platform/serviceRegistry';
import { IFileSystem, IPlatformService, IRegistry } from '../../../client/common/platform/types';
import { ServiceManager } from '../../../client/ioc/serviceManager';
import { IServiceManager } from '../../../client/ioc/types';

suite('Common Platform Service Registry', () => {
    let serviceManager: IServiceManager;

    setup(() => {
        serviceManager = mock(ServiceManager);
    });

    test('Ensure services are registered', async () => {
        registerTypes(instance(serviceManager));
        verify(serviceManager.addSingleton<IPlatformService>(IPlatformService, PlatformService)).once();
        verify(serviceManager.addSingleton<IFileSystem>(IFileSystem, FileSystem)).once();
        verify(serviceManager.addSingleton<IRegistry>(IRegistry, RegistryImplementation)).once();
    });
});
