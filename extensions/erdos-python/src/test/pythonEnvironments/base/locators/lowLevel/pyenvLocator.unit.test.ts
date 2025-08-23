// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import * as fsWatcher from '../../../../../client/common/platform/fileSystemWatcher';
import * as platformUtils from '../../../../../client/common/utils/platform';
import { PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { PyenvLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/pyenvLocator';
import { createBasicEnv } from '../../common';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';

suite('Pyenv Locator Tests', () => {
    let getEnvVariableStub: sinon.SinonStub;
    let getOsTypeStub: sinon.SinonStub;
    let locator: PyenvLocator;
    let watchLocationForPatternStub: sinon.SinonStub;

    const testPyenvRoot = path.join(TEST_LAYOUT_ROOT, 'pyenvhome', '.pyenv');
    const testPyenvVersionsDir = path.join(testPyenvRoot, 'versions');

    setup(async () => {
        getEnvVariableStub = sinon.stub(platformUtils, 'getEnvironmentVariable');
        getEnvVariableStub.withArgs('PYENV_ROOT').returns(testPyenvRoot);

        getOsTypeStub = sinon.stub(platformUtils, 'getOSType');
        getOsTypeStub.returns(platformUtils.OSType.Linux);

        watchLocationForPatternStub = sinon.stub(fsWatcher, 'watchLocationForPattern');
        watchLocationForPatternStub.returns({
            dispose: () => {
                /* do nothing */
            },
        });

        locator = new PyenvLocator();
    });

    teardown(() => {
        sinon.restore();
    });

    test('iterEnvs()', async () => {
        const expectedEnvs = [
            createBasicEnv(PythonEnvKind.Pyenv, path.join(testPyenvVersionsDir, '3.9.0', 'bin', 'python')),
            createBasicEnv(PythonEnvKind.Pyenv, path.join(testPyenvVersionsDir, 'conda1', 'bin', 'python')),

            createBasicEnv(PythonEnvKind.Pyenv, path.join(testPyenvVersionsDir, 'miniconda3-4.7.12', 'bin', 'python')),
            createBasicEnv(PythonEnvKind.Pyenv, path.join(testPyenvVersionsDir, 'venv1', 'bin', 'python')),
        ];

        const actualEnvs = await getEnvs(locator.iterEnvs());
        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });
});
