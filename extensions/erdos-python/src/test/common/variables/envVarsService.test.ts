// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import { FileSystem } from '../../../client/common/platform/fileSystem';
import { PathUtils } from '../../../client/common/platform/pathUtils';
import { IPathUtils } from '../../../client/common/types';
import { OSType } from '../../../client/common/utils/platform';
import { EnvironmentVariablesService } from '../../../client/common/variables/environment';
import { IEnvironmentVariablesService } from '../../../client/common/variables/types';
import { getOSType } from '../../common';

use(chaiAsPromised.default);

const envFilesFolderPath = path.join(__dirname, '..', '..', '..', '..', 'src', 'testMultiRootWkspc', 'workspace4');

// Functional tests that do not run code using the VS Code API are found
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

        test('Custom variables should be undefined with non-existent files', async () => {
            const vars = await variablesService.parseFile(path.join(envFilesFolderPath, 'abcd'));
            expect(vars).to.equal(undefined, 'Variables should be undefined');
        });

        test('Custom variables should be undefined when folder name is passed instead of a file name', async () => {
            const vars = await variablesService.parseFile(envFilesFolderPath);
            expect(vars).to.equal(undefined, 'Variables should be undefined');
        });

        test('Custom variables should be not undefined with a valid environment file', async () => {
            const vars = await variablesService.parseFile(path.join(envFilesFolderPath, '.env'));
            expect(vars).to.not.equal(undefined, 'Variables should be undefined');
        });

        test('Custom variables should be parsed from env file', async () => {
            const vars = await variablesService.parseFile(path.join(envFilesFolderPath, '.env'));

            expect(vars).to.not.equal(undefined, 'Variables is is undefiend');
            expect(Object.keys(vars!)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('X1234PYEXTUNITTESTVAR', '1234', 'X1234PYEXTUNITTESTVAR value is invalid');
            expect(vars).to.have.property('PYTHONPATH', '../workspace5', 'PYTHONPATH value is invalid');
        });

        test('PATH and PYTHONPATH from env file should be returned as is', async () => {
            const vars = await variablesService.parseFile(path.join(envFilesFolderPath, '.env5'));
            const expectedPythonPath = '/usr/one/three:/usr/one/four';
            const expectedPath = '/usr/x:/usr/y';
            expect(vars).to.not.equal(undefined, 'Variables is is undefiend');
            expect(Object.keys(vars!)).lengthOf(5, 'Incorrect number of variables');
            expect(vars).to.have.property('X', '1', 'X value is invalid');
            expect(vars).to.have.property('Y', '2', 'Y value is invalid');
            expect(vars).to.have.property('PYTHONPATH', expectedPythonPath, 'PYTHONPATH value is invalid');
            expect(vars).to.have.property('PATH', expectedPath, 'PATH value is invalid');
        });

        test('Simple variable substitution is supported', async () => {
            const vars = await variablesService.parseFile(path.join(envFilesFolderPath, '.env6'), {
                BINDIR: '/usr/bin',
            });

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(3, 'Incorrect number of variables');
            expect(vars).to.have.property('REPO', '/home/user/git/foobar', 'value is invalid');
            expect(vars).to.have.property(
                'PYTHONPATH',
                '/home/user/git/foobar/foo:/home/user/git/foobar/bar',
                'value is invalid',
            );
            expect(vars).to.have.property('PYTHON', '/usr/bin/python3', 'value is invalid');
        });
    });
});
