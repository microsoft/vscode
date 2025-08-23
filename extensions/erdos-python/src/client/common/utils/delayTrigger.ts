// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { clearTimeout, setTimeout } from 'timers';
import { Disposable } from 'vscode';
import { traceVerbose } from '../../logging';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface IDelayedTrigger {
    trigger(...args: any[]): void;
}

/**
 * DelayedTrigger can be used to prevent some action being called too
 * often within a given duration. This was added to support file watching
 * for tests. Suppose we are watching for *.py files. If the user installs
 * a new package or runs a formatter on the entire workspace. This could
 * trigger too many discover test calls which are expensive. We could
 * debounce, but the limitation with debounce is that it might run before
 * the package has finished installing. With delayed trigger approach
 * we delay running until @param ms amount of time has passed.
 */
export class DelayedTrigger implements IDelayedTrigger, Disposable {
    private timerId: NodeJS.Timeout | undefined;

    private triggeredCounter = 0;

    private calledCounter = 0;

    /**
     * Delay calling the function in callback for a predefined amount of time.
     * @param callback : Callback that should be called after some time has passed.
     * @param ms : Amount of time after the last trigger that the call to callback
     *             should be delayed.
     * @param name : A name for the callback action. This will be used in logs.
     */
    constructor(
        private readonly callback: (...args: any[]) => void,
        private readonly ms: number,
        private readonly name: string,
    ) {}

    public trigger(...args: unknown[]): void {
        this.triggeredCounter += 1;
        if (this.timerId) {
            clearTimeout(this.timerId);
        }

        this.timerId = setTimeout(() => {
            this.calledCounter += 1;
            traceVerbose(
                `Delay Trigger[${this.name}]: triggered=${this.triggeredCounter}, called=${this.calledCounter}`,
            );
            this.callback(...args);
        }, this.ms);
    }

    public dispose(): void {
        if (this.timerId) {
            clearTimeout(this.timerId);
        }
    }
}
