// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { PythonEnvKind } from '../../info';
import { BasicEnvInfo, IPythonEnvsIterator } from '../../locator';
import { FSWatchingLocator } from './fsWatchingLocator';
import { getPythonSetting, onDidChangePythonSetting } from '../../../common/externalDependencies';
import '../../../../common/extensions';
import { traceVerbose } from '../../../../logging';
import { DEFAULT_INTERPRETER_SETTING } from '../../../../common/constants';

export const DEFAULT_INTERPRETER_PATH_SETTING_KEY = 'defaultInterpreterPath';

/**
 * Finds and resolves custom virtual environments that users have provided.
 */
export class CustomWorkspaceLocator extends FSWatchingLocator {
    public readonly providerId: string = 'custom-workspace-locator';

    constructor(private readonly root: string) {
        super(
            () => [],
            async () => PythonEnvKind.Unknown,
        );
    }

    protected async initResources(): Promise<void> {
        this.disposables.push(
            onDidChangePythonSetting(DEFAULT_INTERPRETER_PATH_SETTING_KEY, () => this.fire(), this.root),
        );
    }

    // eslint-disable-next-line class-methods-use-this
    protected doIterEnvs(): IPythonEnvsIterator<BasicEnvInfo> {
        const iterator = async function* (root: string) {
            traceVerbose('Searching for custom workspace envs');
            const filename = getPythonSetting<string>(DEFAULT_INTERPRETER_PATH_SETTING_KEY, root);
            if (!filename || filename === DEFAULT_INTERPRETER_SETTING) {
                // If the user has not set a custom interpreter, our job is done.
                return;
            }
            yield { kind: PythonEnvKind.Unknown, executablePath: filename };
            traceVerbose(`Finished searching for custom workspace envs`);
        };
        return iterator(this.root);
    }
}
