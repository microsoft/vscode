// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { CurrentProcess } from '../../../client/common/process/currentProcess';
import { ICurrentProcess } from '../../../client/common/types';

suite('Current Process', () => {
    let currentProcess: ICurrentProcess;
    setup(() => {
        currentProcess = new CurrentProcess();
    });

    test('Current process argv is returned', () => {
        expect(currentProcess.argv).to.deep.equal(process.argv);
    });

    test('Current process env is returned', () => {
        expect(currentProcess.env).to.deep.equal(process.env);
    });

    test('Current process stdin is returned', () => {
        expect(currentProcess.stdin).to.deep.equal(process.stdin);
    });

    test('Current process stdout is returned', () => {
        expect(currentProcess.stdout).to.deep.equal(process.stdout);
    });
});
