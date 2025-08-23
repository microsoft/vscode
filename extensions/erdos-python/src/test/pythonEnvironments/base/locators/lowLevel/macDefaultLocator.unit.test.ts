// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as osUtils from '../../../../../client/common/utils/platform';
import { isMacDefaultPythonPath } from '../../../../../client/pythonEnvironments/common/environmentManagers/macDefault';

suite('isMacDefaultPythonPath', () => {
    let getOSTypeStub: sinon.SinonStub;

    setup(() => {
        getOSTypeStub = sinon.stub(osUtils, 'getOSType');
    });

    teardown(() => {
        sinon.restore();
    });

    const testCases: { path: string; os: osUtils.OSType; expected: boolean }[] = [
        { path: '/usr/bin/python', os: osUtils.OSType.OSX, expected: true },
        { path: '/usr/bin/python', os: osUtils.OSType.Linux, expected: false },
        { path: '/usr/bin/python2', os: osUtils.OSType.OSX, expected: true },
        { path: '/usr/local/bin/python2', os: osUtils.OSType.OSX, expected: false },
        { path: '/usr/bin/python3', os: osUtils.OSType.OSX, expected: false },
        { path: '/usr/bin/python3', os: osUtils.OSType.Linux, expected: false },
    ];

    testCases.forEach(({ path, os, expected }) => {
        const testName = `If the Python path is ${path} on ${os}, it is${
            expected ? '' : ' not'
        } a macOS default Python path`;

        test(testName, () => {
            getOSTypeStub.returns(os);

            const result = isMacDefaultPythonPath(path);

            assert.strictEqual(result, expected);
        });
    });
});
