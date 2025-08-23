// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Uri } from 'vscode';
import { createDeferred } from '../../common/utils/async';
import { getURIFilter } from '../../common/utils/misc';
import { traceVerbose } from '../../logging';
import { PythonEnvInfo } from './info';
import {
    IPythonEnvsIterator,
    isProgressEvent,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonEnvUpdatedEvent,
    PythonLocatorQuery,
} from './locator';

/**
 * Create a filter function to match the given query.
 */
export function getQueryFilter(query: PythonLocatorQuery): (env: PythonEnvInfo) => boolean {
    const kinds = query.kinds !== undefined && query.kinds.length > 0 ? query.kinds : undefined;
    const includeNonRooted = !query.searchLocations?.doNotIncludeNonRooted; // We default to `true`.
    const locationFilters = getSearchLocationFilters(query);
    function checkKind(env: PythonEnvInfo): boolean {
        if (kinds === undefined) {
            return true;
        }
        return kinds.includes(env.kind);
    }
    function checkSearchLocation(env: PythonEnvInfo): boolean {
        if (env.searchLocation === undefined) {
            // It is not a "rooted" env.
            return includeNonRooted;
        }
        // It is a "rooted" env.
        const loc = env.searchLocation;
        if (locationFilters !== undefined) {
            // Check against the requested roots.  (There may be none.)
            return locationFilters.some((filter) => filter(loc));
        }
        return true;
    }
    return (env) => {
        if (!checkKind(env)) {
            return false;
        }
        if (!checkSearchLocation(env)) {
            return false;
        }
        return true;
    };
}

function getSearchLocationFilters(query: PythonLocatorQuery): ((u: Uri) => boolean)[] | undefined {
    if (query.searchLocations === undefined) {
        return undefined;
    }
    if (query.searchLocations.roots.length === 0) {
        return [];
    }
    return query.searchLocations.roots.map((loc) =>
        getURIFilter(loc, {
            checkParent: true,
        }),
    );
}

/**
 * Unroll the given iterator into an array.
 *
 * This includes applying any received updates.
 */
export async function getEnvs<I = PythonEnvInfo>(iterator: IPythonEnvsIterator<I>): Promise<I[]> {
    const envs: (I | undefined)[] = [];

    const updatesDone = createDeferred<void>();
    if (iterator.onUpdated === undefined) {
        updatesDone.resolve();
    } else {
        const listener = iterator.onUpdated((event: PythonEnvUpdatedEvent<I> | ProgressNotificationEvent) => {
            if (isProgressEvent(event)) {
                if (event.stage !== ProgressReportStage.discoveryFinished) {
                    return;
                }
                updatesDone.resolve();
                listener.dispose();
            } else if (event.index !== undefined) {
                const { index, update } = event;
                if (envs[index] === undefined) {
                    const json = JSON.stringify(update);
                    traceVerbose(
                        `Updates sent for an env which was classified as invalid earlier, currently not expected, ${json}`,
                    );
                }
                // We don't worry about if envs[index] is set already.
                envs[index] = update;
            }
        });
    }

    let itemIndex = 0;
    for await (const env of iterator) {
        // We can't just push because updates might get emitted early.
        if (envs[itemIndex] === undefined) {
            envs[itemIndex] = env;
        }
        itemIndex += 1;
    }
    await updatesDone.promise;

    // Do not return invalid environments
    return envs.filter((e) => e !== undefined).map((e) => e!);
}
