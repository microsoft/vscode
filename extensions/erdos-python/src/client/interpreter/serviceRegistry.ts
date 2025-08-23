// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IExtensionActivationService, IExtensionSingleActivationService } from '../activation/types';
import { IServiceManager } from '../ioc/types';
import { EnvironmentActivationService } from './activation/service';
import { IEnvironmentActivationService } from './activation/types';
import { InterpreterAutoSelectionService } from './autoSelection/index';
import { InterpreterAutoSelectionProxyService } from './autoSelection/proxy';
import { IInterpreterAutoSelectionService, IInterpreterAutoSelectionProxyService } from './autoSelection/types';
import { EnvironmentTypeComparer } from './configuration/environmentTypeComparer';
import { InstallPythonCommand } from './configuration/interpreterSelector/commands/installPython';
import { InstallPythonViaTerminal } from './configuration/interpreterSelector/commands/installPython/installPythonViaTerminal';
import { ResetInterpreterCommand } from './configuration/interpreterSelector/commands/resetInterpreter';
import { SetInterpreterCommand } from './configuration/interpreterSelector/commands/setInterpreter';
import { InterpreterSelector } from './configuration/interpreterSelector/interpreterSelector';
import { RecommendedEnvironmentService } from './configuration/recommededEnvironmentService';
import { PythonPathUpdaterService } from './configuration/pythonPathUpdaterService';
import { PythonPathUpdaterServiceFactory } from './configuration/pythonPathUpdaterServiceFactory';
import {
    IInterpreterComparer,
    IInterpreterQuickPick,
    IInterpreterSelector,
    IRecommendedEnvironmentService,
    IPythonPathUpdaterServiceFactory,
    IPythonPathUpdaterServiceManager,
} from './configuration/types';
import { IActivatedEnvironmentLaunch, IInterpreterDisplay, IInterpreterHelper, IInterpreterService } from './contracts';
import { InterpreterDisplay } from './display';
import { InterpreterLocatorProgressStatusBarHandler } from './display/progressDisplay';
import { InterpreterHelper } from './helpers';
import { InterpreterPathCommand } from './interpreterPathCommand';
import { InterpreterService } from './interpreterService';
import { ActivatedEnvironmentLaunch } from './virtualEnvs/activatedEnvLaunch';
import { CondaInheritEnvPrompt } from './virtualEnvs/condaInheritEnvPrompt';
import { VirtualEnvironmentPrompt } from './virtualEnvs/virtualEnvPrompt';

/**
 * Register all the new types inside this method.
 * This method is created for testing purposes. Registers all interpreter types except `IInterpreterAutoSelectionProxyService`, `IEnvironmentActivationService`.
 * See use case in `src\test\serviceRegistry.ts` for details
 * @param serviceManager
 */

export function registerInterpreterTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        InstallPythonCommand,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        InstallPythonViaTerminal,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        SetInterpreterCommand,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        ResetInterpreterCommand,
    );
    serviceManager.addSingleton<IRecommendedEnvironmentService>(
        IRecommendedEnvironmentService,
        RecommendedEnvironmentService,
    );
    serviceManager.addBinding(IRecommendedEnvironmentService, IExtensionActivationService);
    serviceManager.addSingleton(IInterpreterQuickPick, SetInterpreterCommand);

    serviceManager.addSingleton<IExtensionActivationService>(IExtensionActivationService, VirtualEnvironmentPrompt);

    serviceManager.addSingleton<IInterpreterService>(IInterpreterService, InterpreterService);
    serviceManager.addSingleton<IInterpreterDisplay>(IInterpreterDisplay, InterpreterDisplay);
    serviceManager.addBinding(IInterpreterDisplay, IExtensionSingleActivationService);

    serviceManager.addSingleton<IPythonPathUpdaterServiceFactory>(
        IPythonPathUpdaterServiceFactory,
        PythonPathUpdaterServiceFactory,
    );
    serviceManager.addSingleton<IPythonPathUpdaterServiceManager>(
        IPythonPathUpdaterServiceManager,
        PythonPathUpdaterService,
    );

    serviceManager.addSingleton<IInterpreterSelector>(IInterpreterSelector, InterpreterSelector);
    serviceManager.addSingleton<IInterpreterHelper>(IInterpreterHelper, InterpreterHelper);

    serviceManager.addSingleton<IInterpreterComparer>(IInterpreterComparer, EnvironmentTypeComparer);

    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        InterpreterLocatorProgressStatusBarHandler,
    );

    serviceManager.addSingleton<IInterpreterAutoSelectionService>(
        IInterpreterAutoSelectionService,
        InterpreterAutoSelectionService,
    );

    serviceManager.addSingleton<IExtensionActivationService>(IExtensionActivationService, CondaInheritEnvPrompt);
    serviceManager.addSingleton<IActivatedEnvironmentLaunch>(IActivatedEnvironmentLaunch, ActivatedEnvironmentLaunch);
}

export function registerTypes(serviceManager: IServiceManager): void {
    registerInterpreterTypes(serviceManager);
    serviceManager.addSingleton<IInterpreterAutoSelectionProxyService>(
        IInterpreterAutoSelectionProxyService,
        InterpreterAutoSelectionProxyService,
    );
    serviceManager.addSingleton<IEnvironmentActivationService>(
        EnvironmentActivationService,
        EnvironmentActivationService,
    );
    serviceManager.addSingleton<IEnvironmentActivationService>(
        IEnvironmentActivationService,
        EnvironmentActivationService,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        InterpreterPathCommand,
    );
}
