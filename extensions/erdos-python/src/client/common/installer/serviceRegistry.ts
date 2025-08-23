// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { IServiceManager } from '../../ioc/types';
import { ProductType } from '../types';
import { InstallationChannelManager } from './channelManager';
import { CondaInstaller } from './condaInstaller';
import { PipEnvInstaller } from './pipEnvInstaller';
import { PipInstaller } from './pipInstaller';
import { PixiInstaller } from './pixiInstaller';
import { PoetryInstaller } from './poetryInstaller';
import { DataScienceProductPathService, TestFrameworkProductPathService } from './productPath';
import { ProductService } from './productService';
import { IInstallationChannelManager, IModuleInstaller, IProductPathService, IProductService } from './types';

export function registerTypes(serviceManager: IServiceManager) {
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PixiInstaller);
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, CondaInstaller);
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PipInstaller);
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PipEnvInstaller);
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PoetryInstaller);
    serviceManager.addSingleton<IInstallationChannelManager>(IInstallationChannelManager, InstallationChannelManager);
    serviceManager.addSingleton<IProductService>(IProductService, ProductService);
    serviceManager.addSingleton<IProductPathService>(
        IProductPathService,
        TestFrameworkProductPathService,
        ProductType.TestFramework,
    );
    serviceManager.addSingleton<IProductPathService>(
        IProductPathService,
        DataScienceProductPathService,
        ProductType.DataScience,
    );
}
