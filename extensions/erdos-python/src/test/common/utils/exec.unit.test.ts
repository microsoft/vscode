// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { OSType } from '../../common';
import { getSearchPathEnvVarNames } from '../../../client/common/utils/exec';

suite('Utils for exec - getSearchPathEnvVarNames function', () => {
    const testsData = [
        { os: 'Unknown', expected: ['PATH'] },
        { os: 'Windows', expected: ['Path', 'PATH'] },
        { os: 'OSX', expected: ['PATH'] },
        { os: 'Linux', expected: ['PATH'] },
    ];

    testsData.forEach((testData) => {
        test(`getSearchPathEnvVarNames when os is ${testData.os}`, () => {
            const pathVariables = getSearchPathEnvVarNames(testData.os as OSType);

            expect(pathVariables).to.deep.equal(testData.expected);
        });
    });
});
