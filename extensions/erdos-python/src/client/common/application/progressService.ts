// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ProgressOptions } from 'vscode';
import { Deferred, createDeferred } from '../utils/async';
import { IApplicationShell } from './types';

export class ProgressService {
    private deferred: Deferred<void> | undefined;

    constructor(private readonly shell: IApplicationShell) {}

    public showProgress(options: ProgressOptions): void {
        if (!this.deferred) {
            this.createProgress(options);
        }
    }

    public hideProgress(): void {
        if (this.deferred) {
            this.deferred.resolve();
            this.deferred = undefined;
        }
    }

    private createProgress(options: ProgressOptions) {
        this.shell.withProgress(options, () => {
            this.deferred = createDeferred();
            return this.deferred.promise;
        });
    }
}
