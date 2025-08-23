// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { Disposable, Event, EventEmitter, Uri, WorkspaceFoldersChangeEvent } from 'vscode';
import { PythonEnvInfo, PythonEnvKind, PythonEnvType, PythonVersion } from './base/info';
import {
    GetRefreshEnvironmentsOptions,
    IDiscoveryAPI,
    ProgressNotificationEvent,
    ProgressReportStage,
    PythonLocatorQuery,
    TriggerRefreshOptions,
} from './base/locator';
import { PythonEnvCollectionChangedEvent } from './base/watcher';
import {
    isNativeEnvInfo,
    NativeEnvInfo,
    NativeEnvManagerInfo,
    NativePythonFinder,
} from './base/locators/common/nativePythonFinder';
import { createDeferred, Deferred } from '../common/utils/async';
import { Architecture, getPathEnvVariable, getUserHomeDir } from '../common/utils/platform';
import { parseVersion } from './base/info/pythonVersion';
import { cache } from '../common/utils/decorators';
import { traceError, traceInfo, traceLog, traceWarn } from '../logging';
import { StopWatch } from '../common/utils/stopWatch';
import { FileChangeType } from '../common/platform/fileSystemWatcher';
import { categoryToKind, NativePythonEnvironmentKind } from './base/locators/common/nativePythonUtils';
import { getCondaEnvDirs, getCondaPathSetting, setCondaBinary } from './common/environmentManagers/conda';
import { setPyEnvBinary } from './common/environmentManagers/pyenv';
import {
    createPythonWatcher,
    PythonGlobalEnvEvent,
    PythonWorkspaceEnvEvent,
} from './base/locators/common/pythonWatcher';
import { getWorkspaceFolders, onDidChangeWorkspaceFolders } from '../common/vscodeApis/workspaceApis';

function makeExecutablePath(prefix?: string): string {
    if (!prefix) {
        return process.platform === 'win32' ? 'python.exe' : 'python';
    }
    return process.platform === 'win32' ? path.join(prefix, 'python.exe') : path.join(prefix, 'python');
}

function toArch(a: string | undefined): Architecture {
    switch (a) {
        case 'x86':
            return Architecture.x86;
        case 'x64':
            return Architecture.x64;
        default:
            return Architecture.Unknown;
    }
}

function getLocation(nativeEnv: NativeEnvInfo, executable: string): string {
    if (nativeEnv.kind === NativePythonEnvironmentKind.Conda) {
        return nativeEnv.prefix ?? path.dirname(executable);
    }

    if (nativeEnv.executable) {
        return nativeEnv.executable;
    }

    if (nativeEnv.prefix) {
        return nativeEnv.prefix;
    }

    // This is a path to a generated executable. Needed for backwards compatibility.
    return executable;
}

function kindToShortString(kind: PythonEnvKind): string | undefined {
    switch (kind) {
        case PythonEnvKind.Poetry:
            return 'poetry';
        case PythonEnvKind.Pyenv:
            return 'pyenv';
        case PythonEnvKind.VirtualEnv:
        case PythonEnvKind.Venv:
        case PythonEnvKind.VirtualEnvWrapper:
        case PythonEnvKind.OtherVirtual:
            return 'venv';
        case PythonEnvKind.Pipenv:
            return 'pipenv';
        case PythonEnvKind.Conda:
            return 'conda';
        case PythonEnvKind.ActiveState:
            return 'active-state';
        case PythonEnvKind.MicrosoftStore:
            return 'Microsoft Store';
        case PythonEnvKind.Hatch:
            return 'hatch';
        case PythonEnvKind.Pixi:
            return 'pixi';
        case PythonEnvKind.System:
        case PythonEnvKind.Unknown:
        case PythonEnvKind.OtherGlobal:
        case PythonEnvKind.Custom:
        default:
            return undefined;
    }
}

function toShortVersionString(version: PythonVersion): string {
    return `${version.major}.${version.minor}.${version.micro}`.trim();
}

function getDisplayName(version: PythonVersion, kind: PythonEnvKind, arch: Architecture, name?: string): string {
    const versionStr = toShortVersionString(version);
    const kindStr = kindToShortString(kind);
    if (arch === Architecture.x86) {
        if (kindStr) {
            return name ? `Python ${versionStr} 32-bit (${name})` : `Python ${versionStr} 32-bit (${kindStr})`;
        }
        return name ? `Python ${versionStr} 32-bit (${name})` : `Python ${versionStr} 32-bit`;
    }
    if (kindStr) {
        return name ? `Python ${versionStr} (${name})` : `Python ${versionStr} (${kindStr})`;
    }
    return name ? `Python ${versionStr} (${name})` : `Python ${versionStr}`;
}

function validEnv(nativeEnv: NativeEnvInfo): boolean {
    if (nativeEnv.prefix === undefined && nativeEnv.executable === undefined) {
        traceError(`Invalid environment [native]: ${JSON.stringify(nativeEnv)}`);
        return false;
    }
    return true;
}

function getEnvType(kind: PythonEnvKind): PythonEnvType | undefined {
    switch (kind) {
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

function isSubDir(pathToCheck: string | undefined, parents: string[]): boolean {
    return parents.some((prefix) => {
        if (pathToCheck) {
            return path.normalize(pathToCheck).startsWith(path.normalize(prefix));
        }
        return false;
    });
}

function foundOnPath(fsPath: string): boolean {
    const paths = getPathEnvVariable().map((p) => path.normalize(p).toLowerCase());
    const normalized = path.normalize(fsPath).toLowerCase();
    return paths.some((p) => normalized.includes(p));
}

function getName(nativeEnv: NativeEnvInfo, kind: PythonEnvKind, condaEnvDirs: string[]): string {
    if (nativeEnv.name) {
        return nativeEnv.name;
    }

    const envType = getEnvType(kind);
    if (nativeEnv.prefix && envType === PythonEnvType.Virtual) {
        return path.basename(nativeEnv.prefix);
    }

    if (nativeEnv.prefix && envType === PythonEnvType.Conda) {
        if (nativeEnv.name === 'base') {
            return 'base';
        }

        const workspaces = (getWorkspaceFolders() ?? []).map((wf) => wf.uri.fsPath);
        if (isSubDir(nativeEnv.prefix, workspaces)) {
            traceInfo(`Conda env is --prefix environment: ${nativeEnv.prefix}`);
            return '';
        }

        if (condaEnvDirs.length > 0 && isSubDir(nativeEnv.prefix, condaEnvDirs)) {
            traceInfo(`Conda env is --named environment: ${nativeEnv.prefix}`);
            return path.basename(nativeEnv.prefix);
        }
    }

    return '';
}

function toPythonEnvInfo(nativeEnv: NativeEnvInfo, condaEnvDirs: string[]): PythonEnvInfo | undefined {
    if (!validEnv(nativeEnv)) {
        return undefined;
    }
    const kind = categoryToKind(nativeEnv.kind);
    const arch = toArch(nativeEnv.arch);
    const version: PythonVersion = parseVersion(nativeEnv.version ?? '');
    const name = getName(nativeEnv, kind, condaEnvDirs);
    const displayName = nativeEnv.version
        ? getDisplayName(version, kind, arch, name)
        : nativeEnv.displayName ?? 'Python';

    const executable = nativeEnv.executable ?? makeExecutablePath(nativeEnv.prefix);
    return {
        name,
        location: getLocation(nativeEnv, executable),
        kind,
        id: executable,
        executable: {
            filename: executable,
            sysPrefix: nativeEnv.prefix ?? '',
            ctime: -1,
            mtime: -1,
        },
        version: {
            sysVersion: nativeEnv.version,
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
    if (old.name !== newEnv.name) {
        return true;
    }
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

class NativePythonEnvironments implements IDiscoveryAPI, Disposable {
    private _onProgress: EventEmitter<ProgressNotificationEvent>;

    private _onChanged: EventEmitter<PythonEnvCollectionChangedEvent>;

    private _refreshPromise?: Deferred<void>;

    private _envs: PythonEnvInfo[] = [];

    private _disposables: Disposable[] = [];

    private _condaEnvDirs: string[] = [];

    constructor(private readonly finder: NativePythonFinder) {
        this._onProgress = new EventEmitter<ProgressNotificationEvent>();
        this._onChanged = new EventEmitter<PythonEnvCollectionChangedEvent>();

        this.onProgress = this._onProgress.event;
        this.onChanged = this._onChanged.event;

        this.refreshState = ProgressReportStage.idle;
        this._disposables.push(this._onProgress, this._onChanged);

        this.initializeWatcher();
    }

    dispose(): void {
        this._disposables.forEach((d) => d.dispose());
    }

    refreshState: ProgressReportStage;

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
                const before = this._envs.map((env) => env.executable.filename);
                const after: string[] = [];
                for await (const native of this.finder.refresh()) {
                    const exe = this.processNative(native);
                    if (exe) {
                        after.push(exe);
                    }
                }
                const envsToRemove = before.filter((item) => !after.includes(item));
                envsToRemove.forEach((item) => this.removeEnv(item));
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

    private processNative(native: NativeEnvInfo | NativeEnvManagerInfo): string | undefined {
        if (isNativeEnvInfo(native)) {
            return this.processEnv(native);
        }
        this.processEnvManager(native);

        return undefined;
    }

    private processEnv(native: NativeEnvInfo): string | undefined {
        if (!validEnv(native)) {
            return undefined;
        }

        try {
            const version = native.version ? parseVersion(native.version) : undefined;

            if (categoryToKind(native.kind) === PythonEnvKind.Conda && !native.executable) {
                // This is a conda env without python, no point trying to resolve this.
                // There is nothing to resolve
                return this.addEnv(native)?.executable.filename;
            }
            if (native.executable && (!version || version.major < 0 || version.minor < 0 || version.micro < 0)) {
                // We have a path, but no version info, try to resolve the environment.
                this.finder
                    .resolve(native.executable)
                    .then((env) => {
                        if (env) {
                            this.addEnv(env);
                        }
                    })
                    .ignoreErrors();
                return native.executable;
            }
            if (native.executable && version && version.major >= 0 && version.minor >= 0 && version.micro >= 0) {
                return this.addEnv(native)?.executable.filename;
            }
            traceError(`Failed to process environment: ${JSON.stringify(native)}`);
        } catch (err) {
            traceError(`Failed to process environment: ${err}`);
        }
        return undefined;
    }

    private condaPathAlreadySet: string | undefined;

    // eslint-disable-next-line class-methods-use-this
    private processEnvManager(native: NativeEnvManagerInfo) {
        const tool = native.tool.toLowerCase();
        switch (tool) {
            case 'conda':
                {
                    traceLog(`Conda environment manager found at: ${native.executable}`);
                    const settingPath = getCondaPathSetting();
                    if (!this.condaPathAlreadySet) {
                        if (settingPath === '' || settingPath === undefined) {
                            if (foundOnPath(native.executable)) {
                                setCondaBinary(native.executable);
                                this.condaPathAlreadySet = native.executable;
                                traceInfo(`Using conda: ${native.executable}`);
                            } else {
                                traceInfo(`Conda not found on PATH, skipping: ${native.executable}`);
                                traceInfo(
                                    'You can set the path to conda using the setting: `python.condaPath` if you want to use a different conda binary',
                                );
                            }
                        } else {
                            traceInfo(`Using conda from setting: ${settingPath}`);
                            this.condaPathAlreadySet = settingPath;
                        }
                    } else {
                        traceInfo(`Conda set to: ${this.condaPathAlreadySet}`);
                    }
                }
                break;
            case 'pyenv':
                traceLog(`Pyenv environment manager found at: ${native.executable}`);
                setPyEnvBinary(native.executable);
                break;
            case 'poetry':
                traceLog(`Poetry environment manager found at: ${native.executable}`);
                break;
            default:
                traceWarn(`Unknown environment manager: ${native.tool}`);
                break;
        }
    }

    getEnvs(_query?: PythonLocatorQuery): PythonEnvInfo[] {
        return this._envs;
    }

    private addEnv(native: NativeEnvInfo, searchLocation?: Uri): PythonEnvInfo | undefined {
        const info = toPythonEnvInfo(native, this._condaEnvDirs);
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

    @cache(30_000, true)
    async resolveEnv(envPath?: string): Promise<PythonEnvInfo | undefined> {
        if (envPath === undefined) {
            return undefined;
        }
        try {
            const native = await this.finder.resolve(envPath);
            if (native) {
                if (native.kind === NativePythonEnvironmentKind.Conda && this._condaEnvDirs.length === 0) {
                    this._condaEnvDirs = (await getCondaEnvDirs()) ?? [];
                }
                return this.addEnv(native);
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    private initializeWatcher(): void {
        const watcher = createPythonWatcher();
        this._disposables.push(
            watcher.onDidGlobalEnvChanged((e) => this.pathEventHandler(e)),
            watcher.onDidWorkspaceEnvChanged(async (e) => {
                await this.workspaceEventHandler(e);
            }),
            onDidChangeWorkspaceFolders((e: WorkspaceFoldersChangeEvent) => {
                e.removed.forEach((wf) => watcher.unwatchWorkspace(wf));
                e.added.forEach((wf) => watcher.watchWorkspace(wf));
            }),
            watcher,
        );

        getWorkspaceFolders()?.forEach((wf) => watcher.watchWorkspace(wf));
        const home = getUserHomeDir();
        if (home) {
            watcher.watchPath(Uri.file(path.join(home, '.conda', 'environments.txt')));
        }
    }

    private async pathEventHandler(e: PythonGlobalEnvEvent): Promise<void> {
        if (e.type === FileChangeType.Created || e.type === FileChangeType.Changed) {
            if (e.uri.fsPath.endsWith('environment.txt')) {
                const before = this._envs
                    .filter((env) => env.kind === PythonEnvKind.Conda)
                    .map((env) => env.executable.filename);
                for await (const native of this.finder.refresh(NativePythonEnvironmentKind.Conda)) {
                    this.processNative(native);
                }
                const after = this._envs
                    .filter((env) => env.kind === PythonEnvKind.Conda)
                    .map((env) => env.executable.filename);
                const envsToRemove = before.filter((item) => !after.includes(item));
                envsToRemove.forEach((item) => this.removeEnv(item));
            }
        }
    }

    private async workspaceEventHandler(e: PythonWorkspaceEnvEvent): Promise<void> {
        if (e.type === FileChangeType.Created || e.type === FileChangeType.Changed) {
            const native = await this.finder.resolve(e.executable);
            if (native) {
                this.addEnv(native, e.workspaceFolder.uri);
            }
        } else {
            this.removeEnv(e.executable);
        }
    }
}

export function createNativeEnvironmentsApi(finder: NativePythonFinder): IDiscoveryAPI & Disposable {
    const native = new NativePythonEnvironments(finder);
    native.triggerRefresh().ignoreErrors();
    return native;
}
