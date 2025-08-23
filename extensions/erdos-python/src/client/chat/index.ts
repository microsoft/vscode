// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { lm } from 'vscode';
import { PythonExtension } from '../api/types';
import { IServiceContainer } from '../ioc/types';
import { InstallPackagesTool } from './installPackagesTool';
import { IExtensionContext } from '../common/types';
import { DisposableStore } from '../common/utils/resourceLifecycle';
import { IDiscoveryAPI } from '../pythonEnvironments/base/locator';
import { GetExecutableTool } from './getExecutableTool';
import { GetEnvironmentInfoTool } from './getPythonEnvTool';
import { ConfigurePythonEnvTool } from './configurePythonEnvTool';
import { SelectPythonEnvTool } from './selectEnvTool';
import { CreateVirtualEnvTool } from './createVirtualEnvTool';

export function registerTools(
    context: IExtensionContext,
    discoverApi: IDiscoveryAPI,
    environmentsApi: PythonExtension['environments'],
    serviceContainer: IServiceContainer,
) {
    const ourTools = new DisposableStore();
    context.subscriptions.push(ourTools);

    ourTools.add(
        lm.registerTool(GetEnvironmentInfoTool.toolName, new GetEnvironmentInfoTool(environmentsApi, serviceContainer)),
    );
    ourTools.add(
        lm.registerTool(
            GetExecutableTool.toolName,
            new GetExecutableTool(environmentsApi, serviceContainer, discoverApi),
        ),
    );
    ourTools.add(
        lm.registerTool(
            InstallPackagesTool.toolName,
            new InstallPackagesTool(environmentsApi, serviceContainer, discoverApi),
        ),
    );
    const createVirtualEnvTool = new CreateVirtualEnvTool(discoverApi, environmentsApi, serviceContainer);
    ourTools.add(lm.registerTool(CreateVirtualEnvTool.toolName, createVirtualEnvTool));
    ourTools.add(
        lm.registerTool(SelectPythonEnvTool.toolName, new SelectPythonEnvTool(environmentsApi, serviceContainer)),
    );
    ourTools.add(
        lm.registerTool(
            ConfigurePythonEnvTool.toolName,
            new ConfigurePythonEnvTool(environmentsApi, serviceContainer, createVirtualEnvTool),
        ),
    );
}
