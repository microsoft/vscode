// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert, expect } from 'chai';
import * as sinon from 'sinon';
import { anything, instance, mock, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { Uri } from 'vscode';
import { IDisposable } from '../../client/common/types';
import * as commandApis from '../../client/common/vscodeApis/commandApis';
import { InterpreterPathCommand } from '../../client/interpreter/interpreterPathCommand';
import { IInterpreterService } from '../../client/interpreter/contracts';
import { PythonEnvironment } from '../../client/pythonEnvironments/info';
import * as workspaceApis from '../../client/common/vscodeApis/workspaceApis';

suite('Interpreter Path Command', () => {
    let interpreterService: IInterpreterService;
    let interpreterPathCommand: InterpreterPathCommand;
    let registerCommandStub: sinon.SinonStub;
    let getConfigurationStub: sinon.SinonStub;

    setup(() => {
        interpreterService = mock<IInterpreterService>();
        registerCommandStub = sinon.stub(commandApis, 'registerCommand');
        interpreterPathCommand = new InterpreterPathCommand(instance(interpreterService), []);
        getConfigurationStub = sinon.stub(workspaceApis, 'getConfiguration');
    });

    teardown(() => {
        sinon.restore();
    });

    test('Ensure command is registered with the correct callback handler', async () => {
        let getInterpreterPathHandler = (_param: unknown) => undefined;
        registerCommandStub.callsFake((_, cb) => {
            getInterpreterPathHandler = cb;
            return TypeMoq.Mock.ofType<IDisposable>().object;
        });
        await interpreterPathCommand.activate();

        sinon.assert.calledOnce(registerCommandStub);
        const getSelectedInterpreterPath = sinon.stub(InterpreterPathCommand.prototype, '_getSelectedInterpreterPath');
        getInterpreterPathHandler([]);
        assert(getSelectedInterpreterPath.calledOnceWith([]));
    });

    test('If `workspaceFolder` property exists in `args`, it is used to retrieve setting from config', async () => {
        const args = { workspaceFolder: 'folderPath', type: 'debugpy' };
        when(interpreterService.getActiveInterpreter(anything())).thenCall((arg) => {
            assert.deepEqual(arg, Uri.file('folderPath'));

            return Promise.resolve({ path: 'settingValue' }) as unknown;
        });
        const setting = await interpreterPathCommand._getSelectedInterpreterPath(args);
        expect(setting).to.equal('settingValue');
    });

    test('If `args[1]` is defined, it is used to retrieve setting from config', async () => {
        const args = ['command', 'folderPath'];
        when(interpreterService.getActiveInterpreter(anything())).thenCall((arg) => {
            assert.deepEqual(arg, Uri.file('folderPath'));

            return Promise.resolve({ path: 'settingValue' }) as unknown;
        });
        const setting = await interpreterPathCommand._getSelectedInterpreterPath(args);
        expect(setting).to.equal('settingValue');
    });

    test('If interpreter path contains spaces, double quote it before returning', async () => {
        const args = ['command', 'folderPath'];
        when(interpreterService.getActiveInterpreter(anything())).thenCall((arg) => {
            assert.deepEqual(arg, Uri.file('folderPath'));

            return Promise.resolve({ path: 'setting Value' }) as unknown;
        });
        const setting = await interpreterPathCommand._getSelectedInterpreterPath(args);
        expect(setting).to.equal('"setting Value"');
    });

    test('If neither of these exists, value of workspace folder is `undefined`', async () => {
        getConfigurationStub.withArgs('python').returns({
            get: sinon.stub().returns(false),
        });

        const args = ['command'];

        when(interpreterService.getActiveInterpreter(undefined)).thenReturn(
            Promise.resolve({ path: 'settingValue' }) as Promise<PythonEnvironment | undefined>,
        );
        const setting = await interpreterPathCommand._getSelectedInterpreterPath(args);
        expect(setting).to.equal('settingValue');
    });
});
