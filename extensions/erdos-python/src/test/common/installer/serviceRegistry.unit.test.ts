// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { instance, mock, verify } from 'ts-mockito';
import { InstallationChannelManager } from '../../../client/common/installer/channelManager';
import { CondaInstaller } from '../../../client/common/installer/condaInstaller';
import { PipEnvInstaller } from '../../../client/common/installer/pipEnvInstaller';
import { PipInstaller } from '../../../client/common/installer/pipInstaller';
import { PoetryInstaller } from '../../../client/common/installer/poetryInstaller';
import { TestFrameworkProductPathService } from '../../../client/common/installer/productPath';
import { ProductService } from '../../../client/common/installer/productService';
import { registerTypes } from '../../../client/common/installer/serviceRegistry';
import {
    IInstallationChannelManager,
    IModuleInstaller,
    IProductPathService,
    IProductService,
} from '../../../client/common/installer/types';
import { ProductType } from '../../../client/common/types';
import { ServiceManager } from '../../../client/ioc/serviceManager';
import { IServiceManager } from '../../../client/ioc/types';

suite('Common installer Service Registry', () => {
    let serviceManager: IServiceManager;

    setup(() => {
        serviceManager = mock(ServiceManager);
    });

    test('Ensure services are registered', async () => {
        registerTypes(instance(serviceManager));
        verify(serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, CondaInstaller)).once();
        verify(serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PipInstaller)).once();
        verify(serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PipEnvInstaller)).once();
        verify(serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PoetryInstaller)).once();
        verify(
            serviceManager.addSingleton<IInstallationChannelManager>(
                IInstallationChannelManager,
                InstallationChannelManager,
            ),
        ).once();
        verify(serviceManager.addSingleton<IProductService>(IProductService, ProductService)).once();
        verify(
            serviceManager.addSingleton<IProductPathService>(
                IProductPathService,
                TestFrameworkProductPathService,
                ProductType.TestFramework,
            ),
        ).once();
    });
});
