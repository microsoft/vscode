// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { instance, mock, verify } from 'ts-mockito';
import { EnvironmentVariablesService } from '../../../client/common/variables/environment';
import { EnvironmentVariablesProvider } from '../../../client/common/variables/environmentVariablesProvider';
import { registerTypes } from '../../../client/common/variables/serviceRegistry';
import { IEnvironmentVariablesProvider, IEnvironmentVariablesService } from '../../../client/common/variables/types';
import { ServiceManager } from '../../../client/ioc/serviceManager';
import { IServiceManager } from '../../../client/ioc/types';

suite('Common variables Service Registry', () => {
    let serviceManager: IServiceManager;

    setup(() => {
        serviceManager = mock(ServiceManager);
    });

    test('Ensure services are registered', async () => {
        registerTypes(instance(serviceManager));
        verify(
            serviceManager.addSingleton<IEnvironmentVariablesService>(
                IEnvironmentVariablesService,
                EnvironmentVariablesService,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IEnvironmentVariablesProvider>(
                IEnvironmentVariablesProvider,
                EnvironmentVariablesProvider,
            ),
        ).once();
    });
});
