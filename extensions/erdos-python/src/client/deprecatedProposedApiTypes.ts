// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Uri, Event } from 'vscode';
import { PythonEnvKind, EnvPathType } from './pythonEnvironments/base/info';
import { ProgressNotificationEvent, GetRefreshEnvironmentsOptions } from './pythonEnvironments/base/locator';
import { Resource } from './api/types';

export interface EnvironmentDetailsOptions {
    useCache: boolean;
}

export interface EnvironmentDetails {
    interpreterPath: string;
    envFolderPath?: string;
    version: string[];
    environmentType: PythonEnvKind[];
    metadata: Record<string, unknown>;
}

export interface EnvironmentsChangedParams {
    /**
     * Path to environment folder or path to interpreter that uniquely identifies an environment.
     * Virtual environments lacking an interpreter are identified by environment folder paths,
     * whereas other envs can be identified using interpreter path.
     */
    path?: string;
    type: 'add' | 'remove' | 'update' | 'clear-all';
}

export interface ActiveEnvironmentChangedParams {
    /**
     * Path to environment folder or path to interpreter that uniquely identifies an environment.
     * Virtual environments lacking an interpreter are identified by environment folder paths,
     * whereas other envs can be identified using interpreter path.
     */
    path: string;
    resource?: Uri;
}

/**
 * @deprecated Use {@link ProposedExtensionAPI} instead.
 */
export interface DeprecatedProposedAPI {
    /**
     * @deprecated Use {@link ProposedExtensionAPI.environments} instead. This will soon be removed.
     */
    environment: {
        /**
         * An event that is emitted when execution details (for a resource) change. For instance, when interpreter configuration changes.
         */
        readonly onDidChangeExecutionDetails: Event<Uri | undefined>;
        /**
         * Returns all the details the consumer needs to execute code within the selected environment,
         * corresponding to the specified resource taking into account any workspace-specific settings
         * for the workspace to which this resource belongs.
         * @param {Resource} [resource] A resource for which the setting is asked for.
         * * When no resource is provided, the setting scoped to the first workspace folder is returned.
         * * If no folder is present, it returns the global setting.
         */
        getExecutionDetails(
            resource?: Resource,
        ): Promise<{
            /**
             * E.g of execution commands returned could be,
             * * `['<path to the interpreter set in settings>']`
             * * `['<path to the interpreter selected by the extension when setting is not set>']`
             * * `['conda', 'run', 'python']` which is used to run from within Conda environments.
             * or something similar for some other Python environments.
             *
             * @type {(string[] | undefined)} When return value is `undefined`, it means no interpreter is set.
             * Otherwise, join the items returned using space to construct the full execution command.
             */
            execCommand: string[] | undefined;
        }>;
        /**
         * Returns the path to the python binary selected by the user or as in the settings.
         * This is just the path to the python binary, this does not provide activation or any
         * other activation command. The `resource` if provided will be used to determine the
         * python binary in a multi-root scenario. If resource is `undefined` then the API
         * returns what ever is set for the workspace.
         * @param resource : Uri of a file or workspace
         */
        getActiveEnvironmentPath(resource?: Resource): Promise<EnvPathType | undefined>;
        /**
         * Returns details for the given interpreter. Details such as absolute interpreter path,
         * version, type (conda, pyenv, etc). Metadata such as `sysPrefix` can be found under
         * metadata field.
         * @param path : Full path to environment folder or interpreter whose details you need.
         * @param options : [optional]
         *     * useCache : When true, cache is checked first for any data, returns even if there
         *                  is partial data.
         */
        getEnvironmentDetails(
            path: string,
            options?: EnvironmentDetailsOptions,
        ): Promise<EnvironmentDetails | undefined>;
        /**
         * Returns paths to environments that uniquely identifies an environment found by the extension
         * at the time of calling. This API will *not* trigger a refresh. If a refresh is going on it
         * will *not* wait for the refresh to finish. This will return what is known so far. To get
         * complete list `await` on promise returned by `getRefreshPromise()`.
         *
         * Virtual environments lacking an interpreter are identified by environment folder paths,
         * whereas other envs can be identified using interpreter path.
         */
        getEnvironmentPaths(): Promise<EnvPathType[] | undefined>;
        /**
         * Sets the active environment path for the python extension for the resource. Configuration target
         * will always be the workspace folder.
         * @param path : Full path to environment folder or interpreter to set.
         * @param resource : [optional] Uri of a file ro workspace to scope to a particular workspace
         *                   folder.
         */
        setActiveEnvironment(path: string, resource?: Resource): Promise<void>;
        /**
         * This API will re-trigger environment discovery. Extensions can wait on the returned
         * promise to get the updated environment list. If there is a refresh already going on
         * then it returns the promise for that refresh.
         * @param options : [optional]
         *     * clearCache : When true, this will clear the cache before environment refresh
         *                    is triggered.
         */
        refreshEnvironment(): Promise<EnvPathType[] | undefined>;
        /**
         * Tracks discovery progress for current list of known environments, i.e when it starts, finishes or any other relevant
         * stage. Note the progress for a particular query is currently not tracked or reported, this only indicates progress of
         * the entire collection.
         */
        readonly onRefreshProgress: Event<ProgressNotificationEvent>;
        /**
         * Returns a promise for the ongoing refresh. Returns `undefined` if there are no active
         * refreshes going on.
         */
        getRefreshPromise(options?: GetRefreshEnvironmentsOptions): Promise<void> | undefined;
        /**
         * This event is triggered when the known environment list changes, like when a environment
         * is found, existing environment is removed, or some details changed on an environment.
         */
        onDidEnvironmentsChanged: Event<EnvironmentsChangedParams[]>;
        /**
         * @deprecated Use {@link ProposedExtensionAPI.environments} `onDidChangeActiveEnvironmentPath` instead. This will soon be removed.
         */
        onDidActiveEnvironmentChanged: Event<ActiveEnvironmentChangedParams>;
    };
}
