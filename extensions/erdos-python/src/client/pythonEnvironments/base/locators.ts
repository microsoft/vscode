// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { chain } from '../../common/utils/async';
import { Disposables } from '../../common/utils/resourceLifecycle';
import { PythonEnvInfo } from './info';
import {
    ICompositeLocator,
    ILocator,
    IPythonEnvsIterator,
    isProgressEvent,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonEnvUpdatedEvent,
    PythonLocatorQuery,
} from './locator';
import { PythonEnvsWatchers } from './watchers';

/**
 * Combine the `onUpdated` event of the given iterators into a single event.
 */
export function combineIterators<I>(iterators: IPythonEnvsIterator<I>[]): IPythonEnvsIterator<I> {
    const result: IPythonEnvsIterator<I> = chain(iterators);
    const events = iterators.map((it) => it.onUpdated).filter((v) => v);
    if (!events || events.length === 0) {
        // There are no sub-events, so we leave `onUpdated` undefined.
        return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.onUpdated = (handleEvent: (e: PythonEnvUpdatedEvent<I> | ProgressNotificationEvent) => any) => {
        const disposables = new Disposables();
        let numActive = events.length;
        events.forEach((event) => {
            const disposable = event!((e: PythonEnvUpdatedEvent<I> | ProgressNotificationEvent) => {
                // NOSONAR
                if (isProgressEvent(e)) {
                    if (e.stage === ProgressReportStage.discoveryFinished) {
                        numActive -= 1;
                        if (numActive === 0) {
                            // All the sub-events are done so we're done.
                            handleEvent({ stage: ProgressReportStage.discoveryFinished });
                        }
                    } else {
                        handleEvent({ stage: e.stage });
                    }
                } else {
                    handleEvent(e);
                }
            });
            disposables.push(disposable);
        });
        return disposables;
    };
    return result;
}

/**
 * A wrapper around a set of locators, exposing them as a single locator.
 *
 * Events and iterator results are combined.
 */
export class Locators<I = PythonEnvInfo> extends PythonEnvsWatchers implements ICompositeLocator<I> {
    public readonly providerId: string;

    constructor(
        // The locators will be watched as well as iterated.
        private readonly locators: ReadonlyArray<ILocator<I>>,
    ) {
        super(locators);
        this.providerId = locators.map((loc) => loc.providerId).join('+');
    }

    public iterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<I> {
        const iterators = this.locators.map((loc) => loc.iterEnvs(query));
        return combineIterators(iterators);
    }
}
