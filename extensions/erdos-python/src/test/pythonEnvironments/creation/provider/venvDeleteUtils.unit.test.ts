// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as sinon from 'sinon';
import { Uri, WorkspaceFolder } from 'vscode';
import { assert } from 'chai';
import * as path from 'path';
import * as fs from '../../../../client/common/platform/fs-paths';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../../constants';
import * as commonUtils from '../../../../client/pythonEnvironments/creation/common/commonUtils';
import {
    deleteEnvironmentNonWindows,
    deleteEnvironmentWindows,
} from '../../../../client/pythonEnvironments/creation/provider/venvDeleteUtils';
import * as switchPython from '../../../../client/pythonEnvironments/creation/provider/venvSwitchPython';
import * as asyncApi from '../../../../client/common/utils/async';

suite('Test Delete environments (windows)', () => {
    let pathExistsStub: sinon.SinonStub;
    let rmdirStub: sinon.SinonStub;
    let unlinkStub: sinon.SinonStub;
    let showErrorMessageWithLogsStub: sinon.SinonStub;
    let switchPythonStub: sinon.SinonStub;
    let sleepStub: sinon.SinonStub;

    const workspace1: WorkspaceFolder = {
        uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
        name: 'workspace1',
        index: 0,
    };

    setup(() => {
        pathExistsStub = sinon.stub(fs, 'pathExists');
        pathExistsStub.resolves(true);

        rmdirStub = sinon.stub(fs, 'rmdir');
        unlinkStub = sinon.stub(fs, 'unlink');

        sleepStub = sinon.stub(asyncApi, 'sleep');
        sleepStub.resolves();

        showErrorMessageWithLogsStub = sinon.stub(commonUtils, 'showErrorMessageWithLogs');
        showErrorMessageWithLogsStub.resolves();

        switchPythonStub = sinon.stub(switchPython, 'switchSelectedPython');
        switchPythonStub.resolves();
    });

    teardown(() => {
        sinon.restore();
    });

    test('Delete venv folder succeeded', async () => {
        rmdirStub.resolves();
        unlinkStub.resolves();
        assert.ok(await deleteEnvironmentWindows(workspace1, 'python.exe'));

        assert.ok(rmdirStub.calledOnce);
        assert.ok(unlinkStub.calledOnce);
        assert.ok(showErrorMessageWithLogsStub.notCalled);
    });

    test('Delete python.exe succeeded but venv dir failed', async () => {
        rmdirStub.rejects();
        unlinkStub.resolves();
        assert.notOk(await deleteEnvironmentWindows(workspace1, 'python.exe'));

        assert.ok(rmdirStub.calledOnce);
        assert.ok(unlinkStub.calledOnce);
        assert.ok(showErrorMessageWithLogsStub.calledOnce);
    });

    test('Delete python.exe failed first attempt', async () => {
        unlinkStub.rejects();
        rmdirStub.resolves();
        assert.ok(await deleteEnvironmentWindows(workspace1, 'python.exe'));

        assert.ok(rmdirStub.calledOnce);
        assert.ok(switchPythonStub.calledOnce);
        assert.ok(showErrorMessageWithLogsStub.notCalled);
    });

    test('Delete python.exe failed all attempts', async () => {
        unlinkStub.rejects();
        rmdirStub.rejects();
        assert.notOk(await deleteEnvironmentWindows(workspace1, 'python.exe'));
        assert.ok(switchPythonStub.calledOnce);
        assert.ok(showErrorMessageWithLogsStub.calledOnce);
    });

    test('Delete python.exe failed no interpreter', async () => {
        unlinkStub.rejects();
        rmdirStub.rejects();
        assert.notOk(await deleteEnvironmentWindows(workspace1, undefined));
        assert.ok(switchPythonStub.notCalled);
        assert.ok(showErrorMessageWithLogsStub.calledOnce);
    });
});

suite('Test Delete environments (linux/mac)', () => {
    let pathExistsStub: sinon.SinonStub;
    let rmdirStub: sinon.SinonStub;
    let showErrorMessageWithLogsStub: sinon.SinonStub;

    const workspace1: WorkspaceFolder = {
        uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
        name: 'workspace1',
        index: 0,
    };

    setup(() => {
        pathExistsStub = sinon.stub(fs, 'pathExists');
        rmdirStub = sinon.stub(fs, 'rmdir');

        showErrorMessageWithLogsStub = sinon.stub(commonUtils, 'showErrorMessageWithLogs');
        showErrorMessageWithLogsStub.resolves();
    });

    teardown(() => {
        sinon.restore();
    });

    test('Delete venv folder succeeded', async () => {
        pathExistsStub.resolves(true);
        rmdirStub.resolves();

        assert.ok(await deleteEnvironmentNonWindows(workspace1));

        assert.ok(pathExistsStub.calledOnce);
        assert.ok(rmdirStub.calledOnce);
        assert.ok(showErrorMessageWithLogsStub.notCalled);
    });

    test('Delete venv folder failed', async () => {
        pathExistsStub.resolves(true);
        rmdirStub.rejects();
        assert.notOk(await deleteEnvironmentNonWindows(workspace1));

        assert.ok(pathExistsStub.calledOnce);
        assert.ok(rmdirStub.calledOnce);
        assert.ok(showErrorMessageWithLogsStub.calledOnce);
    });
});
