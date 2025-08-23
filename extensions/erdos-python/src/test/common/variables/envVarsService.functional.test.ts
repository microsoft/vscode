// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { FileSystem } from '../../../client/common/platform/fileSystem';
import { PathUtils } from '../../../client/common/platform/pathUtils';
import { IPathUtils } from '../../../client/common/types';
import { OSType } from '../../../client/common/utils/platform';
import { EnvironmentVariablesService } from '../../../client/common/variables/environment';
import { IEnvironmentVariablesService } from '../../../client/common/variables/types';
import { getOSType } from '../../common';

use(chaiAsPromised.default);

// Functional tests that run code using the VS Code API are found
// in envVarsService.test.ts.

suite('Environment Variables Service', () => {
    let pathUtils: IPathUtils;
    let variablesService: IEnvironmentVariablesService;
    setup(() => {
        pathUtils = new PathUtils(getOSType() === OSType.Windows);
        const fs = new FileSystem();
        variablesService = new EnvironmentVariablesService(pathUtils, fs);
    });

    suite('parseFile()', () => {
        test('Custom variables should be undefined with no argument', async () => {
            const vars = await variablesService.parseFile(undefined);
            expect(vars).to.equal(undefined, 'Variables should be undefined');
        });
    });
});
