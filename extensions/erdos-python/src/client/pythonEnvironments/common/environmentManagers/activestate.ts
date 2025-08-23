// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as path from 'path';
import { dirname } from 'path';
import {
    arePathsSame,
    getPythonSetting,
    onDidChangePythonSetting,
    pathExists,
    shellExecute,
} from '../externalDependencies';
import { cache } from '../../../common/utils/decorators';
import { traceError, traceVerbose } from '../../../logging';
import { getOSType, getUserHomeDir, OSType } from '../../../common/utils/platform';

export const ACTIVESTATETOOLPATH_SETTING_KEY = 'activeStateToolPath';

const STATE_GENERAL_TIMEOUT = 5000;

export type ProjectInfo = {
    name: string;
    organization: string;
    local_checkouts: string[]; // eslint-disable-line camelcase
    executables: string[];
};

export async function isActiveStateEnvironment(interpreterPath: string): Promise<boolean> {
    const execDir = path.dirname(interpreterPath);
    const runtimeDir = path.dirname(execDir);
    return pathExists(path.join(runtimeDir, '_runtime_store'));
}

export class ActiveState {
    private static statePromise: Promise<ActiveState | undefined> | undefined;

    public static async getState(): Promise<ActiveState | undefined> {
        if (ActiveState.statePromise === undefined) {
            ActiveState.statePromise = ActiveState.locate();
        }
        return ActiveState.statePromise;
    }

    constructor() {
        onDidChangePythonSetting(ACTIVESTATETOOLPATH_SETTING_KEY, () => {
            ActiveState.statePromise = undefined;
        });
    }

    public static getStateToolDir(): string | undefined {
        const home = getUserHomeDir();
        if (!home) {
            return undefined;
        }
        return getOSType() === OSType.Windows
            ? path.join(home, 'AppData', 'Local', 'ActiveState', 'StateTool')
            : path.join(home, '.local', 'ActiveState', 'StateTool');
    }

    private static async locate(): Promise<ActiveState | undefined> {
        const stateToolDir = this.getStateToolDir();
        const stateCommand =
            getPythonSetting<string>(ACTIVESTATETOOLPATH_SETTING_KEY) ?? ActiveState.defaultStateCommand;
        if (stateToolDir && ((await pathExists(stateToolDir)) || stateCommand !== this.defaultStateCommand)) {
            return new ActiveState();
        }
        return undefined;
    }

    public async getProjects(): Promise<ProjectInfo[] | undefined> {
        return this.getProjectsCached();
    }

    private static readonly defaultStateCommand: string = 'state';

    // eslint-disable-next-line class-methods-use-this
    @cache(30_000, true, 10_000)
    private async getProjectsCached(): Promise<ProjectInfo[] | undefined> {
        try {
            const stateCommand =
                getPythonSetting<string>(ACTIVESTATETOOLPATH_SETTING_KEY) ?? ActiveState.defaultStateCommand;
            const result = await shellExecute(`${stateCommand} projects -o editor`, {
                timeout: STATE_GENERAL_TIMEOUT,
            });
            if (!result) {
                return undefined;
            }
            let output = result.stdout.trimEnd();
            if (output[output.length - 1] === '\0') {
                // '\0' is a record separator.
                output = output.substring(0, output.length - 1);
            }
            traceVerbose(`${stateCommand} projects -o editor: ${output}`);
            const projects = JSON.parse(output);
            ActiveState.setCachedProjectInfo(projects);
            return projects;
        } catch (ex) {
            traceError(ex);
            return undefined;
        }
    }

    // Stored copy of known projects. isActiveStateEnvironmentForWorkspace() is
    // not async, so getProjects() cannot be used. ActiveStateLocator sets this
    // when it resolves project info.
    private static cachedProjectInfo: ProjectInfo[] = [];

    public static getCachedProjectInfo(): ProjectInfo[] {
        return this.cachedProjectInfo;
    }

    private static setCachedProjectInfo(projects: ProjectInfo[]): void {
        this.cachedProjectInfo = projects;
    }
}

export function isActiveStateEnvironmentForWorkspace(interpreterPath: string, workspacePath: string): boolean {
    const interpreterDir = dirname(interpreterPath);
    for (const project of ActiveState.getCachedProjectInfo()) {
        if (project.executables) {
            for (const [i, dir] of project.executables.entries()) {
                // Note multiple checkouts for the same interpreter may exist.
                // Check them all.
                if (arePathsSame(dir, interpreterDir) && arePathsSame(workspacePath, project.local_checkouts[i])) {
                    return true;
                }
            }
        }
    }
    return false;
}
