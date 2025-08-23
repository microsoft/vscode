// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Event, EventEmitter, Uri } from 'vscode';
import { FileChangeType } from '../../common/platform/fileSystemWatcher';
import { PythonEnvInfo, PythonEnvKind } from './info';

// The use cases for `BasicPythonEnvsChangedEvent` are currently
// hypothetical.  However, there's a real chance they may prove
// useful for the concrete low-level locators.  So for now we are
// keeping the separate "basic" type.

/**
 * The most basic info for a Python environments event.
 *
 * @prop kind - the env kind, if any, affected by the event
 */
export type BasicPythonEnvsChangedEvent = {
    kind?: PythonEnvKind;
    type?: FileChangeType;
};

/**
 * The full set of possible info for a Python environments event.
 */
export type PythonEnvsChangedEvent = BasicPythonEnvsChangedEvent & {
    /**
     * The location, if any, affected by the event.
     */
    searchLocation?: Uri;
    /**
     * A specific provider, if any, affected by the event.
     */
    providerId?: string;
    /**
     * The env, if any, affected by the event.
     */
    envPath?: string;
};

export type PythonEnvCollectionChangedEvent = BasicPythonEnvCollectionChangedEvent & {
    type?: FileChangeType;
    searchLocation?: Uri;
};

export type BasicPythonEnvCollectionChangedEvent = {
    old?: PythonEnvInfo;
    new?: PythonEnvInfo | undefined;
};

/**
 * A "watcher" for events related to changes to Python environemts.
 *
 * The watcher will notify listeners (callbacks registered through
 * `onChanged`) of events at undetermined times.  The actual emitted
 * events, their source, and the timing is entirely up to the watcher
 * implementation.
 */
export interface IPythonEnvsWatcher<E = PythonEnvsChangedEvent> {
    /**
     * The hook for registering event listeners (callbacks).
     */
    readonly onChanged: Event<E>;
}

/**
 * This provides the fundamental functionality of a Python envs watcher.
 *
 * Consumers register listeners (callbacks) using `onChanged`.  Each
 * listener is invoked when `fire()` is called.
 *
 * Note that in most cases classes will not inherit from this class,
 * but instead keep a private watcher property.  The rule of thumb
 * is to follow whether or not consumers of *that* class should be able
 * to trigger events (via `fire()`).
 *
 * Also, in most cases the default event type (`PythonEnvsChangedEvent`)
 * should be used.  Only in low-level cases should you consider using
 * `BasicPythonEnvsChangedEvent`.
 */
export class PythonEnvsWatcher<T = PythonEnvsChangedEvent> implements IPythonEnvsWatcher<T> {
    /**
     * The hook for registering event listeners (callbacks).
     */
    public readonly onChanged: Event<T>;

    private readonly didChange = new EventEmitter<T>();

    constructor() {
        this.onChanged = this.didChange.event;
    }

    /**
     * Send the event to all registered listeners.
     */
    public fire(event: T): void {
        this.didChange.fire(event);
    }
}
