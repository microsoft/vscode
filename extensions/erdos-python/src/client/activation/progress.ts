// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Progress, ProgressLocation, window } from 'vscode';
import { Disposable, LanguageClient } from 'vscode-languageclient/node';
import { createDeferred, Deferred } from '../common/utils/async';

export class ProgressReporting implements Disposable {
    private statusBarMessage: Disposable | undefined;
    private progress: Progress<{ message?: string; increment?: number }> | undefined;
    private progressDeferred: Deferred<void> | undefined;

    constructor(private readonly languageClient: LanguageClient) {
        this.languageClient.onNotification('python/setStatusBarMessage', (m: string) => {
            if (this.statusBarMessage) {
                this.statusBarMessage.dispose();
            }
            this.statusBarMessage = window.setStatusBarMessage(m);
        });

        this.languageClient.onNotification('python/beginProgress', (_) => {
            if (this.progressDeferred) {
                return;
            }
            this.beginProgress();
        });

        this.languageClient.onNotification('python/reportProgress', (m: string) => {
            if (!this.progress) {
                this.beginProgress();
            }
            this.progress!.report({ message: m }); // NOSONAR
        });

        this.languageClient.onNotification('python/endProgress', (_) => {
            if (this.progressDeferred) {
                this.progressDeferred.resolve();
                this.progressDeferred = undefined;
                this.progress = undefined;
            }
        });
    }

    public dispose() {
        if (this.statusBarMessage) {
            this.statusBarMessage.dispose();
        }
    }

    private beginProgress(): void {
        this.progressDeferred = createDeferred<void>();

        window.withProgress(
            {
                location: ProgressLocation.Window,
                title: '',
            },
            (progress) => {
                this.progress = progress;
                return this.progressDeferred!.promise;
            },
        );
    }
}
