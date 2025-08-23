// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { cloneDeep } from 'lodash';
import { Event, EventEmitter } from 'vscode';
import { isIdentifierRegistered, identifyEnvironment } from '../../../common/environmentIdentifier';
import { IEnvironmentInfoService } from '../../info/environmentInfoService';
import { PythonEnvInfo, PythonEnvKind } from '../../info';
import { getEnvPath, setEnvDisplayString } from '../../info/env';
import { InterpreterInformation } from '../../info/interpreter';
import {
    BasicEnvInfo,
    ICompositeLocator,
    IPythonEnvsIterator,
    IResolvingLocator,
    isProgressEvent,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonEnvUpdatedEvent,
    PythonLocatorQuery,
} from '../../locator';
import { PythonEnvsChangedEvent } from '../../watcher';
import { resolveBasicEnv } from './resolverUtils';
import { traceVerbose, traceWarn } from '../../../../logging';
import { getEnvironmentDirFromPath, getInterpreterPathFromDir, isPythonExecutable } from '../../../common/commonUtils';
import { getEmptyVersion } from '../../info/pythonVersion';

/**
 * Calls environment info service which runs `interpreterInfo.py` script on environments received
 * from the parent locator. Uses information received to populate environments further and pass it on.
 */
export class PythonEnvsResolver implements IResolvingLocator {
    public get onChanged(): Event<PythonEnvsChangedEvent> {
        return this.parentLocator.onChanged;
    }

    constructor(
        private readonly parentLocator: ICompositeLocator<BasicEnvInfo>,
        private readonly environmentInfoService: IEnvironmentInfoService,
    ) {
        this.parentLocator.onChanged((event) => {
            if (event.type && event.searchLocation !== undefined) {
                // We detect an environment changed, reset any stored info for it so it can be re-run.
                this.environmentInfoService.resetInfo(event.searchLocation);
            }
        });
    }

    public async resolveEnv(path: string): Promise<PythonEnvInfo | undefined> {
        const [executablePath, envPath] = await getExecutablePathAndEnvPath(path);
        path = executablePath.length ? executablePath : envPath;
        const kind = await identifyEnvironment(path);
        const environment = await resolveBasicEnv({ kind, executablePath, envPath });
        const info = await this.environmentInfoService.getEnvironmentInfo(environment);
        traceVerbose(
            `Environment resolver resolved ${path} for ${JSON.stringify(environment)} to ${JSON.stringify(info)}`,
        );
        if (!info) {
            return undefined;
        }
        return getResolvedEnv(info, environment);
    }

    public iterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator {
        const didUpdate = new EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>();
        const incomingIterator = this.parentLocator.iterEnvs(query);
        const iterator = this.iterEnvsIterator(incomingIterator, didUpdate);
        iterator.onUpdated = didUpdate.event;
        return iterator;
    }

    private async *iterEnvsIterator(
        iterator: IPythonEnvsIterator<BasicEnvInfo>,
        didUpdate: EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>,
    ): IPythonEnvsIterator {
        const environmentKinds = new Map<string, PythonEnvKind>();
        const state = {
            done: false,
            pending: 0,
        };
        const seen: PythonEnvInfo[] = [];

        if (iterator.onUpdated !== undefined) {
            const listener = iterator.onUpdated(async (event) => {
                state.pending += 1;
                if (isProgressEvent(event)) {
                    if (event.stage === ProgressReportStage.discoveryFinished) {
                        didUpdate.fire({ stage: ProgressReportStage.allPathsDiscovered });
                        state.done = true;
                        listener.dispose();
                    } else {
                        didUpdate.fire(event);
                    }
                } else if (event.update === undefined) {
                    throw new Error(
                        'Unsupported behavior: `undefined` environment updates are not supported from downstream locators in resolver',
                    );
                } else if (event.index !== undefined && seen[event.index] !== undefined) {
                    const old = seen[event.index];
                    await setKind(event.update, environmentKinds);
                    seen[event.index] = await resolveBasicEnv(event.update);
                    didUpdate.fire({ old, index: event.index, update: seen[event.index] });
                    this.resolveInBackground(event.index, state, didUpdate, seen).ignoreErrors();
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
            // Use cache from the current refresh where possible.
            await setKind(result.value, environmentKinds);
            const currEnv = await resolveBasicEnv(result.value);
            seen.push(currEnv);
            yield currEnv;
            this.resolveInBackground(seen.indexOf(currEnv), state, didUpdate, seen).ignoreErrors();
            result = await iterator.next();
        }
        if (iterator.onUpdated === undefined) {
            state.done = true;
            checkIfFinishedAndNotify(state, didUpdate);
        }
    }

    private async resolveInBackground(
        envIndex: number,
        state: { done: boolean; pending: number },
        didUpdate: EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>,
        seen: PythonEnvInfo[],
    ) {
        state.pending += 1;
        // It's essential we increment the pending call count before any asynchronus calls in this method.
        // We want this to be run even when `resolveInBackground` is called in background.
        const info = await this.environmentInfoService.getEnvironmentInfo(seen[envIndex]);
        const old = seen[envIndex];
        if (info) {
            const resolvedEnv = getResolvedEnv(info, seen[envIndex], old.identifiedUsingNativeLocator);
            seen[envIndex] = resolvedEnv;
            didUpdate.fire({ old, index: envIndex, update: resolvedEnv });
        } else {
            // Send update that the environment is not valid.
            didUpdate.fire({ old, index: envIndex, update: undefined });
        }
        state.pending -= 1;
        checkIfFinishedAndNotify(state, didUpdate);
    }
}

async function setKind(env: BasicEnvInfo, environmentKinds: Map<string, PythonEnvKind>) {
    const { path } = getEnvPath(env.executablePath, env.envPath);
    // For native locators, do not try to identify the environment kind.
    // its already set by the native locator & thats accurate.
    if (env.identifiedUsingNativeLocator) {
        environmentKinds.set(path, env.kind);
        return;
    }
    let kind = environmentKinds.get(path);
    if (!kind) {
        if (!isIdentifierRegistered(env.kind)) {
            // If identifier is not registered, skip setting env kind.
            return;
        }
        kind = await identifyEnvironment(path);
        environmentKinds.set(path, kind);
    }
    env.kind = kind;
}

/**
 * When all info from incoming iterator has been received and all background calls finishes, notify that we're done
 * @param state Carries the current state of progress
 * @param didUpdate Used to notify when finished
 */
function checkIfFinishedAndNotify(
    state: { done: boolean; pending: number },
    didUpdate: EventEmitter<PythonEnvUpdatedEvent | ProgressNotificationEvent>,
) {
    if (state.done && state.pending === 0) {
        didUpdate.fire({ stage: ProgressReportStage.discoveryFinished });
        didUpdate.dispose();
        traceVerbose(`Finished with environment resolver`);
    }
}

function getResolvedEnv(
    interpreterInfo: InterpreterInformation,
    environment: PythonEnvInfo,
    identifiedUsingNativeLocator = false,
) {
    // Deep copy into a new object
    const resolvedEnv = cloneDeep(environment);
    resolvedEnv.executable.sysPrefix = interpreterInfo.executable.sysPrefix;
    const isEnvLackingPython =
        getEnvPath(resolvedEnv.executable.filename, resolvedEnv.location).pathType === 'envFolderPath';
    // TODO: Shouldn't this only apply to conda, how else can we have an environment and not have Python in it?
    // If thats the case, then this should be gated on environment.kind === PythonEnvKind.Conda
    // For non-native do not blow away the versions returned by native locator.
    // Windows Store and Home brew have exe and sysprefix in different locations,
    // Thus above check is not valid for these envs.
    if (isEnvLackingPython && environment.kind !== PythonEnvKind.MicrosoftStore && !identifiedUsingNativeLocator) {
        // Install python later into these envs might change the version, which can be confusing for users.
        // So avoid displaying any version until it is installed.
        resolvedEnv.version = getEmptyVersion();
    } else {
        resolvedEnv.version = interpreterInfo.version;
    }
    resolvedEnv.arch = interpreterInfo.arch;
    // Display name should be set after all the properties as we need other properties to build display name.
    setEnvDisplayString(resolvedEnv);
    return resolvedEnv;
}

async function getExecutablePathAndEnvPath(path: string) {
    let executablePath: string;
    let envPath: string;
    const isPathAnExecutable = await isPythonExecutable(path).catch((ex) => {
        traceWarn('Failed to check if', path, 'is an executable', ex);
        // This could happen if the path doesn't exist on a file system, but
        // it still maybe the case that it's a valid file when run using a
        // shell, as shells may resolve the file extensions before running it,
        // so assume it to be an executable.
        return true;
    });
    if (isPathAnExecutable) {
        executablePath = path;
        envPath = getEnvironmentDirFromPath(executablePath);
    } else {
        envPath = path;
        executablePath = (await getInterpreterPathFromDir(envPath)) ?? '';
    }
    return [executablePath, envPath];
}
