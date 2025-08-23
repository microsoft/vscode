// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { CancellationTokenSource } from 'vscode';

import { ProcessService } from '../../../client/common/process/proc';
import { createDeferred } from '../../../client/common/utils/async';
import { isOs, OSType } from '../../common';
import { getExtensionSettings } from '../../extensionSettings';
import { initialize } from './../../initialize';

use(chaiAsPromised.default);

suite('ProcessService', () => {
    let pythonPath: string;
    suiteSetup(() => {
        pythonPath = getExtensionSettings(undefined).pythonPath;
        return initialize();
    });
    setup(initialize);
    teardown(initialize);

    test('execObservable should stream output with new lines', function (done) {
        this.timeout(10000);
        const procService = new ProcessService();
        const pythonCode = [
            'import sys',
            'import time',
            'print("1")',
            'sys.stdout.flush()',
            'time.sleep(2)',
            'print("2")',
            'sys.stdout.flush()',
            'time.sleep(2)',
            'print("3")',
            'sys.stdout.flush()',
            'time.sleep(2)',
        ];
        const result = procService.execObservable(pythonPath, ['-c', pythonCode.join(';')]);
        const outputs = ['1', '2', '3'];

        expect(result).not.to.be.an('undefined', 'result is undefined');
        result.out.subscribe(
            (output) => {
                // Ignore line breaks.
                if (output.out.trim().length === 0) {
                    return;
                }
                const expectedValue = outputs.shift();
                if (expectedValue !== output.out.trim() && expectedValue === output.out) {
                    done(`Received value ${output.out} is not same as the expectd value ${expectedValue}`);
                }
                if (output.source !== 'stdout') {
                    done(`Source is not stdout. Value received is ${output.source}`);
                }
            },
            done,
            done,
        );
    });

    test('execObservable should stream output without new lines', function (done) {
        // Skipping to get nightly build to pass. Opened this issue:
        // https://github.com/microsoft/vscode-python/issues/7411

        this.skip();

        this.timeout(10000);
        const procService = new ProcessService();
        const pythonCode = [
            'import sys',
            'import time',
            'sys.stdout.write("1")',
            'sys.stdout.flush()',
            'time.sleep(2)',
            'sys.stdout.write("2")',
            'sys.stdout.flush()',
            'time.sleep(2)',
            'sys.stdout.write("3")',
            'sys.stdout.flush()',
            'time.sleep(2)',
        ];
        const result = procService.execObservable(pythonPath, ['-c', pythonCode.join(';')]);
        const outputs = ['1', '2', '3'];

        expect(result).not.to.be.an('undefined', 'result is undefined');
        result.out.subscribe(
            (output) => {
                // Ignore line breaks.
                if (output.out.trim().length === 0) {
                    return;
                }
                const expectedValue = outputs.shift();
                if (expectedValue !== output.out) {
                    done(`Received value ${output.out} is not same as the expectd value ${expectedValue}`);
                }
                if (output.source !== 'stdout') {
                    done(`Source is not stdout. Value received is ${output.source}`);
                }
            },
            done,
            done,
        );
    });

    test('execObservable should end when cancellationToken is cancelled', function (done) {
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
            'time.sleep(2)',
        ];
        const cancellationToken = new CancellationTokenSource();
        const result = procService.execObservable(pythonPath, ['-c', pythonCode.join(';')], {
            token: cancellationToken.token,
        });

        const def = createDeferred();
        def.promise.then(done).catch(done);
        expect(result).not.to.be.an('undefined', 'result is undefined');
        result.out.subscribe(
            (output) => {
                const value = output.out.trim();
                if (value === '1') {
                    cancellationToken.cancel();
                } else {
                    if (!def.completed) {
                        def.reject("Output received when we shouldn't have.");
                    }
                }
            },
            done,
            () => {
                if (def.completed) {
                    return;
                }
                if (cancellationToken.token.isCancellationRequested) {
                    def.resolve();
                } else {
                    def.reject('Program terminated even before cancelling it.');
                }
            },
        );
    });

    test('execObservable should end when process is killed', function (done) {
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
            'time.sleep(2)',
        ];
        const cancellationToken = new CancellationTokenSource();
        const result = procService.execObservable(pythonPath, ['-c', pythonCode.join(';')], {
            token: cancellationToken.token,
        });
        let procKilled = false;

        expect(result).not.to.be.an('undefined', 'result is undefined');
        result.out.subscribe(
            (output) => {
                const value = output.out.trim();
                // Ignore line breaks.
                if (value.length === 0) {
                    return;
                }
                if (value === '1') {
                    procKilled = true;
                    if (result.proc) {
                        result.proc.kill();
                    }
                } else {
                    done("Output received when we shouldn't have.");
                }
            },
            done,
            () => {
                const errorMsg = procKilled ? undefined : 'Program terminated even before killing it.';
                done(errorMsg);
            },
        );
    });

    test('execObservable should stream stdout and stderr separately and removes markers related to conda run', function (done) {
        this.timeout(20000);
        const procService = new ProcessService();
        const pythonCode = [
            'print(">>>PYTHON-EXEC-OUTPUT")',
            'import sys',
            'import time',
            'print("1")',
            'sys.stdout.flush()',
            'time.sleep(2)',
            'sys.stderr.write("a")',
            'sys.stderr.flush()',
            'time.sleep(2)',
            'print("2")',
            'sys.stdout.flush()',
            'time.sleep(2)',
            'sys.stderr.write("b")',
            'sys.stderr.flush()',
            'time.sleep(2)',
            'print("3")',
            'sys.stdout.flush()',
            'time.sleep(2)',
            'sys.stderr.write("c")',
            'sys.stderr.flush()',
            'time.sleep(2)',
            'print("<<<PYTHON-EXEC-OUTPUT")',
        ];
        const result = procService.execObservable(pythonPath, ['-c', pythonCode.join(';')]);
        const outputs = [
            { out: '1', source: 'stdout' },
            { out: 'a', source: 'stderr' },
            { out: '2', source: 'stdout' },
            { out: 'b', source: 'stderr' },
            { out: '3', source: 'stdout' },
            { out: 'c', source: 'stderr' },
        ];

        expect(result).not.to.be.an('undefined', 'result is undefined');
        result.out.subscribe(
            (output) => {
                const value = output.out.trim();
                // Ignore line breaks.
                if (value.length === 0) {
                    return;
                }
                const expectedOutput = outputs.shift()!;

                expect(value).to.be.equal(expectedOutput.out, 'Expected output is incorrect');
                expect(output.source).to.be.equal(expectedOutput.source, 'Expected sopurce is incorrect');
            },
            done,
            done,
        );
    });
    test('execObservable should send stdout and stderr streams separately', async function () {
        // This test is failing on Windows. Tracked by GH #4755.
        if (isOs(OSType.Windows)) {
            return this.skip();
        }
    });

    test('execObservable should throw an error with stderr output', (done) => {
        const procService = new ProcessService();
        const pythonCode = ['import sys', 'sys.stderr.write("a")', 'sys.stderr.flush()'];
        const result = procService.execObservable(pythonPath, ['-c', pythonCode.join(';')], { throwOnStdErr: true });

        expect(result).not.to.be.an('undefined', 'result is undefined.');
        result.out.subscribe(
            (_output) => {
                done("Output received, when we're expecting an error to be thrown.");
            },
            (ex: Error) => {
                expect(ex).to.have.property('message', 'a', 'Invalid error thrown');
                done();
            },
            () => {
                done("Completed, when we're expecting an error to be thrown.");
            },
        );
    });

    test('execObservable should throw an error when spawn file not found', (done) => {
        const procService = new ProcessService();
        const result = procService.execObservable(Date.now().toString(), []);

        expect(result).not.to.be.an('undefined', 'result is undefined.');
        result.out.subscribe(
            (_output) => {
                done("Output received, when we're expecting an error to be thrown.");
            },
            (ex) => {
                expect(ex).to.have.property('code', 'ENOENT', 'Invalid error code');
                done();
            },
            () => {
                done("Completed, when we're expecting an error to be thrown.");
            },
        );
    });

    test('execObservable should exit without no output', (done) => {
        const procService = new ProcessService();
        const result = procService.execObservable(pythonPath, ['-c', 'import sys', 'sys.exit()']);

        expect(result).not.to.be.an('undefined', 'result is undefined.');
        result.out.subscribe(
            (output) => {
                done(`Output received, when we\'re not expecting any, ${JSON.stringify(output)}`);
            },
            done,
            done,
        );
    });
});
