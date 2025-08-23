// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { Uri } from 'vscode';
import { IWorkspaceService } from '../client/common/application/types';
import { IExperimentService, IInterpreterPathService } from '../client/common/types';
import { IServiceContainer } from '../client/ioc/types';
import { hasUserDefinedPythonPath } from '../client/startupTelemetry';

suite('Startup Telemetry - hasUserDefinedPythonPath()', async () => {
    const resource = Uri.parse('a');
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let experimentsManager: TypeMoq.IMock<IExperimentService>;
    let interpreterPathService: TypeMoq.IMock<IInterpreterPathService>;
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    setup(() => {
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        experimentsManager = TypeMoq.Mock.ofType<IExperimentService>();
        interpreterPathService = TypeMoq.Mock.ofType<IInterpreterPathService>();
        workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
        serviceContainer.setup((s) => s.get(IExperimentService)).returns(() => experimentsManager.object);
        serviceContainer.setup((s) => s.get(IWorkspaceService)).returns(() => workspaceService.object);
        serviceContainer.setup((s) => s.get(IInterpreterPathService)).returns(() => interpreterPathService.object);
    });

    [undefined, 'python'].forEach((globalValue) => {
        [undefined, 'python'].forEach((workspaceValue) => {
            [undefined, 'python'].forEach((workspaceFolderValue) => {
                test(`Return false if using settings equals {globalValue: ${globalValue}, workspaceValue: ${workspaceValue}, workspaceFolderValue: ${workspaceFolderValue}}`, () => {
                    interpreterPathService
                        .setup((i) => i.inspect(resource))
                        .returns(() => ({ globalValue, workspaceValue, workspaceFolderValue } as any));
                    const result = hasUserDefinedPythonPath(resource, serviceContainer.object);
                    expect(result).to.equal(false, 'Should be false');
                });
            });
        });
    });

    test('Return true if using setting value equals something else', () => {
        interpreterPathService
            .setup((i) => i.inspect(resource))
            .returns(() => ({ globalValue: 'something else' } as any));
        const result = hasUserDefinedPythonPath(resource, serviceContainer.object);
        expect(result).to.equal(true, 'Should be true');
    });
});
