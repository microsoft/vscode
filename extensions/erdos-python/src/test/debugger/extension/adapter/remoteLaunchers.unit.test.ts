// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as path from 'path';
import '../../../../client/common/extensions';
import * as launchers from '../../../../client/debugger/extension/adapter/remoteLaunchers';

suite('External debugpy Debugger Launcher', () => {
    [
        {
            testName: 'When path to debugpy does not contains spaces',
            path: path.join('path', 'to', 'debugpy'),
            expectedPath: 'path/to/debugpy',
        },
        {
            testName: 'When path to debugpy contains spaces',
            path: path.join('path', 'to', 'debugpy', 'with spaces'),
            expectedPath: '"path/to/debugpy/with spaces"',
        },
    ].forEach((testParams) => {
        suite(testParams.testName, async () => {
            test('Test remote debug launcher args (and do not wait for debugger to attach)', async () => {
                const args = await launchers.getDebugpyLauncherArgs(
                    {
                        host: 'something',
                        port: 1234,
                        waitUntilDebuggerAttaches: false,
                    },
                    testParams.path,
                );
                const expectedArgs = [testParams.expectedPath, '--listen', 'something:1234'];
                expect(args).to.be.deep.equal(expectedArgs);
            });
            test('Test remote debug launcher args (and wait for debugger to attach)', async () => {
                const args = await launchers.getDebugpyLauncherArgs(
                    {
                        host: 'something',
                        port: 1234,
                        waitUntilDebuggerAttaches: true,
                    },
                    testParams.path,
                );
                const expectedArgs = [testParams.expectedPath, '--listen', 'something:1234', '--wait-for-client'];
                expect(args).to.be.deep.equal(expectedArgs);
            });
        });
    });
});
