// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { expect } from 'chai';
import { instance, mock, verify, when } from 'ts-mockito';
import { Disposable, Uri } from 'vscode';

import { ProcessLogger } from '../../../client/common/process/logger';
import { ProcessService } from '../../../client/common/process/proc';
import { ProcessServiceFactory } from '../../../client/common/process/processFactory';
import { IProcessLogger } from '../../../client/common/process/types';
import { IDisposableRegistry } from '../../../client/common/types';
import { EnvironmentVariablesProvider } from '../../../client/common/variables/environmentVariablesProvider';
import { IEnvironmentVariablesProvider } from '../../../client/common/variables/types';

suite('Process - ProcessServiceFactory', () => {
    let factory: ProcessServiceFactory;
    let envVariablesProvider: IEnvironmentVariablesProvider;
    let processLogger: IProcessLogger;
    let processService: ProcessService;
    let disposableRegistry: IDisposableRegistry;

    setup(() => {
        envVariablesProvider = mock(EnvironmentVariablesProvider);
        processLogger = mock(ProcessLogger);
        when(processLogger.logProcess('', [], {})).thenReturn();
        processService = mock(ProcessService);
        when(
            processService.on('exec', () => {
                return;
            }),
        ).thenReturn(processService);
        disposableRegistry = [];
        factory = new ProcessServiceFactory(
            instance(envVariablesProvider),
            instance(processLogger),
            disposableRegistry,
        );
    });

    teardown(() => {
        (disposableRegistry as Disposable[]).forEach((d) => d.dispose());
    });

    [Uri.parse('test'), undefined].forEach((resource) => {
        test(`Ensure ProcessService is created with an ${resource ? 'existing' : 'undefined'} resource`, async () => {
            when(envVariablesProvider.getEnvironmentVariables(resource)).thenResolve({ x: 'test' });

            const proc = await factory.create(resource);
            verify(envVariablesProvider.getEnvironmentVariables(resource)).once();

            const disposables = disposableRegistry as Disposable[];
            expect(disposables.length).equal(1);
            expect(proc).instanceOf(ProcessService);
        });
    });
});
