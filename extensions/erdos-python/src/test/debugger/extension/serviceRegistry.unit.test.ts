// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { instance, mock, verify } from 'ts-mockito';
import { IExtensionSingleActivationService } from '../../../client/activation/types';
import { DebugAdapterActivator } from '../../../client/debugger/extension/adapter/activator';
import { DebugAdapterDescriptorFactory } from '../../../client/debugger/extension/adapter/factory';
import { DebugSessionLoggingFactory } from '../../../client/debugger/extension/adapter/logging';
import { OutdatedDebuggerPromptFactory } from '../../../client/debugger/extension/adapter/outdatedDebuggerPrompt';
import { AttachProcessProviderFactory } from '../../../client/debugger/extension/attachQuickPick/factory';
import { IAttachProcessProviderFactory } from '../../../client/debugger/extension/attachQuickPick/types';
import { AttachConfigurationResolver } from '../../../client/debugger/extension/configuration/resolvers/attach';
import { LaunchConfigurationResolver } from '../../../client/debugger/extension/configuration/resolvers/launch';
import { IDebugConfigurationResolver } from '../../../client/debugger/extension/configuration/types';
import { DebugCommands } from '../../../client/debugger/extension/debugCommands';
import { ChildProcessAttachEventHandler } from '../../../client/debugger/extension/hooks/childProcessAttachHandler';
import { ChildProcessAttachService } from '../../../client/debugger/extension/hooks/childProcessAttachService';
import { IChildProcessAttachService, IDebugSessionEventHandlers } from '../../../client/debugger/extension/hooks/types';
import { registerTypes } from '../../../client/debugger/extension/serviceRegistry';
import {
    IDebugAdapterDescriptorFactory,
    IDebugSessionLoggingFactory,
    IOutdatedDebuggerPromptFactory,
} from '../../../client/debugger/extension/types';
import { AttachRequestArguments, LaunchRequestArguments } from '../../../client/debugger/types';
import { ServiceManager } from '../../../client/ioc/serviceManager';
import { IServiceManager } from '../../../client/ioc/types';

suite('Debugging - Service Registry', () => {
    let serviceManager: IServiceManager;
    setup(() => {
        serviceManager = mock(ServiceManager);
    });
    test('Registrations', () => {
        registerTypes(instance(serviceManager));

        verify(
            serviceManager.addSingleton<IChildProcessAttachService>(
                IChildProcessAttachService,
                ChildProcessAttachService,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IExtensionSingleActivationService>(
                IExtensionSingleActivationService,
                DebugAdapterActivator,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IDebugAdapterDescriptorFactory>(
                IDebugAdapterDescriptorFactory,
                DebugAdapterDescriptorFactory,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IDebugSessionEventHandlers>(
                IDebugSessionEventHandlers,
                ChildProcessAttachEventHandler,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IDebugConfigurationResolver<LaunchRequestArguments>>(
                IDebugConfigurationResolver,
                LaunchConfigurationResolver,
                'launch',
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IDebugConfigurationResolver<AttachRequestArguments>>(
                IDebugConfigurationResolver,
                AttachConfigurationResolver,
                'attach',
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IExtensionSingleActivationService>(
                IExtensionSingleActivationService,
                DebugAdapterActivator,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IDebugAdapterDescriptorFactory>(
                IDebugAdapterDescriptorFactory,
                DebugAdapterDescriptorFactory,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IDebugSessionLoggingFactory>(
                IDebugSessionLoggingFactory,
                DebugSessionLoggingFactory,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IOutdatedDebuggerPromptFactory>(
                IOutdatedDebuggerPromptFactory,
                OutdatedDebuggerPromptFactory,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IAttachProcessProviderFactory>(
                IAttachProcessProviderFactory,
                AttachProcessProviderFactory,
            ),
        ).once();
        verify(
            serviceManager.addSingleton<IExtensionSingleActivationService>(
                IExtensionSingleActivationService,
                DebugCommands,
            ),
        ).once();
    });
});
