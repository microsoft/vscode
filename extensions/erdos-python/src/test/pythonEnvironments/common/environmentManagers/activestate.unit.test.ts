// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import { getOSType, OSType } from '../../../../client/common/utils/platform';
import { isActiveStateEnvironment } from '../../../../client/pythonEnvironments/common/environmentManagers/activestate';
import { TEST_LAYOUT_ROOT } from '../commonTestConstants';

suite('isActiveStateEnvironment Tests', () => {
    const testActiveStateDir = path.join(TEST_LAYOUT_ROOT, 'activestate');

    test('Return true if runtime is set up', async () => {
        const result = await isActiveStateEnvironment(
            path.join(
                testActiveStateDir,
                'c09080d1',
                'exec',
                getOSType() === OSType.Windows ? 'python3.exe' : 'python3',
            ),
        );
        expect(result).to.equal(true);
    });

    test(`Return false if the runtime is not set up`, async () => {
        const result = await isActiveStateEnvironment(
            path.join(
                testActiveStateDir,
                'b6a0705d',
                'exec',
                getOSType() === OSType.Windows ? 'python3.exe' : 'python3',
            ),
        );
        expect(result).to.equal(false);
    });
});
