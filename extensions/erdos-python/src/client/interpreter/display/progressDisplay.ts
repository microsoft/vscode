// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Disposable, ProgressLocation, ProgressOptions } from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IApplicationShell } from '../../common/application/types';
import { Commands } from '../../common/constants';
import { IDisposableRegistry } from '../../common/types';
import { createDeferred, Deferred } from '../../common/utils/async';
import { Interpreters } from '../../common/utils/localize';
import { traceDecoratorVerbose } from '../../logging';
import { ProgressReportStage } from '../../pythonEnvironments/base/locator';
import { IComponentAdapter } from '../contracts';

// The parts of IComponentAdapter used here.
@injectable()
export class InterpreterLocatorProgressStatusBarHandler implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };

    private deferred: Deferred<void> | undefined;

    private isFirstTimeLoadingInterpreters = true;

    constructor(
        @inject(IApplicationShell) private readonly shell: IApplicationShell,
        @inject(IDisposableRegistry) private readonly disposables: Disposable[],
        @inject(IComponentAdapter) private readonly pyenvs: IComponentAdapter,
    ) {}

    public async activate(): Promise<void> {
        this.pyenvs.onProgress(
            (event) => {
                if (event.stage === ProgressReportStage.discoveryStarted) {
                    this.showProgress();
                    const refreshPromise = this.pyenvs.getRefreshPromise();
                    if (refreshPromise) {
                        refreshPromise.then(() => this.hideProgress());
                    }
                } else if (event.stage === ProgressReportStage.discoveryFinished) {
                    this.hideProgress();
                }
            },
            this,
            this.disposables,
        );
    }

    @traceDecoratorVerbose('Display locator refreshing progress')
    private showProgress(): void {
        if (!this.deferred) {
            this.createProgress();
        }
    }

    @traceDecoratorVerbose('Hide locator refreshing progress')
    private hideProgress(): void {
        if (this.deferred) {
            this.deferred.resolve();
            this.deferred = undefined;
        }
    }

    private createProgress() {
        const progressOptions: ProgressOptions = {
            location: ProgressLocation.Window,
            title: `[${
                this.isFirstTimeLoadingInterpreters ? Interpreters.discovering : Interpreters.refreshing
            }](command:${Commands.Set_Interpreter})`,
        };
        this.isFirstTimeLoadingInterpreters = false;
        this.shell.withProgress(progressOptions, () => {
            this.deferred = createDeferred();
            return this.deferred.promise;
        });
    }
}
