// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as fs from '../../../../client/common/platform/fs-paths';
import { hasVenv } from '../../../../client/pythonEnvironments/creation/common/commonUtils';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../../constants';

suite('CommonUtils', () => {
    let fileExistsStub: sinon.SinonStub;
    const workspace1 = {
        uri: Uri.file(path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'src', 'testMultiRootWkspc', 'workspace1')),
        name: 'workspace1',
        index: 0,
    };

    setup(() => {
        fileExistsStub = sinon.stub(fs, 'pathExists');
    });

    teardown(() => {
        sinon.restore();
    });

    test('Venv exists test', async () => {
        fileExistsStub.resolves(true);
        const result = await hasVenv(workspace1);
        expect(result).to.be.equal(true, 'Incorrect result');

        fileExistsStub.calledOnceWith(path.join(workspace1.uri.fsPath, '.venv', 'pyvenv.cfg'));
    });

    test('Venv does not exist test', async () => {
        fileExistsStub.resolves(false);
        const result = await hasVenv(workspace1);
        expect(result).to.be.equal(false, 'Incorrect result');

        fileExistsStub.calledOnceWith(path.join(workspace1.uri.fsPath, '.venv', 'pyvenv.cfg'));
    });
});
