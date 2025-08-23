// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { cloneDeep, isEqual, uniq } from 'lodash';
import { Event, EventEmitter, Uri } from 'vscode';
import { traceVerbose } from '../../../../logging';
import { isParentPath } from '../../../common/externalDependencies';
import { PythonEnvKind } from '../../info';
import { areSameEnv } from '../../info/env';
import { getPrioritizedEnvKinds } from '../../info/envKind';
import {
    BasicEnvInfo,
    ICompositeLocator,
    ILocator,
    IPythonEnvsIterator,
    isProgressEvent,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonEnvUpdatedEvent,
    PythonLocatorQuery,
} from '../../locator';
import { PythonEnvsChangedEvent } from '../../watcher';

/**
 * Combines duplicate environments received from the incoming locator into one and passes on unique environments
 */
export class PythonEnvsReducer implements ICompositeLocator<BasicEnvInfo> {
    public get onChanged(): Event<PythonEnvsChangedEvent> {
        return this.parentLocator.onChanged;
    }

    constructor(private readonly parentLocator: ILocator<BasicEnvInfo>) {}

    public iterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<BasicEnvInfo> {
        const didUpdate = new EventEmitter<PythonEnvUpdatedEvent<BasicEnvInfo> | ProgressNotificationEvent>();
        const incomingIterator = this.parentLocator.iterEnvs(query);
        const iterator = iterEnvsIterator(incomingIterator, didUpdate);
        iterator.onUpdated = didUpdate.event;
        return iterator;
    }
}

async function* iterEnvsIterator(
    iterator: IPythonEnvsIterator<BasicEnvInfo>,
    didUpdate: EventEmitter<PythonEnvUpdatedEvent<BasicEnvInfo> | ProgressNotificationEvent>,
): IPythonEnvsIterator<BasicEnvInfo> {
    const state = {
        done: false,
        pending: 0,
    };
    const seen: BasicEnvInfo[] = [];

    if (iterator.onUpdated !== undefined) {
        const listener = iterator.onUpdated((event) => {
            if (isProgressEvent(event)) {
                if (event.stage === ProgressReportStage.discoveryFinished) {
                    state.done = true;
                    listener.dispose();
                } else {
                    didUpdate.fire(event);
                }
            } else if (event.update === undefined) {
                throw new Error(
                    'Unsupported behavior: `undefined` environment updates are not supported from downstream locators in reducer',
                );
            } else if (event.index !== undefined && seen[event.index] !== undefined) {
                const oldEnv = seen[event.index];
                seen[event.index] = event.update;
                didUpdate.fire({ index: event.index, old: oldEnv, update: event.update });
            } else {
                // This implies a problem in a downstream locator
                traceVerbose(`Expected already iterated env, got ${event.old} (#${event.index})`);
            }
            state.pending -= 1;
            checkIfFinishedAndNotify(state, didUpdate);
        });
    } else {
        didUpdate.fire({ stage: ProgressReportStage.discoveryStarted });
    }

    let result = await iterator.next();
    while (!result.done) {
        const currEnv = result.value;
        const oldIndex = seen.findIndex((s) => areSameEnv(s, currEnv));
        if (oldIndex !== -1) {
            resolveDifferencesInBackground(oldIndex, currEnv, state, didUpdate, seen).ignoreErrors();
        } else {
            // We haven't yielded a matching env so yield this one as-is.
            yield currEnv;
            seen.push(currEnv);
        }
        result = await iterator.next();
    }
    if (iterator.onUpdated === undefined) {
        state.done = true;
        checkIfFinishedAndNotify(state, didUpdate);
    }
}

async function resolveDifferencesInBackground(
    oldIndex: number,
    newEnv: BasicEnvInfo,
    state: { done: boolean; pending: number },
    didUpdate: EventEmitter<PythonEnvUpdatedEvent<BasicEnvInfo> | ProgressNotificationEvent>,
    seen: BasicEnvInfo[],
) {
    state.pending += 1;
    // It's essential we increment the pending call count before any asynchronus calls in this method.
    // We want this to be run even when `resolveInBackground` is called in background.
    const oldEnv = seen[oldIndex];
    const merged = resolveEnvCollision(oldEnv, newEnv);
    if (!isEqual(oldEnv, merged)) {
        seen[oldIndex] = merged;
        didUpdate.fire({ index: oldIndex, old: oldEnv, update: merged });
    }
    state.pending -= 1;
    checkIfFinishedAndNotify(state, didUpdate);
}

/**
 * When all info from incoming iterator has been received and all background calls finishes, notify that we're done
 * @param state Carries the current state of progress
 * @param didUpdate Used to notify when finished
 */
function checkIfFinishedAndNotify(
    state: { done: boolean; pending: number },
    didUpdate: EventEmitter<PythonEnvUpdatedEvent<BasicEnvInfo> | ProgressNotificationEvent>,
) {
    if (state.done && state.pending === 0) {
        didUpdate.fire({ stage: ProgressReportStage.discoveryFinished });
        didUpdate.dispose();
        traceVerbose(`Finished with environment reducer`);
    }
}

function resolveEnvCollision(oldEnv: BasicEnvInfo, newEnv: BasicEnvInfo): BasicEnvInfo {
    const [env] = sortEnvInfoByPriority(oldEnv, newEnv);
    const merged = cloneDeep(env);
    merged.source = uniq((oldEnv.source ?? []).concat(newEnv.source ?? []));
    merged.searchLocation = getMergedSearchLocation(oldEnv, newEnv);
    return merged;
}

function getMergedSearchLocation(oldEnv: BasicEnvInfo, newEnv: BasicEnvInfo): Uri | undefined {
    if (oldEnv.searchLocation && newEnv.searchLocation) {
        // Choose the deeper project path of the two, as that can be used to signify
        // that the environment is related to both the projects.
        if (isParentPath(oldEnv.searchLocation.fsPath, newEnv.searchLocation.fsPath)) {
            return oldEnv.searchLocation;
        }
        if (isParentPath(newEnv.searchLocation.fsPath, oldEnv.searchLocation.fsPath)) {
            return newEnv.searchLocation;
        }
    }
    return oldEnv.searchLocation ?? newEnv.searchLocation;
}

/**
 * Selects an environment based on the environment selection priority. This should
 * match the priority in the environment identifier.
 */
function sortEnvInfoByPriority(...envs: BasicEnvInfo[]): BasicEnvInfo[] {
    // TODO: When we consolidate the PythonEnvKind and EnvironmentType we should have
    // one location where we define priority.
    const envKindByPriority: PythonEnvKind[] = getPrioritizedEnvKinds();
    return envs.sort(
        (a: BasicEnvInfo, b: BasicEnvInfo) => envKindByPriority.indexOf(a.kind) - envKindByPriority.indexOf(b.kind),
    );
}
