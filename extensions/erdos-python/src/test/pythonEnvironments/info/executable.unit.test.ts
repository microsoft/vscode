// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { IMock, Mock, MockBehavior, It } from 'typemoq';
import { ExecutionResult, ShellOptions, StdErrError } from '../../../client/common/process/types';
import { buildPythonExecInfo } from '../../../client/pythonEnvironments/exec';
import { getExecutablePath } from '../../../client/pythonEnvironments/info/executable';

interface IDeps {
    shellExec(command: string, options: ShellOptions | undefined): Promise<ExecutionResult<string>>;
}

suite('getExecutablePath()', () => {
    let deps: IMock<IDeps>;
    const python = buildPythonExecInfo('path/to/python');

    setup(() => {
        deps = Mock.ofType<IDeps>(undefined, MockBehavior.Strict);
    });

    test('should get the value by running python', async () => {
        const expected = 'path/to/dummy/executable';
        deps.setup((d) => d.shellExec(`${python.command} -c "import sys;print(sys.executable)"`, It.isAny()))
            // Return the expected value.
            .returns(() => Promise.resolve({ stdout: expected }));
        const exec = async (c: string, a: ShellOptions | undefined) => deps.object.shellExec(c, a);

        const result = await getExecutablePath(python, exec);

        expect(result).to.equal(expected, 'getExecutablePath() should return get the value by running Python');
        deps.verifyAll();
    });

    test('should throw if exec() fails', async () => {
        const stderr = 'oops';
        deps.setup((d) => d.shellExec(`${python.command} -c "import sys;print(sys.executable)"`, It.isAny()))
            // Throw an error.
            .returns(() => Promise.reject(new StdErrError(stderr)));
        const exec = async (c: string, a: ShellOptions | undefined) => deps.object.shellExec(c, a);

        const promise = getExecutablePath(python, exec);

        expect(promise).to.eventually.be.rejectedWith(stderr);
        deps.verifyAll();
    });
});
