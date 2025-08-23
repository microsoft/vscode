// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Environment } from './api/types';

/**
 * Workaround temp cache until types are consolidated.
 */
export class EnvironmentKnownCache {
    private _envs: Environment[] = [];

    constructor(envs: Environment[]) {
        this._envs = envs;
    }

    public get envs(): Environment[] {
        return this._envs;
    }

    public addEnv(env: Environment): void {
        const found = this._envs.find((e) => env.id === e.id);
        if (!found) {
            this._envs.push(env);
        }
    }

    public updateEnv(oldValue: Environment, newValue: Environment | undefined): void {
        const index = this._envs.findIndex((e) => oldValue.id === e.id);
        if (index !== -1) {
            if (newValue === undefined) {
                this._envs.splice(index, 1);
            } else {
                this._envs[index] = newValue;
            }
        }
    }
}
