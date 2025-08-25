// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
/* eslint-disable class-methods-use-this */

import * as path from 'path';
import { Event, EventEmitter, Disposable, Uri } from 'vscode';
import { PythonEnvInfo, PythonEnvKind, PythonEnvType, PythonVersion } from '../pythonEnvironments/base/info';
import {
    GetRefreshEnvironmentsOptions,
    IDiscoveryAPI,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonLocatorQuery,
    TriggerRefreshOptions,
} from '../pythonEnvironments/base/locator';
import { PythonEnvCollectionChangedEvent } from '../pythonEnvironments/base/watcher';
import { getEnvExtApi } from './api.internal';
import { createDeferred, Deferred } from '../common/utils/async';
import { StopWatch } from '../common/utils/stopWatch';
import { traceLog } from '../logging';
import {
    DidChangeEnvironmentsEventArgs,
    EnvironmentChangeKind,
    PythonEnvironment,
    PythonEnvironmentApi,
} from './types';
import { FileChangeType } from '../common/platform/fileSystemWatcher';
import { Architecture, isWindows } from '../common/utils/platform';
import { parseVersion } from '../pythonEnvironments/base/info/pythonVersion';

function getKind(pythonEnv: PythonEnvironment): PythonEnvKind {
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('system')) {
        return PythonEnvKind.System;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('conda')) {
        return PythonEnvKind.Conda;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('venv')) {
        return PythonEnvKind.Venv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('virtualenv')) {
        return PythonEnvKind.VirtualEnv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('virtualenvwrapper')) {
        return PythonEnvKind.VirtualEnvWrapper;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('pyenv')) {
        return PythonEnvKind.Pyenv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('pipenv')) {
        return PythonEnvKind.Pipenv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('poetry')) {
        return PythonEnvKind.Poetry;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('pixi')) {
        return PythonEnvKind.Pixi;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('hatch')) {
        return PythonEnvKind.Hatch;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('uv')) {
        return PythonEnvKind.Uv;
    }
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('activestate')) {
        return PythonEnvKind.ActiveState;
    }

    return PythonEnvKind.Unknown;
}

function makeExecutablePath(prefix?: string): string {
    if (!prefix) {
        return process.platform === 'win32' ? 'python.exe' : 'python';
    }
    return process.platform === 'win32' ? path.join(prefix, 'python.exe') : path.join(prefix, 'python');
}

function getExecutable(pythonEnv: PythonEnvironment): string {
    if (pythonEnv.execInfo?.run?.executable) {
        return pythonEnv.execInfo?.run?.executable;
    }

    const basename = path.basename(pythonEnv.environmentPath.fsPath).toLowerCase();
    if (isWindows() && basename.startsWith('python') && basename.endsWith('.exe')) {
        return pythonEnv.environmentPath.fsPath;
    }

    if (!isWindows() && basename.startsWith('python')) {
        return pythonEnv.environmentPath.fsPath;
    }

    return makeExecutablePath(pythonEnv.sysPrefix);
}

function getLocation(pythonEnv: PythonEnvironment): string {
    if (pythonEnv.envId.managerId.toLowerCase().endsWith('conda')) {
        return pythonEnv.sysPrefix;
    }

    return pythonEnv.environmentPath.fsPath;
}

function getEnvType(kind: PythonEnvKind): PythonEnvType | undefined {
    switch (kind) {
        case PythonEnvKind.Uv:
        case PythonEnvKind.Poetry:
        case PythonEnvKind.Pyenv:
        case PythonEnvKind.VirtualEnv:
        case PythonEnvKind.Venv:
        case PythonEnvKind.VirtualEnvWrapper:
        case PythonEnvKind.OtherVirtual:
        case PythonEnvKind.Pipenv:
        case PythonEnvKind.ActiveState:
        case PythonEnvKind.Hatch:
        case PythonEnvKind.Pixi:
            return PythonEnvType.Virtual;

        case PythonEnvKind.Conda:
            return PythonEnvType.Conda;

        case PythonEnvKind.System:
        case PythonEnvKind.Unknown:
        case PythonEnvKind.OtherGlobal:
        case PythonEnvKind.Custom:
        case PythonEnvKind.MicrosoftStore:
        default:
            return undefined;
    }
}

function toPythonEnvInfo(pythonEnv: PythonEnvironment): PythonEnvInfo | undefined {
    const kind = getKind(pythonEnv);
    const arch = Architecture.x64;
    const version: PythonVersion = parseVersion(pythonEnv.version);
    const { name, displayName, sysPrefix } = pythonEnv;
    const executable = getExecutable(pythonEnv);
    const location = getLocation(pythonEnv);

    return {
        name,
        location,
        kind,
        id: executable,
        executable: {
            filename: executable,
            sysPrefix,
            ctime: -1,
            mtime: -1,
        },
        version: {
            sysVersion: pythonEnv.version,
            major: version.major,
            minor: version.minor,
            micro: version.micro,
        },
        arch,
        distro: {
            org: '',
        },
        source: [],
        detailedDisplayName: displayName,
        display: displayName,
        type: getEnvType(kind),
    };
}

function hasChanged(old: PythonEnvInfo, newEnv: PythonEnvInfo): boolean {
    if (old.executable.filename !== newEnv.executable.filename) {
        return true;
    }
    if (old.version.major !== newEnv.version.major) {
        return true;
    }
    if (old.version.minor !== newEnv.version.minor) {
        return true;
    }
    if (old.version.micro !== newEnv.version.micro) {
        return true;
    }
    if (old.location !== newEnv.location) {
        return true;
    }
    if (old.kind !== newEnv.kind) {
        return true;
    }
    if (old.arch !== newEnv.arch) {
        return true;
    }

    return false;
}

class EnvExtApis implements IDiscoveryAPI, Disposable {
    private _onProgress: EventEmitter<ProgressNotificationEvent>;

    private _onChanged: EventEmitter<PythonEnvCollectionChangedEvent>;

    private _refreshPromise?: Deferred<void>;

    private _envs: PythonEnvInfo[] = [];

    refreshState: ProgressReportStage;

    private _disposables: Disposable[] = [];

    constructor(private envExtApi: PythonEnvironmentApi) {
        this._onProgress = new EventEmitter<ProgressNotificationEvent>();
        this._onChanged = new EventEmitter<PythonEnvCollectionChangedEvent>();

        this.onProgress = this._onProgress.event;
        this.onChanged = this._onChanged.event;

        this.refreshState = ProgressReportStage.idle;
        this._disposables.push(
            this._onProgress,
            this._onChanged,
            this.envExtApi.onDidChangeEnvironments((e) => this.onDidChangeEnvironments(e)),
            this.envExtApi.onDidChangeEnvironment((e) => {
                this._onChanged.fire({
                    type: FileChangeType.Changed,
                    searchLocation: e.uri,
                    old: e.old ? toPythonEnvInfo(e.old) : undefined,
                    new: e.new ? toPythonEnvInfo(e.new) : undefined,
                });
            }),
        );
    }

    onProgress: Event<ProgressNotificationEvent>;

    onChanged: Event<PythonEnvCollectionChangedEvent>;

    getRefreshPromise(_options?: GetRefreshEnvironmentsOptions): Promise<void> | undefined {
        return this._refreshPromise?.promise;
    }

    triggerRefresh(_query?: PythonLocatorQuery, _options?: TriggerRefreshOptions): Promise<void> {
        const stopwatch = new StopWatch();
        traceLog('Native locator: Refresh started');
        if (this.refreshState === ProgressReportStage.discoveryStarted && this._refreshPromise?.promise) {
            return this._refreshPromise?.promise;
        }

        this.refreshState = ProgressReportStage.discoveryStarted;
        this._onProgress.fire({ stage: this.refreshState });
        this._refreshPromise = createDeferred();

        setImmediate(async () => {
            try {
                await this.envExtApi.refreshEnvironments(undefined);
                this._refreshPromise?.resolve();
            } catch (error) {
                this._refreshPromise?.reject(error);
            } finally {
                traceLog(`Native locator: Refresh finished in ${stopwatch.elapsedTime} ms`);
                this.refreshState = ProgressReportStage.discoveryFinished;
                this._refreshPromise = undefined;
                this._onProgress.fire({ stage: this.refreshState });
            }
        });

        return this._refreshPromise?.promise;
    }

    getEnvs(_query?: PythonLocatorQuery): PythonEnvInfo[] {
        return this._envs;
    }

    private addEnv(pythonEnv: PythonEnvironment, searchLocation?: Uri): PythonEnvInfo | undefined {
        const info = toPythonEnvInfo(pythonEnv);
        if (info) {
            const old = this._envs.find((item) => item.executable.filename === info.executable.filename);
            if (old) {
                this._envs = this._envs.filter((item) => item.executable.filename !== info.executable.filename);
                this._envs.push(info);
                if (hasChanged(old, info)) {
                    this._onChanged.fire({ type: FileChangeType.Changed, old, new: info, searchLocation });
                }
            } else {
                this._envs.push(info);
                this._onChanged.fire({ type: FileChangeType.Created, new: info, searchLocation });
            }
        }

        return info;
    }

    private removeEnv(env: PythonEnvInfo | string): void {
        if (typeof env === 'string') {
            const old = this._envs.find((item) => item.executable.filename === env);
            this._envs = this._envs.filter((item) => item.executable.filename !== env);
            this._onChanged.fire({ type: FileChangeType.Deleted, old });
            return;
        }
        this._envs = this._envs.filter((item) => item.executable.filename !== env.executable.filename);
        this._onChanged.fire({ type: FileChangeType.Deleted, old: env });
    }

    async resolveEnv(envPath?: string): Promise<PythonEnvInfo | undefined> {
        if (envPath === undefined) {
            return undefined;
        }
        const pythonEnv = await this.envExtApi.resolveEnvironment(Uri.file(envPath));
        if (pythonEnv) {
            return this.addEnv(pythonEnv);
        }
        return undefined;
    }

    dispose(): void {
        this._disposables.forEach((d) => d.dispose());
    }

    onDidChangeEnvironments(e: DidChangeEnvironmentsEventArgs): void {
        e.forEach((item) => {
            if (item.kind === EnvironmentChangeKind.remove) {
                this.removeEnv(item.environment.environmentPath.fsPath);
            }
            if (item.kind === EnvironmentChangeKind.add) {
                this.addEnv(item.environment);
            }
        });
    }
}

export async function createEnvExtApi(disposables: Disposable[]): Promise<EnvExtApis> {
    const api = new EnvExtApis(await getEnvExtApi());
    disposables.push(api);
    return api;
}
