// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert, expect } from 'chai';
import { anything, capture, instance, mock, when } from 'ts-mockito';
import { CancellationToken, Progress, ProgressLocation, ProgressOptions } from 'vscode';
import { ApplicationShell } from '../../../client/common/application/applicationShell';
import { ProgressService } from '../../../client/common/application/progressService';
import { IApplicationShell } from '../../../client/common/application/types';
import { createDeferred, createDeferredFromPromise, Deferred, sleep } from '../../../client/common/utils/async';

type ProgressTask<R> = (
    progress: Progress<{ message?: string; increment?: number }>,
    token: CancellationToken,
) => Thenable<R>;

suite('Progress Service', () => {
    let refreshDeferred: Deferred<void>;
    let shell: ApplicationShell;
    let progressService: ProgressService;
    setup(() => {
        refreshDeferred = createDeferred<void>();
        shell = mock<IApplicationShell>();
        progressService = new ProgressService(instance(shell));
    });
    teardown(() => {
        refreshDeferred.resolve();
    });
    test('Display discovering message when refreshing interpreters for the first time', async () => {
        when(shell.withProgress(anything(), anything())).thenResolve();
        const expectedOptions = { title: 'message', location: ProgressLocation.Window };

        progressService.showProgress(expectedOptions);

        const options = capture(shell.withProgress as never).last()[0] as ProgressOptions;
        assert.deepEqual(options, expectedOptions);
    });

    test('Progress message is hidden when loading has completed', async () => {
        when(shell.withProgress(anything(), anything())).thenResolve();
        const options = { title: 'message', location: ProgressLocation.Window };
        progressService.showProgress(options);

        const callback = capture(shell.withProgress as never).last()[1] as ProgressTask<void>;
        const promise = callback(undefined as never, undefined as never);
        const deferred = createDeferredFromPromise(promise as Promise<void>);
        await sleep(1);
        expect(deferred.completed).to.be.equal(false, 'Progress disappeared before hiding it');
        progressService.hideProgress();
        await sleep(1);
        expect(deferred.completed).to.be.equal(true, 'Progress did not disappear');
    });
});
