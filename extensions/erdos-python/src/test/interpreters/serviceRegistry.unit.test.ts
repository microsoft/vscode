// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { instance, mock, verify } from 'ts-mockito';
import { IExtensionActivationService, IExtensionSingleActivationService } from '../../client/activation/types';
import { EnvironmentActivationService } from '../../client/interpreter/activation/service';
import { IEnvironmentActivationService } from '../../client/interpreter/activation/types';
import { InterpreterAutoSelectionService } from '../../client/interpreter/autoSelection';
import { InterpreterAutoSelectionProxyService } from '../../client/interpreter/autoSelection/proxy';
import {
    IInterpreterAutoSelectionService,
    IInterpreterAutoSelectionProxyService,
} from '../../client/interpreter/autoSelection/types';
import { EnvironmentTypeComparer } from '../../client/interpreter/configuration/environmentTypeComparer';
import { InstallPythonCommand } from '../../client/interpreter/configuration/interpreterSelector/commands/installPython';
import { InstallPythonViaTerminal } from '../../client/interpreter/configuration/interpreterSelector/commands/installPython/installPythonViaTerminal';
import { ResetInterpreterCommand } from '../../client/interpreter/configuration/interpreterSelector/commands/resetInterpreter';
import { SetInterpreterCommand } from '../../client/interpreter/configuration/interpreterSelector/commands/setInterpreter';
import { InterpreterSelector } from '../../client/interpreter/configuration/interpreterSelector/interpreterSelector';
import { PythonPathUpdaterService } from '../../client/interpreter/configuration/pythonPathUpdaterService';
import { PythonPathUpdaterServiceFactory } from '../../client/interpreter/configuration/pythonPathUpdaterServiceFactory';
import {
    IInterpreterComparer,
    IInterpreterQuickPick,
    IInterpreterSelector,
    IPythonPathUpdaterServiceFactory,
    IPythonPathUpdaterServiceManager,
    IRecommendedEnvironmentService,
} from '../../client/interpreter/configuration/types';
import {
    IActivatedEnvironmentLaunch,
    IInterpreterDisplay,
    IInterpreterHelper,
    IInterpreterService,
} from '../../client/interpreter/contracts';
import { InterpreterDisplay } from '../../client/interpreter/display';
import { InterpreterLocatorProgressStatusBarHandler } from '../../client/interpreter/display/progressDisplay';
import { InterpreterHelper } from '../../client/interpreter/helpers';
import { InterpreterService } from '../../client/interpreter/interpreterService';
import { registerTypes } from '../../client/interpreter/serviceRegistry';
import { ActivatedEnvironmentLaunch } from '../../client/interpreter/virtualEnvs/activatedEnvLaunch';
import { CondaInheritEnvPrompt } from '../../client/interpreter/virtualEnvs/condaInheritEnvPrompt';
import { VirtualEnvironmentPrompt } from '../../client/interpreter/virtualEnvs/virtualEnvPrompt';
import { ServiceManager } from '../../client/ioc/serviceManager';
import { InterpreterPathCommand } from '../../client/interpreter/interpreterPathCommand';
import { RecommendedEnvironmentService } from '../../client/interpreter/configuration/recommededEnvironmentService';

suite('Interpreters - Service Registry', () => {
    test('Registrations', () => {
        const serviceManager = mock(ServiceManager);
        registerTypes(instance(serviceManager));

        [
            [IExtensionSingleActivationService, InstallPythonCommand],
            [IExtensionSingleActivationService, InstallPythonViaTerminal],
            [IExtensionSingleActivationService, SetInterpreterCommand],
            [IInterpreterQuickPick, SetInterpreterCommand],
            [IExtensionSingleActivationService, ResetInterpreterCommand],

            [IExtensionActivationService, VirtualEnvironmentPrompt],

            [IInterpreterService, InterpreterService],
            [IInterpreterDisplay, InterpreterDisplay],

            [IPythonPathUpdaterServiceFactory, PythonPathUpdaterServiceFactory],
            [IPythonPathUpdaterServiceManager, PythonPathUpdaterService],
            [IRecommendedEnvironmentService, RecommendedEnvironmentService],
            [IInterpreterSelector, InterpreterSelector],
            [IInterpreterHelper, InterpreterHelper],
            [IInterpreterComparer, EnvironmentTypeComparer],

            [IExtensionSingleActivationService, InterpreterLocatorProgressStatusBarHandler],

            [IInterpreterAutoSelectionProxyService, InterpreterAutoSelectionProxyService],
            [IInterpreterAutoSelectionService, InterpreterAutoSelectionService],

            [EnvironmentActivationService, EnvironmentActivationService],
            [IEnvironmentActivationService, EnvironmentActivationService],
            [IExtensionSingleActivationService, InterpreterPathCommand],
            [IExtensionActivationService, CondaInheritEnvPrompt],
            [IActivatedEnvironmentLaunch, ActivatedEnvironmentLaunch],
        ].forEach((mapping) => {
            // eslint-disable-next-line prefer-spread
            verify(serviceManager.addSingleton.apply(serviceManager, mapping as never)).once();
        });
    });
});
