// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { instance, mock, verify } from 'ts-mockito';
import { ServiceManager } from '../../../client/ioc/serviceManager';
import { IServiceManager } from '../../../client/ioc/types';
import { TerminalAutoActivation } from '../../../client/terminals/activation';
import { CodeExecutionManager } from '../../../client/terminals/codeExecution/codeExecutionManager';
import { DjangoShellCodeExecutionProvider } from '../../../client/terminals/codeExecution/djangoShellCodeExecution';
import { CodeExecutionHelper } from '../../../client/terminals/codeExecution/helper';
import { ReplProvider } from '../../../client/terminals/codeExecution/repl';
import { TerminalCodeExecutionProvider } from '../../../client/terminals/codeExecution/terminalCodeExecution';
import { registerTypes } from '../../../client/terminals/serviceRegistry';
import {
    ICodeExecutionHelper,
    ICodeExecutionManager,
    ICodeExecutionService,
    ITerminalAutoActivation,
} from '../../../client/terminals/types';

suite('Common Terminal Service Registry', () => {
    let serviceManager: IServiceManager;

    setup(() => {
        serviceManager = mock(ServiceManager);
    });

    test('Ensure services are registered', async () => {
        registerTypes(instance(serviceManager));
        verify(serviceManager.addSingleton<ICodeExecutionHelper>(ICodeExecutionHelper, CodeExecutionHelper)).once();

        verify(serviceManager.addSingleton<ICodeExecutionManager>(ICodeExecutionManager, CodeExecutionManager)).once();

        verify(
            serviceManager.addSingleton<ICodeExecutionService>(
                ICodeExecutionService,
                DjangoShellCodeExecutionProvider,
                'djangoShell',
            ),
        ).once();
        verify(
            serviceManager.addSingleton<ICodeExecutionService>(
                ICodeExecutionService,
                TerminalCodeExecutionProvider,
                'standard',
            ),
        ).once();
        verify(serviceManager.addSingleton<ICodeExecutionService>(ICodeExecutionService, ReplProvider, 'repl')).once();

        verify(
            serviceManager.addSingleton<ITerminalAutoActivation>(ITerminalAutoActivation, TerminalAutoActivation),
        ).once();
    });
});
