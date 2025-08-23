// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { CancellationTokenSource } from 'vscode';
import { ProcessService } from '../../../client/common/process/proc';
import { StdErrError } from '../../../client/common/process/types';
import { OSType } from '../../../client/common/utils/platform';
import { isOs, isPythonVersion } from '../../common';
import { getExtensionSettings } from '../../extensionSettings';
import { initialize } from './../../initialize';

use(chaiAsPromised.default);

suite('ProcessService Observable', () => {
    let pythonPath: string;
    suiteSetup(() => {
        pythonPath = getExtensionSettings(undefined).pythonPath;
        return initialize();
    });
    setup(initialize);
    teardown(initialize);

    test('exec should output print statements', async () => {
        const procService = new ProcessService();
        const printOutput = '1234';
        const result = await procService.exec(pythonPath, ['-c', `print("${printOutput}")`]);

        expect(result).not.to.be.an('undefined', 'result is undefined');
        expect(result.stdout.trim()).to.be.equal(printOutput, 'Invalid output');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');
    });

    test('When using worker threads, exec should output print statements', async () => {
        const procService = new ProcessService();
        const printOutput = '1234';
        const result = await procService.exec(pythonPath, ['-c', `print("${printOutput}")`], { useWorker: true });

        expect(result).not.to.be.an('undefined', 'result is undefined');
        expect(result.stdout.trim()).to.be.equal(printOutput, 'Invalid output');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');
    });

    test('exec should output print unicode characters', async function () {
        // This test has not been working for many months in Python 2.7 under
        // Windows. Tracked by #2546. (unicode under Py2.7 is tough!)
        if (isOs(OSType.Windows) && (await isPythonVersion('2.7'))) {
            return this.skip();
        }

        const procService = new ProcessService();
        const printOutput = 'öä';
        const result = await procService.exec(pythonPath, ['-c', `print("${printOutput}")`]);

        expect(result).not.to.be.an('undefined', 'result is undefined');
        expect(result.stdout.trim()).to.be.equal(printOutput, 'Invalid output');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');
    });

    test('exec should wait for completion of program with new lines', async function () {
        this.timeout(5000);
        const procService = new ProcessService();
        const pythonCode = [
            'import sys',
            'import time',
            'print("1")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'print("2")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'print("3")',
        ];
        const result = await procService.exec(pythonPath, ['-c', pythonCode.join(';')]);
        const outputs = ['1', '2', '3'];

        expect(result).not.to.be.an('undefined', 'result is undefined');
        const values = result.stdout
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        expect(values).to.deep.equal(outputs, 'Output values are incorrect');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');
    });

    test('exec should wait for completion of program without new lines', async function () {
        this.timeout(5000);
        const procService = new ProcessService();
        const pythonCode = [
            'import sys',
            'import time',
            'sys.stdout.write("1")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stdout.write("2")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stdout.write("3")',
        ];
        const result = await procService.exec(pythonPath, ['-c', pythonCode.join(';')]);
        const outputs = ['123'];

        expect(result).not.to.be.an('undefined', 'result is undefined');
        const values = result.stdout
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        expect(values).to.deep.equal(outputs, 'Output values are incorrect');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');
    });

    test('exec should end when cancellationToken is cancelled', async function () {
        this.timeout(15000);
        const procService = new ProcessService();
        const pythonCode = [
            'import sys',
            'import time',
            'print("1")',
            'sys.stdout.flush()',
            'time.sleep(10)',
            'print("2")',
            'sys.stdout.flush()',
        ];
        const cancellationToken = new CancellationTokenSource();
        setTimeout(() => cancellationToken.cancel(), 3000);

        const result = await procService.exec(pythonPath, ['-c', pythonCode.join(';')], {
            token: cancellationToken.token,
        });

        expect(result).not.to.be.an('undefined', 'result is undefined');
        const values = result.stdout
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        expect(values).to.deep.equal(['1'], 'Output values are incorrect');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');
    });

    test('exec should stream stdout and stderr separately and filter output using conda related markers', async function () {
        this.timeout(7000);
        const procService = new ProcessService();
        const pythonCode = [
            'print(">>>PYTHON-EXEC-OUTPUT")',
            'import sys',
            'import time',
            'print("1")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stderr.write("a")',
            'sys.stderr.flush()',
            'time.sleep(1)',
            'print("2")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stderr.write("b")',
            'sys.stderr.flush()',
            'time.sleep(1)',
            'print("3")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stderr.write("c")',
            'sys.stderr.flush()',
            'print("<<<PYTHON-EXEC-OUTPUT")',
        ];
        const result = await procService.exec(pythonPath, ['-c', pythonCode.join(';')]);
        const expectedStdout = ['1', '2', '3'];
        const expectedStderr = ['abc'];

        expect(result).not.to.be.an('undefined', 'result is undefined');
        const stdouts = result.stdout
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        expect(stdouts).to.deep.equal(expectedStdout, 'stdout values are incorrect');
        const stderrs = result
            .stderr!.split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        expect(stderrs).to.deep.equal(expectedStderr, 'stderr values are incorrect');
    });

    test('exec should merge stdout and stderr streams', async function () {
        this.timeout(7000);
        const procService = new ProcessService();
        const pythonCode = [
            'import sys',
            'import time',
            'sys.stdout.write("1")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stderr.write("a")',
            'sys.stderr.flush()',
            'time.sleep(1)',
            'sys.stdout.write("2")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stderr.write("b")',
            'sys.stderr.flush()',
            'time.sleep(1)',
            'sys.stdout.write("3")',
            'sys.stdout.flush()',
            'time.sleep(1)',
            'sys.stderr.write("c")',
            'sys.stderr.flush()',
        ];
        const result = await procService.exec(pythonPath, ['-c', pythonCode.join(';')], { mergeStdOutErr: true });
        const expectedOutput = ['1a2b3c'];

        expect(result).not.to.be.an('undefined', 'result is undefined');
        const outputs = result.stdout
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        expect(outputs).to.deep.equal(expectedOutput, 'Output values are incorrect');
    });

    test('exec should throw an error with stderr output', async () => {
        const procService = new ProcessService();
        const pythonCode = ['import sys', 'sys.stderr.write("a")', 'sys.stderr.flush()'];
        const result = procService.exec(pythonPath, ['-c', pythonCode.join(';')], { throwOnStdErr: true });

        await expect(result).to.eventually.be.rejectedWith(StdErrError, 'a', 'Expected error to be thrown');
    });

    test('exec should throw an error when spawn file not found', async () => {
        const procService = new ProcessService();
        const result = procService.exec(Date.now().toString(), []);

        await expect(result).to.eventually.be.rejected.and.to.have.property('code', 'ENOENT', 'Invalid error code');
    });

    test('exec should exit without no output', async () => {
        const procService = new ProcessService();
        const result = await procService.exec(pythonPath, ['-c', 'import sys', 'sys.exit()']);

        expect(result.stdout).equals('', 'stdout is invalid');
        expect(result.stderr).equals(undefined, 'stderr is invalid');
    });
    test('shellExec should be able to run python and filter output using conda related markers', async () => {
        const procService = new ProcessService();
        const printOutput = '1234';
        const result = await procService.shellExec(
            `"${pythonPath}" -c "print('>>>PYTHON-EXEC-OUTPUT');print('${printOutput}');print('<<<PYTHON-EXEC-OUTPUT')"`,
        );

        expect(result).not.to.be.an('undefined', 'result is undefined');
        expect(result.stderr).to.equal(undefined, 'stderr not empty');
        expect(result.stdout.trim()).to.be.equal(printOutput, 'Invalid output');
    });
    test('When using worker threads, shellExec should be able to run python and filter output using conda related markers', async () => {
        const procService = new ProcessService();
        const printOutput = '1234';
        const result = await procService.shellExec(
            `"${pythonPath}" -c "print('>>>PYTHON-EXEC-OUTPUT');print('${printOutput}');print('<<<PYTHON-EXEC-OUTPUT')"`,
            { useWorker: true },
        );

        expect(result).not.to.be.an('undefined', 'result is undefined');
        expect(result.stderr).to.equal(undefined, 'stderr not empty');
        expect(result.stdout.trim()).to.be.equal(printOutput, 'Invalid output');
    });
    test('shellExec should fail on invalid command', async () => {
        const procService = new ProcessService();
        const result = procService.shellExec('invalid command');
        await expect(result).to.eventually.be.rejectedWith(Error, 'a', 'Expected error to be thrown');
    });
    test('variables can be changed after the fact', async () => {
        const procService = new ProcessService(process.env);
        let result = await procService.exec(pythonPath, ['-c', `import os;print(os.environ.get("MY_TEST_VARIABLE"))`], {
            extraVariables: { MY_TEST_VARIABLE: 'foo' },
        });

        expect(result).not.to.be.an('undefined', 'result is undefined');
        expect(result.stdout.trim()).to.be.equal('foo', 'Invalid output');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');

        result = await procService.exec(pythonPath, ['-c', `import os;print(os.environ.get("MY_TEST_VARIABLE"))`]);
        expect(result).not.to.be.an('undefined', 'result is undefined');
        expect(result.stdout.trim()).to.be.equal('None', 'Invalid output');
        expect(result.stderr).to.equal(undefined, 'stderr not undefined');
    });
});
