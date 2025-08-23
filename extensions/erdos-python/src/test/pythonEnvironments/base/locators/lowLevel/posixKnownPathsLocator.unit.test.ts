// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as semver from 'semver';
import * as executablesAPI from '../../../../../client/common/utils/exec';
import * as osUtils from '../../../../../client/common/utils/platform';
import { PythonEnvKind, PythonEnvSource } from '../../../../../client/pythonEnvironments/base/info';
import { BasicEnvInfo } from '../../../../../client/pythonEnvironments/base/locator';
import { getEnvs } from '../../../../../client/pythonEnvironments/base/locatorUtils';
import { PosixKnownPathsLocator } from '../../../../../client/pythonEnvironments/base/locators/lowLevel/posixKnownPathsLocator';
import { createBasicEnv } from '../../common';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertBasicEnvsEqual } from '../envTestUtils';
import { isMacDefaultPythonPath } from '../../../../../client/pythonEnvironments/common/environmentManagers/macDefault';

suite('Posix Known Path Locator', () => {
    let getPathEnvVar: sinon.SinonStub;
    let locator: PosixKnownPathsLocator;

    const testPosixKnownPathsRoot = path.join(TEST_LAYOUT_ROOT, 'posixroot');

    const testLocation1 = path.join(testPosixKnownPathsRoot, 'location1');
    const testLocation2 = path.join(testPosixKnownPathsRoot, 'location2');
    const testLocation3 = path.join(testPosixKnownPathsRoot, 'location3');

    const testFileData: Map<string, string[]> = new Map();

    testFileData.set(testLocation1, ['python', 'python3']);
    testFileData.set(testLocation2, ['python', 'python37', 'python38']);
    testFileData.set(testLocation3, ['python3.7', 'python3.8']);

    setup(async () => {
        getPathEnvVar = sinon.stub(executablesAPI, 'getSearchPathEntries');
        locator = new PosixKnownPathsLocator();
    });
    teardown(() => {
        sinon.restore();
    });

    test('iterEnvs(): get python bin from known test roots', async () => {
        const testLocations = [testLocation1, testLocation2, testLocation3];
        getPathEnvVar.returns(testLocations);

        const expectedEnvs: BasicEnvInfo[] = [];
        testLocations.forEach((location) => {
            const binaries = testFileData.get(location);
            if (binaries) {
                binaries.forEach((binary) => {
                    expectedEnvs.push({
                        source: [PythonEnvSource.PathEnvVar],
                        ...createBasicEnv(PythonEnvKind.OtherGlobal, path.join(location, binary)),
                    });
                });
            }
        });

        const actualEnvs = (await getEnvs(locator.iterEnvs())).filter((e) => e.executablePath.indexOf('posixroot') > 0);
        assertBasicEnvsEqual(actualEnvs, expectedEnvs);
    });

    test('iterEnvs(): Do not return Python 2 installs when on macOS Monterey', async function () {
        if (osUtils.getOSType() !== osUtils.OSType.OSX) {
            this.skip();
        }

        const getOSTypeStub = sinon.stub(osUtils, 'getOSType');
        const gteStub = sinon.stub(semver, 'gte');

        getOSTypeStub.returns(osUtils.OSType.OSX);
        gteStub.returns(true);

        const actualEnvs = await getEnvs(locator.iterEnvs());

        const globalPython2Envs = actualEnvs.filter((env) => isMacDefaultPythonPath(env.executablePath));

        assert.strictEqual(globalPython2Envs.length, 0);
    });

    test('iterEnvs(): Return Python 2 installs when not on macOS Monterey', async function () {
        if (osUtils.getOSType() !== osUtils.OSType.OSX) {
            this.skip();
        }

        const getOSTypeStub = sinon.stub(osUtils, 'getOSType');
        const gteStub = sinon.stub(semver, 'gte');

        getOSTypeStub.returns(osUtils.OSType.OSX);
        gteStub.returns(false);

        const actualEnvs = await getEnvs(locator.iterEnvs());

        const globalPython2Envs = actualEnvs.filter((env) => isMacDefaultPythonPath(env.executablePath));

        assert.notStrictEqual(globalPython2Envs.length, 0);
    });
});
