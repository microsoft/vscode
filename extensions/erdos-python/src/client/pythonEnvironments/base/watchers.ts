// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Event } from 'vscode';
import { IDisposable } from '../../common/types';
import { Disposables } from '../../common/utils/resourceLifecycle';
import { IPythonEnvsWatcher, PythonEnvsChangedEvent, PythonEnvsWatcher } from './watcher';

/**
 * A wrapper around a set of watchers, exposing them as a single watcher.
 *
 * If any of the wrapped watchers emits an event then this wrapper
 * emits that event.
 */
export class PythonEnvsWatchers implements IPythonEnvsWatcher, IDisposable {
    public readonly onChanged: Event<PythonEnvsChangedEvent>;

    private readonly watcher = new PythonEnvsWatcher();

    private readonly disposables = new Disposables();

    constructor(watchers: ReadonlyArray<IPythonEnvsWatcher>) {
        this.onChanged = this.watcher.onChanged;
        watchers.forEach((w) => {
            const disposable = w.onChanged((e) => this.watcher.fire(e));
            this.disposables.push(disposable);
        });
    }

    public async dispose(): Promise<void> {
        await this.disposables.dispose();
    }
}
