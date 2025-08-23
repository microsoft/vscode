// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as sinon from 'sinon';
import * as path from 'path';
import { Uri } from 'vscode';
import * as commonUtils from '../../../../client/pythonEnvironments/creation/common/commonUtils';
import * as rawProcessApis from '../../../../client/common/process/rawProcessApis';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../../constants';
import { deleteCondaEnvironment } from '../../../../client/pythonEnvironments/creation/provider/condaDeleteUtils';

suite('Conda Delete test', () => {
    let plainExecStub: sinon.SinonStub;
    let getPrefixCondaEnvPathStub: sinon.SinonStub;
    let hasPrefixCondaEnvStub: sinon.SinonStub;
    let showErrorMessageWithLogsStub: sinon.SinonStub;

    const workspace1 = {
        uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
        name: 'workspace1',
        index: 0,
    };

    setup(() => {
        plainExecStub = sinon.stub(rawProcessApis, 'plainExec');
        getPrefixCondaEnvPathStub = sinon.stub(commonUtils, 'getPrefixCondaEnvPath');
        hasPrefixCondaEnvStub = sinon.stub(commonUtils, 'hasPrefixCondaEnv');
        showErrorMessageWithLogsStub = sinon.stub(commonUtils, 'showErrorMessageWithLogs');
    });

    teardown(() => {
        sinon.restore();
    });

    test('Delete conda env ', async () => {
        getPrefixCondaEnvPathStub.returns('condaEnvPath');
        hasPrefixCondaEnvStub.resolves(false);
        plainExecStub.resolves({ stdout: 'stdout' });
        const result = await deleteCondaEnvironment(workspace1, 'interpreter', 'pathEnvVar');
        assert.isTrue(result);
        assert.isTrue(plainExecStub.calledOnce);
        assert.isTrue(getPrefixCondaEnvPathStub.calledOnce);
        assert.isTrue(hasPrefixCondaEnvStub.calledOnce);
        assert.isTrue(showErrorMessageWithLogsStub.notCalled);
    });

    test('Delete conda env with error', async () => {
        getPrefixCondaEnvPathStub.returns('condaEnvPath');
        hasPrefixCondaEnvStub.resolves(true);
        plainExecStub.resolves({ stdout: 'stdout' });
        const result = await deleteCondaEnvironment(workspace1, 'interpreter', 'pathEnvVar');
        assert.isFalse(result);
        assert.isTrue(plainExecStub.calledOnce);
        assert.isTrue(getPrefixCondaEnvPathStub.calledOnce);
        assert.isTrue(hasPrefixCondaEnvStub.calledOnce);
        assert.isTrue(showErrorMessageWithLogsStub.calledOnce);
    });

    test('Delete conda env with exception', async () => {
        getPrefixCondaEnvPathStub.returns('condaEnvPath');
        hasPrefixCondaEnvStub.resolves(false);
        plainExecStub.rejects(new Error('error'));
        const result = await deleteCondaEnvironment(workspace1, 'interpreter', 'pathEnvVar');
        assert.isFalse(result);
        assert.isTrue(plainExecStub.calledOnce);
        assert.isTrue(getPrefixCondaEnvPathStub.calledOnce);
        assert.isTrue(hasPrefixCondaEnvStub.notCalled);
        assert.isTrue(showErrorMessageWithLogsStub.calledOnce);
    });
});
