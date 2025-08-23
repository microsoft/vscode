// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { Uri } from 'vscode';
import { Architecture } from '../../../../client/common/utils/platform';
import { parseVersionInfo } from '../../../../client/common/utils/version';
import { PythonEnvInfo, PythonDistroInfo, PythonEnvKind } from '../../../../client/pythonEnvironments/base/info';
import { areEnvsDeepEqual, setEnvDisplayString } from '../../../../client/pythonEnvironments/base/info/env';
import { createLocatedEnv } from '../common';

suite('Environment helpers', () => {
    const name = 'my-env';
    const location = 'x/y/z/spam/';
    const searchLocation = 'x/y/z';
    const arch = Architecture.x64;
    const version = '3.8.1';
    const kind = PythonEnvKind.Venv;
    const distro: PythonDistroInfo = {
        org: 'Distro X',
        defaultDisplayName: 'distroX 1.2',
        version: parseVersionInfo('1.2.3')?.version,
        binDir: 'distroX/bin',
    };
    const locationConda1 = 'x/y/z/conda1';
    const locationConda2 = 'x/y/z/conda2';
    const kindConda = PythonEnvKind.Conda;
    function getEnv(info: {
        version?: string;
        arch?: Architecture;
        name?: string;
        kind?: PythonEnvKind;
        distro?: PythonDistroInfo;
        display?: string;
        location?: string;
        searchLocation?: string;
    }): PythonEnvInfo {
        const env = createLocatedEnv(
            info.location || '',
            info.version || '',
            info.kind || PythonEnvKind.Unknown,
            'python', // exec
            info.distro,
            info.searchLocation ? Uri.file(info.searchLocation) : undefined,
        );
        env.name = info.name || '';
        env.arch = info.arch || Architecture.Unknown;
        env.display = info.display;
        return env;
    }
    function testGenerator() {
        const tests: [PythonEnvInfo, string, string][] = [
            [getEnv({}), 'Python', 'Python'],
            [getEnv({ version, arch, name, kind, distro }), "Python 3.8.1 ('my-env')", "Python 3.8.1 ('my-env': venv)"],
            // without "suffix" info
            [getEnv({ version }), 'Python 3.8.1', 'Python 3.8.1'],
            [getEnv({ arch }), 'Python 64-bit', 'Python 64-bit'],
            [getEnv({ version, arch }), 'Python 3.8.1 64-bit', 'Python 3.8.1 64-bit'],
            // with "suffix" info
            [getEnv({ name }), "Python ('my-env')", "Python ('my-env')"],
            [getEnv({ kind }), 'Python', 'Python (venv)'],
            [getEnv({ name, kind }), "Python ('my-env')", "Python ('my-env': venv)"],
            // env.location is ignored.
            [getEnv({ location }), 'Python', 'Python'],
            [getEnv({ name, location }), "Python ('my-env')", "Python ('my-env')"],
            [
                getEnv({ name, location, searchLocation, version, arch }),
                "Python 3.8.1 64-bit ('my-env')",
                "Python 3.8.1 64-bit ('my-env')",
            ],
            // conda env.name is empty.
            [getEnv({ kind: kindConda }), 'Python', 'Python (conda)'],
            [getEnv({ location: locationConda1, kind: kindConda }), "Python ('conda1')", "Python ('conda1': conda)"],
            [getEnv({ location: locationConda2, kind: kindConda }), "Python ('conda2')", "Python ('conda2': conda)"],
        ];
        return tests;
    }
    testGenerator().forEach(([env, expectedDisplay, expectedDetailedDisplay]) => {
        test(`"${expectedDisplay}"`, () => {
            setEnvDisplayString(env);

            assert.equal(env.display, expectedDisplay);
            assert.equal(env.detailedDisplayName, expectedDetailedDisplay);
        });
    });
    testGenerator().forEach(([env1, _d1, display1], index1) => {
        testGenerator().forEach(([env2, _d2, display2], index2) => {
            if (index1 === index2) {
                test(`"${display1}" === "${display2}"`, () => {
                    assert.strictEqual(areEnvsDeepEqual(env1, env2), true);
                });
            } else {
                test(`"${display1}" !== "${display2}"`, () => {
                    assert.strictEqual(areEnvsDeepEqual(env1, env2), false);
                });
            }
        });
    });
});
