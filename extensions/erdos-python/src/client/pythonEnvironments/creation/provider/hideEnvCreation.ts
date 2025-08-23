// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Disposable } from 'vscode';

const envCreationTracker: Disposable[] = [];

export function hideEnvCreation(): Disposable {
    const disposable = new Disposable(() => {
        const index = envCreationTracker.indexOf(disposable);
        if (index > -1) {
            envCreationTracker.splice(index, 1);
        }
    });
    envCreationTracker.push(disposable);
    return disposable;
}

export function shouldDisplayEnvCreationProgress(): boolean {
    return envCreationTracker.length === 0;
}
