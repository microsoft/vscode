// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import { getOSType, OSType } from '../../../../client/common/utils/platform';
import { PythonEnvKind, PythonEnvSource } from '../../../../client/pythonEnvironments/base/info';
import { BasicEnvInfo, PythonLocatorQuery } from '../../../../client/pythonEnvironments/base/locator';
import { WindowsPathEnvVarLocator } from '../../../../client/pythonEnvironments/base/locators/lowLevel/windowsKnownPathsLocator';
import { ensureFSTree } from '../../../utils/fs';
import { assertBasicEnvsEqual } from '../../base/locators/envTestUtils';
import { createBasicEnv, getEnvs } from '../../base/common';
import * as externalDependencies from '../../../../client/pythonEnvironments/common/externalDependencies';

const IS_WINDOWS = getOSType() === OSType.Windows;

suite('Python envs locator - WindowsPathEnvVarLocator', async () => {
    let cleanUps: (() => void)[];

    const ENV_VAR = 'Path';

    const datadir = path.join(__dirname, '.data');
    const ROOT1 = path.join(datadir, 'root1');
    const ROOT2 = path.join(datadir, 'parent', 'root2');
    const ROOT3 = path.join(datadir, 'root3');
    const ROOT4 = path.join(datadir, 'root4');
    const ROOT5 = path.join(datadir, 'root5');
    const ROOT6 = path.join(datadir, 'root6');
    const DOES_NOT_EXIST = path.join(datadir, '.does-not-exist');
    const dataTree = `
        ./.data/
           root1/
              python2.exe  # matches on Windows (not actually executable though)
              <python.exe>
              <python2.7.exe>
              <python3.exe>
              <python3.8.exe>
              <python3.8>
              <python3.8.1rc1.10213.exe>  # should match but doesn't
              #<python27.exe>
              #<python38.exe>
              <python.3.8.exe>  # should match but doesn't
              python.txt
              <my-python.exe>  # should match but doesn't
              <spam.exe>
              spam.txt
           parent/
              root2/
                 <python2.exe>
                 <python2>
           root3/  # empty
           root4/  # no executables
              subdir/
              spam.txt
              python2
              #python.exe  # matches on Windows (not actually executable though)
           root5/  # executables only in subdir
              subdir/
                 <python2.exe>
                 <python2>
              python2
              #python2.exe  # matches on Windows (not actually executable though)
           root6/  # no matching executables
              <spam.exe>
              spam.txt
              <py>
              <py.exe>
    `.trimEnd();

    suiteSetup(async function () {
        if (!IS_WINDOWS) {
            if (!process.env.PVSC_TEST_FORCE) {
                this.skip();
            }
        }
        await ensureFSTree(dataTree, __dirname);
    });
    setup(async () => {
        if (!IS_WINDOWS) {
            // eslint-disable-next-line global-require
            const platformAPI = require('../../../../../client/common/utils/platform');
            const stub = sinon.stub(platformAPI, 'getOSType');
            stub.returns(OSType.Windows);
        }
        sinon.stub(externalDependencies, 'inExperiment').returns(true);
        cleanUps = [];

        const oldSearchPath = process.env[ENV_VAR];
        cleanUps.push(() => {
            process.env[ENV_VAR] = oldSearchPath;
        });
    });
    teardown(() => {
        cleanUps.forEach((run) => {
            try {
                run();
            } catch (err) {
                console.log(err);
            }
        });
        sinon.restore();
    });

    function getActiveLocator(...roots: string[]): WindowsPathEnvVarLocator {
        process.env[ENV_VAR] = roots.join(path.delimiter);
        const locator = new WindowsPathEnvVarLocator();
        cleanUps.push(() => locator.dispose());
        return locator;
    }

    suite('iterEnvs()', () => {
        test('no executables found', async () => {
            const expected: BasicEnvInfo[] = [];
            const locator = getActiveLocator(ROOT3, ROOT4, DOES_NOT_EXIST, ROOT5);
            const query: PythonLocatorQuery | undefined = undefined;

            const iterator = locator.iterEnvs(query);
            const envs = await getEnvs(iterator);

            assert.deepEqual(envs, expected);
        });

        test('no executables match', async () => {
            const expected: BasicEnvInfo[] = [];
            const locator = getActiveLocator(ROOT6, DOES_NOT_EXIST);
            const query: PythonLocatorQuery | undefined = undefined;

            const iterator = locator.iterEnvs(query);
            const envs = await getEnvs(iterator);

            assert.deepEqual(envs, expected);
        });

        test('some executables match', async () => {
            const expected: BasicEnvInfo[] = [
                createBasicEnv(PythonEnvKind.System, path.join(ROOT1, 'python.exe'), [PythonEnvSource.PathEnvVar]),

                // We will expect the following once we switch
                // to a better filter than isStandardPythonBinary().

                // // On Windows we do not assume 2.7 for "python.exe".
                // getEnv('', '2.7', path.join(ROOT2, 'python2.exe')),
                // // This file isn't executable (but on Windows we can't tell that):
                // getEnv('', '2.7', path.join(ROOT1, 'python2.exe')),
                // getEnv('', '', path.join(ROOT1, 'python.exe')),
                // getEnv('', '2.7', path.join(ROOT1, 'python2.7.exe')),
                // getEnv('', '3.8', path.join(ROOT1, 'python3.8.exe')),
                // getEnv('', '3', path.join(ROOT1, 'python3.exe')),
            ];
            const locator = getActiveLocator(ROOT2, ROOT6, ROOT1);
            const query: PythonLocatorQuery | undefined = undefined;

            const iterator = locator.iterEnvs(query);
            const envs = await getEnvs(iterator);

            assertBasicEnvsEqual(envs, expected);
        });
    });
});
