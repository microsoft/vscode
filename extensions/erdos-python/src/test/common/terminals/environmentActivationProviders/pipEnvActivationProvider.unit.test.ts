// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { instance, mock, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { Uri } from 'vscode';
import { IWorkspaceService } from '../../../../client/common/application/types';
import { WorkspaceService } from '../../../../client/common/application/workspace';
import { PipEnvActivationCommandProvider } from '../../../../client/common/terminal/environmentActivationProviders/pipEnvActivationProvider';
import { ITerminalActivationCommandProvider, TerminalShellType } from '../../../../client/common/terminal/types';
import { IToolExecutionPath } from '../../../../client/common/types';
import { getNamesAndValues } from '../../../../client/common/utils/enum';
import { IInterpreterService } from '../../../../client/interpreter/contracts';
import { InterpreterService } from '../../../../client/interpreter/interpreterService';
import { EnvironmentType } from '../../../../client/pythonEnvironments/info';

suite('Terminals Activation - Pipenv', () => {
    [undefined, Uri.parse('x')].forEach((resource) => {
        suite(resource ? 'With a resource' : 'Without a resource', () => {
            let pipenvExecFile = 'pipenv';
            let activationProvider: ITerminalActivationCommandProvider;
            let interpreterService: IInterpreterService;
            let pipEnvExecution: TypeMoq.IMock<IToolExecutionPath>;
            let workspaceService: IWorkspaceService;
            setup(() => {
                interpreterService = mock(InterpreterService);
                workspaceService = mock(WorkspaceService);
                interpreterService = mock(InterpreterService);
                pipEnvExecution = TypeMoq.Mock.ofType<IToolExecutionPath>();
                activationProvider = new PipEnvActivationCommandProvider(
                    instance(interpreterService),
                    pipEnvExecution.object,
                    instance(workspaceService),
                );

                pipEnvExecution.setup((p) => p.executable).returns(() => pipenvExecFile);
            });

            test('No commands for no interpreter', async () => {
                when(interpreterService.getActiveInterpreter(resource)).thenResolve();

                for (const shell of getNamesAndValues<TerminalShellType>(TerminalShellType)) {
                    const cmd = await activationProvider.getActivationCommands(resource, shell.value);

                    assert.strictEqual(cmd, undefined);
                }
            });
            test('No commands for an interpreter that is not Pipenv', async () => {
                const nonPipInterpreterTypes = getNamesAndValues<EnvironmentType>(EnvironmentType).filter(
                    (t) => t.value !== EnvironmentType.Pipenv,
                );
                for (const interpreterType of nonPipInterpreterTypes) {
                    when(interpreterService.getActiveInterpreter(resource)).thenResolve({
                        type: interpreterType,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any);

                    for (const shell of getNamesAndValues<TerminalShellType>(TerminalShellType)) {
                        const cmd = await activationProvider.getActivationCommands(resource, shell.value);

                        assert.strictEqual(cmd, undefined);
                    }
                }
            });
            test('pipenv shell is returned for pipenv interpeter', async () => {
                when(interpreterService.getActiveInterpreter(resource)).thenResolve({
                    envType: EnvironmentType.Pipenv,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);

                for (const shell of getNamesAndValues<TerminalShellType>(TerminalShellType)) {
                    const cmd = await activationProvider.getActivationCommands(resource, shell.value);

                    assert.deepEqual(cmd, ['pipenv shell']);
                }
            });
            test('pipenv is properly escaped', async () => {
                pipenvExecFile = 'my pipenv';
                when(interpreterService.getActiveInterpreter(resource)).thenResolve({
                    envType: EnvironmentType.Pipenv,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);

                for (const shell of getNamesAndValues<TerminalShellType>(TerminalShellType)) {
                    const cmd = await activationProvider.getActivationCommands(resource, shell.value);

                    assert.deepEqual(cmd, ['"my pipenv" shell']);
                }
            });
        });
    });
});
