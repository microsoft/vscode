// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as platformUtils from '../../../../client/common/utils/platform';
import * as fileUtils from '../../../../client/pythonEnvironments/common/externalDependencies';
import {
    IPyenvVersionStrings,
    isPyenvEnvironment,
    isPyenvShimDir,
    parsePyenvVersion,
} from '../../../../client/pythonEnvironments/common/environmentManagers/pyenv';

suite('Pyenv Identifier Tests', () => {
    const home = platformUtils.getUserHomeDir() || '';
    let getEnvVariableStub: sinon.SinonStub;
    let pathExistsStub: sinon.SinonStub;
    let getOsTypeStub: sinon.SinonStub;

    setup(() => {
        getEnvVariableStub = sinon.stub(platformUtils, 'getEnvironmentVariable');
        getOsTypeStub = sinon.stub(platformUtils, 'getOSType');
        pathExistsStub = sinon.stub(fileUtils, 'pathExists');
    });

    teardown(() => {
        getEnvVariableStub.restore();
        pathExistsStub.restore();
        getOsTypeStub.restore();
    });

    type PyenvUnitTestData = {
        testTitle: string;
        interpreterPath: string;
        pyenvEnvVar?: string;
        osType: platformUtils.OSType;
    };

    const testData: PyenvUnitTestData[] = [
        {
            testTitle: 'undefined',
            interpreterPath: path.join(home, '.pyenv', 'versions', '3.8.0', 'bin', 'python'),
            osType: platformUtils.OSType.Linux,
        },
        {
            testTitle: 'undefined',
            interpreterPath: path.join(home, '.pyenv', 'pyenv-win', 'versions', '3.8.0', 'bin', 'python'),
            osType: platformUtils.OSType.Windows,
        },
        {
            testTitle: 'its default value',
            interpreterPath: path.join(home, '.pyenv', 'versions', '3.8.0', 'bin', 'python'),
            pyenvEnvVar: path.join(home, '.pyenv'),
            osType: platformUtils.OSType.Linux,
        },
        {
            testTitle: 'its default value',
            interpreterPath: path.join(home, '.pyenv', 'pyenv-win', 'versions', '3.8.0', 'bin', 'python'),
            pyenvEnvVar: path.join(home, '.pyenv', 'pyenv-win'),
            osType: platformUtils.OSType.Windows,
        },
        {
            testTitle: 'a custom value',
            interpreterPath: path.join('path', 'to', 'mypyenv', 'versions', '3.8.0', 'bin', 'python'),
            pyenvEnvVar: path.join('path', 'to', 'mypyenv'),
            osType: platformUtils.OSType.Linux,
        },
        {
            testTitle: 'a custom value',
            interpreterPath: path.join('path', 'to', 'mypyenv', 'pyenv-win', 'versions', '3.8.0', 'bin', 'python'),
            pyenvEnvVar: path.join('path', 'to', 'mypyenv', 'pyenv-win'),
            osType: platformUtils.OSType.Windows,
        },
    ];

    testData.forEach(({ testTitle, interpreterPath, pyenvEnvVar, osType }) => {
        test(`The environment variable is set to ${testTitle} on ${osType}, and the interpreter path is in a subfolder of the pyenv folder`, async () => {
            getEnvVariableStub.withArgs('PYENV_ROOT').returns(pyenvEnvVar);
            getEnvVariableStub.withArgs('PYENV').returns(pyenvEnvVar);
            getOsTypeStub.returns(osType);
            pathExistsStub.resolves(true);

            const result = await isPyenvEnvironment(interpreterPath);

            assert.strictEqual(result, true);
        });
    });

    test('The pyenv directory does not exist', async () => {
        const interpreterPath = path.join('path', 'to', 'python');

        pathExistsStub.resolves(false);

        const result = await isPyenvEnvironment(interpreterPath);

        assert.strictEqual(result, false);
    });

    test('The interpreter path is not in a subfolder of the pyenv folder', async () => {
        const interpreterPath = path.join('path', 'to', 'python');

        pathExistsStub.resolves(true);

        const result = await isPyenvEnvironment(interpreterPath);

        assert.strictEqual(result, false);
    });
});

suite('Pyenv Versions Parser Test', () => {
    interface IPyenvVersionTestData {
        input: string;
        expectedOutput?: IPyenvVersionStrings;
    }
    const testData: IPyenvVersionTestData[] = [
        { input: '2.7.0', expectedOutput: { pythonVer: '2.7.0', distro: undefined, distroVer: undefined } },
        { input: '2.7-dev', expectedOutput: { pythonVer: '2.7-dev', distro: undefined, distroVer: undefined } },
        { input: '2.7.18', expectedOutput: { pythonVer: '2.7.18', distro: undefined, distroVer: undefined } },
        { input: '3.9.0', expectedOutput: { pythonVer: '3.9.0', distro: undefined, distroVer: undefined } },
        { input: '3.9-dev', expectedOutput: { pythonVer: '3.9-dev', distro: undefined, distroVer: undefined } },
        { input: '3.10-dev', expectedOutput: { pythonVer: '3.10-dev', distro: undefined, distroVer: undefined } },
        {
            input: 'activepython-2.7.14',
            expectedOutput: { pythonVer: undefined, distro: 'activepython', distroVer: '2.7.14' },
        },
        {
            input: 'activepython-3.6.0',
            expectedOutput: { pythonVer: undefined, distro: 'activepython', distroVer: '3.6.0' },
        },
        { input: 'anaconda-4.0.0', expectedOutput: { pythonVer: undefined, distro: 'anaconda', distroVer: '4.0.0' } },
        { input: 'anaconda2-5.3.1', expectedOutput: { pythonVer: undefined, distro: 'anaconda2', distroVer: '5.3.1' } },
        {
            input: 'anaconda2-2019.07',
            expectedOutput: { pythonVer: undefined, distro: 'anaconda2', distroVer: '2019.07' },
        },
        { input: 'anaconda3-5.3.1', expectedOutput: { pythonVer: undefined, distro: 'anaconda3', distroVer: '5.3.1' } },
        {
            input: 'anaconda3-2020.07',
            expectedOutput: { pythonVer: undefined, distro: 'anaconda3', distroVer: '2020.07' },
        },
        {
            input: 'graalpython-20.2.0',
            expectedOutput: { pythonVer: undefined, distro: 'graalpython', distroVer: '20.2.0' },
        },
        { input: 'ironpython-dev', expectedOutput: { pythonVer: undefined, distro: 'ironpython', distroVer: 'dev' } },
        {
            input: 'ironpython-2.7.6.3',
            expectedOutput: { pythonVer: undefined, distro: 'ironpython', distroVer: '2.7.6.3' },
        },
        {
            input: 'ironpython-2.7.7',
            expectedOutput: { pythonVer: undefined, distro: 'ironpython', distroVer: '2.7.7' },
        },
        { input: 'jython-dev', expectedOutput: { pythonVer: undefined, distro: 'jython', distroVer: 'dev' } },
        { input: 'jython-2.5.0', expectedOutput: { pythonVer: undefined, distro: 'jython', distroVer: '2.5.0' } },
        { input: 'jython-2.5-dev', expectedOutput: { pythonVer: undefined, distro: 'jython', distroVer: '2.5-dev' } },
        {
            input: 'jython-2.5.4-rc1',
            expectedOutput: { pythonVer: undefined, distro: 'jython', distroVer: '2.5.4-rc1' },
        },
        { input: 'jython-2.7.2', expectedOutput: { pythonVer: undefined, distro: 'jython', distroVer: '2.7.2' } },
        { input: 'micropython-dev', expectedOutput: { pythonVer: undefined, distro: 'micropython', distroVer: 'dev' } },
        {
            input: 'micropython-1.9.3',
            expectedOutput: { pythonVer: undefined, distro: 'micropython', distroVer: '1.9.3' },
        },
        {
            input: 'micropython-1.13',
            expectedOutput: { pythonVer: undefined, distro: 'micropython', distroVer: '1.13' },
        },
        {
            input: 'miniconda-latest',
            expectedOutput: { pythonVer: undefined, distro: 'miniconda', distroVer: 'latest' },
        },
        { input: 'miniconda-2.2.2', expectedOutput: { pythonVer: undefined, distro: 'miniconda', distroVer: '2.2.2' } },
        {
            input: 'miniconda-3.18.3',
            expectedOutput: { pythonVer: undefined, distro: 'miniconda', distroVer: '3.18.3' },
        },
        {
            input: 'miniconda2-latest',
            expectedOutput: { pythonVer: undefined, distro: 'miniconda2', distroVer: 'latest' },
        },
        {
            input: 'miniconda2-4.7.12',
            expectedOutput: { pythonVer: undefined, distro: 'miniconda2', distroVer: '4.7.12' },
        },
        {
            input: 'miniconda3-latest',
            expectedOutput: { pythonVer: undefined, distro: 'miniconda3', distroVer: 'latest' },
        },
        {
            input: 'miniconda3-4.7.12',
            expectedOutput: { pythonVer: undefined, distro: 'miniconda3', distroVer: '4.7.12' },
        },
        {
            input: 'miniforge3-4.9.2',
            expectedOutput: { pythonVer: undefined, distro: 'miniforge3', distroVer: '4.9.2' },
        },
        {
            input: 'pypy-c-jit-latest',
            expectedOutput: { pythonVer: undefined, distro: 'pypy-c-jit', distroVer: 'latest' },
        },
        {
            input: 'pypy-c-nojit-latest',
            expectedOutput: { pythonVer: undefined, distro: 'pypy-c-nojit', distroVer: 'latest' },
        },
        { input: 'pypy-dev', expectedOutput: { pythonVer: undefined, distro: 'pypy', distroVer: 'dev' } },
        { input: 'pypy-stm-2.3', expectedOutput: { pythonVer: undefined, distro: 'pypy-stm', distroVer: '2.3' } },
        { input: 'pypy-stm-2.5.1', expectedOutput: { pythonVer: undefined, distro: 'pypy-stm', distroVer: '2.5.1' } },
        { input: 'pypy-5.4-src', expectedOutput: { pythonVer: undefined, distro: 'pypy', distroVer: '5.4-src' } },
        { input: 'pypy-5.4', expectedOutput: { pythonVer: undefined, distro: 'pypy', distroVer: '5.4' } },
        { input: 'pypy-5.7.1-src', expectedOutput: { pythonVer: undefined, distro: 'pypy', distroVer: '5.7.1-src' } },
        { input: 'pypy-5.7.1', expectedOutput: { pythonVer: undefined, distro: 'pypy', distroVer: '5.7.1' } },
        { input: 'pypy2-5.4-src', expectedOutput: { pythonVer: '2', distro: 'pypy', distroVer: '5.4-src' } },
        { input: 'pypy2-5.4', expectedOutput: { pythonVer: '2', distro: 'pypy', distroVer: '5.4' } },
        { input: 'pypy2-5.4.1-src', expectedOutput: { pythonVer: '2', distro: 'pypy', distroVer: '5.4.1-src' } },
        { input: 'pypy2-5.4.1', expectedOutput: { pythonVer: '2', distro: 'pypy', distroVer: '5.4.1' } },
        { input: 'pypy2.7-7.3.1-src', expectedOutput: { pythonVer: '2.7', distro: 'pypy', distroVer: '7.3.1-src' } },
        { input: 'pypy2.7-7.3.1', expectedOutput: { pythonVer: '2.7', distro: 'pypy', distroVer: '7.3.1' } },
        { input: 'pypy3-2.4.0-src', expectedOutput: { pythonVer: '3', distro: 'pypy', distroVer: '2.4.0-src' } },
        { input: 'pypy3-2.4.0', expectedOutput: { pythonVer: '3', distro: 'pypy', distroVer: '2.4.0' } },
        {
            input: 'pypy3.3-5.2-alpha1-src',
            expectedOutput: { pythonVer: '3.3', distro: 'pypy', distroVer: '5.2-alpha1-src' },
        },
        { input: 'pypy3.3-5.2-alpha1', expectedOutput: { pythonVer: '3.3', distro: 'pypy', distroVer: '5.2-alpha1' } },
        {
            input: 'pypy3.3-5.5-alpha-src',
            expectedOutput: { pythonVer: '3.3', distro: 'pypy', distroVer: '5.5-alpha-src' },
        },
        { input: 'pypy3.3-5.5-alpha', expectedOutput: { pythonVer: '3.3', distro: 'pypy', distroVer: '5.5-alpha' } },
        {
            input: 'pypy3.5-c-jit-latest',
            expectedOutput: { pythonVer: '3.5', distro: 'pypy-c-jit', distroVer: 'latest' },
        },
        {
            input: 'pypy3.5-5.7-beta-src',
            expectedOutput: { pythonVer: '3.5', distro: 'pypy', distroVer: '5.7-beta-src' },
        },
        { input: 'pypy3.5-5.7-beta', expectedOutput: { pythonVer: '3.5', distro: 'pypy', distroVer: '5.7-beta' } },
        {
            input: 'pypy3.5-5.7.1-beta-src',
            expectedOutput: { pythonVer: '3.5', distro: 'pypy', distroVer: '5.7.1-beta-src' },
        },
        { input: 'pypy3.5-5.7.1-beta', expectedOutput: { pythonVer: '3.5', distro: 'pypy', distroVer: '5.7.1-beta' } },
        { input: 'pypy3.6-7.3.1-src', expectedOutput: { pythonVer: '3.6', distro: 'pypy', distroVer: '7.3.1-src' } },
        { input: 'pypy3.6-7.3.1', expectedOutput: { pythonVer: '3.6', distro: 'pypy', distroVer: '7.3.1' } },
        {
            input: 'pypy3.7-v7.3.5rc3-win64',
            expectedOutput: { pythonVer: '3.7', distro: 'pypy', distroVer: '7.3.5rc3-win64' },
        },
        {
            input: 'pypy3.7-v7.3.5-win64',
            expectedOutput: { pythonVer: '3.7', distro: 'pypy', distroVer: '7.3.5-win64' },
        },
        {
            input: 'pypy-5.7.1-beta-src',
            expectedOutput: { pythonVer: undefined, distro: 'pypy', distroVer: '5.7.1-beta-src' },
        },
        { input: 'pypy', expectedOutput: { pythonVer: undefined, distro: 'pypy', distroVer: undefined } },
        { input: 'pyston-0.6.1', expectedOutput: { pythonVer: undefined, distro: 'pyston', distroVer: '0.6.1' } },
        { input: 'stackless-dev', expectedOutput: { pythonVer: undefined, distro: 'stackless', distroVer: 'dev' } },
        {
            input: 'stackless-2.7-dev',
            expectedOutput: { pythonVer: undefined, distro: 'stackless', distroVer: '2.7-dev' },
        },
        {
            input: 'stackless-3.4-dev',
            expectedOutput: { pythonVer: undefined, distro: 'stackless', distroVer: '3.4-dev' },
        },
        { input: 'stackless-3.7.5', expectedOutput: { pythonVer: undefined, distro: 'stackless', distroVer: '3.7.5' } },
        { input: 'stackless', expectedOutput: { pythonVer: undefined, distro: 'stackless', distroVer: undefined } },
        { input: 'unknown', expectedOutput: undefined },
    ];

    testData.forEach((data) => {
        test(`Parse pyenv version [${data.input}]`, async () => {
            assert.deepStrictEqual(parsePyenvVersion(data.input), data.expectedOutput);
        });
    });
});

suite('Pyenv Shims Dir filter tests', () => {
    let getEnvVariableStub: sinon.SinonStub;
    const pyenvRoot = path.join('path', 'to', 'pyenv', 'root');

    setup(() => {
        getEnvVariableStub = sinon.stub(platformUtils, 'getEnvironmentVariable');
        getEnvVariableStub.withArgs('PYENV_ROOT').returns(pyenvRoot);
    });

    teardown(() => {
        getEnvVariableStub.restore();
    });

    test('isPyenvShimDir: valid case', () => {
        assert.deepStrictEqual(isPyenvShimDir(path.join(pyenvRoot, 'shims')), true);
    });
    test('isPyenvShimDir: invalid case', () => {
        assert.deepStrictEqual(isPyenvShimDir(__dirname), false);
    });
});
