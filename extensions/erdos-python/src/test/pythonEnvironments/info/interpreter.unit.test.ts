// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { join as pathJoin } from 'path';
import { SemVer } from 'semver';
import { IMock, It, It as TypeMoqIt, Mock, MockBehavior } from 'typemoq';
import { ShellOptions, StdErrError } from '../../../client/common/process/types';
import { Architecture } from '../../../client/common/utils/platform';
import { buildPythonExecInfo } from '../../../client/pythonEnvironments/exec';
import { getInterpreterInfo } from '../../../client/pythonEnvironments/info/interpreter';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from '../../constants';

const script = pathJoin(EXTENSION_ROOT_DIR_FOR_TESTS, 'python_files', 'interpreterInfo.py');

suite('extractInterpreterInfo()', () => {
    // Tests go here.
});

type ShellExecResult = {
    stdout: string;
    stderr?: string;
};
interface IDeps {
    shellExec(command: string, options?: ShellOptions | undefined): Promise<ShellExecResult>;
}

suite('getInterpreterInfo()', () => {
    let deps: IMock<IDeps>;
    const python = buildPythonExecInfo('path/to/python');

    setup(() => {
        deps = Mock.ofType<IDeps>(undefined, MockBehavior.Strict);
    });

    test('should call exec() with the proper command and timeout', async () => {
        const json = {
            versionInfo: [3, 7, 5, 'candidate', 1],
            sysPrefix: '/path/of/sysprefix/versions/3.7.5rc1',
            version: '3.7.5rc1 (default, Oct 18 2019, 14:48:48) \n[Clang 11.0.0 (clang-1100.0.33.8)]',
            is64Bit: true,
        };
        const cmd = `"${python.command}" "${script}"`;
        deps
            // Checking the args is the key point of this test.
            .setup((d) => d.shellExec(cmd, It.isAny()))
            .returns(() =>
                Promise.resolve({
                    stdout: JSON.stringify(json),
                }),
            );
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        await getInterpreterInfo(python, shellExec);

        deps.verifyAll();
    });

    test('should quote spaces in the command', async () => {
        const json = {
            versionInfo: [3, 7, 5, 'candidate', 1],
            sysPrefix: '/path/of/sysprefix/versions/3.7.5rc1',
            version: '3.7.5rc1 (default, Oct 18 2019, 14:48:48) \n[Clang 11.0.0 (clang-1100.0.33.8)]',
            is64Bit: true,
        };
        const _python = buildPythonExecInfo(' path to /my python ');
        const cmd = `" path to /my python " "${script}"`;
        deps
            // Checking the args is the key point of this test.
            .setup((d) => d.shellExec(cmd, It.isAny()))
            .returns(() =>
                Promise.resolve({
                    stdout: JSON.stringify(json),
                }),
            );
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        await getInterpreterInfo(_python, shellExec);

        deps.verifyAll();
    });

    test('should handle multi-command (e.g. conda)', async () => {
        const json = {
            versionInfo: [3, 7, 5, 'candidate', 1],
            sysPrefix: '/path/of/sysprefix/versions/3.7.5rc1',
            version: '3.7.5rc1 (default, Oct 18 2019, 14:48:48) \n[Clang 11.0.0 (clang-1100.0.33.8)]',
            is64Bit: true,
        };
        const _python = buildPythonExecInfo(['path/to/conda', 'run', '-n', 'my-env', 'python']);
        const cmd = `"path/to/conda" "run" "-n" "my-env" "python" "${script}"`;
        deps
            // Checking the args is the key point of this test.
            .setup((d) => d.shellExec(cmd, It.isAny()))
            .returns(() =>
                Promise.resolve({
                    stdout: JSON.stringify(json),
                }),
            );
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        await getInterpreterInfo(_python, shellExec);

        deps.verifyAll();
    });

    test('should return an object if exec() is successful', async () => {
        const expected = {
            architecture: Architecture.x64,
            path: python.command,
            version: new SemVer('3.7.5-candidate1'),
            sysPrefix: '/path/of/sysprefix/versions/3.7.5rc1',
            sysVersion: undefined,
        };
        const json = {
            versionInfo: [3, 7, 5, 'candidate', 1],
            sysPrefix: expected.sysPrefix,
            version: '3.7.5rc1 (default, Oct 18 2019, 14:48:48) \n[Clang 11.0.0 (clang-1100.0.33.8)]',
            is64Bit: true,
        };
        deps
            // We check the args in other tests.
            .setup((d) => d.shellExec(TypeMoqIt.isAny(), TypeMoqIt.isAny()))
            .returns(() =>
                Promise.resolve({
                    stdout: JSON.stringify(json),
                }),
            );
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        const result = await getInterpreterInfo(python, shellExec);

        expect(result).to.deep.equal(expected, 'broken');
        deps.verifyAll();
    });

    test('should return an object if the version info contains less than 4 items', async () => {
        const expected = {
            architecture: Architecture.x64,
            path: python.command,
            version: new SemVer('3.7.5'),
            sysPrefix: '/path/of/sysprefix/versions/3.7.5rc1',
            sysVersion: undefined,
        };
        const json = {
            versionInfo: [3, 7, 5],
            sysPrefix: expected.sysPrefix,
            version: '3.7.5rc1 (default, Oct 18 2019, 14:48:48) \n[Clang 11.0.0 (clang-1100.0.33.8)]',
            is64Bit: true,
        };
        deps
            // We check the args in other tests.
            .setup((d) => d.shellExec(TypeMoqIt.isAny(), TypeMoqIt.isAny()))
            .returns(() =>
                Promise.resolve({
                    stdout: JSON.stringify(json),
                }),
            );
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        const result = await getInterpreterInfo(python, shellExec);

        expect(result).to.deep.equal(expected, 'broken');
        deps.verifyAll();
    });

    test('should return an object with the architecture value set to x86 if json.is64bit is not 64bit', async () => {
        const expected = {
            architecture: Architecture.x86,
            path: python.command,
            version: new SemVer('3.7.5-candidate'),
            sysPrefix: '/path/of/sysprefix/versions/3.7.5rc1',
            sysVersion: undefined,
        };
        const json = {
            versionInfo: [3, 7, 5, 'candidate'],
            sysPrefix: expected.sysPrefix,
            version: '3.7.5rc1 (default, Oct 18 2019, 14:48:48) \n[Clang 11.0.0 (clang-1100.0.33.8)]',
            is64Bit: false,
        };
        deps
            // We check the args in other tests.
            .setup((d) => d.shellExec(TypeMoqIt.isAny(), TypeMoqIt.isAny()))
            .returns(() =>
                Promise.resolve({
                    stdout: JSON.stringify(json),
                }),
            );
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        const result = await getInterpreterInfo(python, shellExec);

        expect(result).to.deep.equal(expected, 'broken');
        deps.verifyAll();
    });

    test('should return undefined if the result of exec() writes to stderr', async () => {
        const err = new StdErrError('oops!');
        deps
            // We check the args in other tests.
            .setup((d) => d.shellExec(TypeMoqIt.isAny(), TypeMoqIt.isAny()))
            .returns(() => Promise.reject(err));
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        const result = getInterpreterInfo(python, shellExec);

        await expect(result).to.eventually.be.rejectedWith(err);
        deps.verifyAll();
    });

    test('should fail if exec() fails (e.g. the script times out)', async () => {
        const err = new Error('oops');
        deps
            // We check the args in other tests.
            .setup((d) => d.shellExec(TypeMoqIt.isAny(), TypeMoqIt.isAny()))
            .returns(() => Promise.reject(err));
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        const result = getInterpreterInfo(python, shellExec);

        await expect(result).to.eventually.be.rejectedWith(err);
        deps.verifyAll();
    });

    test('should fail if the json value returned by interpreterInfo.py is not valid', async () => {
        deps
            // We check the args in other tests.
            .setup((d) => d.shellExec(TypeMoqIt.isAny(), TypeMoqIt.isAny()))
            .returns(() => Promise.resolve({ stdout: 'bad json' }));
        const shellExec = async (c: string, t: ShellOptions | undefined) => deps.object.shellExec(c, t);

        const result = getInterpreterInfo(python, shellExec);

        await expect(result).to.eventually.be.rejected;
        deps.verifyAll();
    });
});
