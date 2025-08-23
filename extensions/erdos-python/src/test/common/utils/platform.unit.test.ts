// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { OSType, getOSType } from '../../../client/common/utils/platform';

suite('Utils for platform - getOSType function', () => {
    const testsData = [
        { platform: 'linux', expected: OSType.Linux },
        { platform: 'darwin', expected: OSType.OSX },
        { platform: 'anunknownplatform', expected: OSType.Unknown },
        { platform: 'windows', expected: OSType.Windows },
    ];

    testsData.forEach((testData) => {
        test(`getOSType when platform is ${testData.platform}`, () => {
            const osType = getOSType(testData.platform);
            expect(osType).equal(testData.expected);
        });
    });
});
