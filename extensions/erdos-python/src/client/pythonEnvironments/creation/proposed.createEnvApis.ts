// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import { Event, Disposable, WorkspaceFolder } from 'vscode';
import { EnvironmentTools } from '../../api/types';

export type CreateEnvironmentUserActions = 'Back' | 'Cancel';
export type EnvironmentProviderId = string;

/**
 * Options used when creating a Python environment.
 */
export interface CreateEnvironmentOptions {
    /**
     * Default `true`. If `true`, the environment creation handler is expected to install packages.
     */
    installPackages?: boolean;

    /**
     * Default `true`. If `true`, the environment creation provider is expected to add the environment to ignore list
     * for the source control.
     */
    ignoreSourceControl?: boolean;

    /**
     * Default `false`. If `true` the creation provider should show back button when showing QuickPick or QuickInput.
     */
    showBackButton?: boolean;

    /**
     * Default `true`. If `true`, the environment after creation will be selected.
     */
    selectEnvironment?: boolean;
}

/**
 * Params passed on `onWillCreateEnvironment` event handler.
 */
export interface EnvironmentWillCreateEvent {
    /**
     * Options used to create a Python environment.
     */
    readonly options: CreateEnvironmentOptions | undefined;
}

export type CreateEnvironmentResult =
    | {
          /**
           * Workspace folder associated with the environment.
           */
          readonly workspaceFolder?: WorkspaceFolder;

          /**
           * Path to the executable python in the environment
           */
          readonly path: string;

          /**
           * User action that resulted in exit from the create environment flow.
           */
          readonly action?: CreateEnvironmentUserActions;

          /**
           * Error if any occurred during environment creation.
           */
          readonly error?: Error;
      }
    | {
          /**
           * Workspace folder associated with the environment.
           */
          readonly workspaceFolder?: WorkspaceFolder;

          /**
           * Path to the executable python in the environment
           */
          readonly path?: string;

          /**
           * User action that resulted in exit from the create environment flow.
           */
          readonly action: CreateEnvironmentUserActions;

          /**
           * Error if any occurred during environment creation.
           */
          readonly error?: Error;
      }
    | {
          /**
           * Workspace folder associated with the environment.
           */
          readonly workspaceFolder?: WorkspaceFolder;

          /**
           * Path to the executable python in the environment
           */
          readonly path?: string;

          /**
           * User action that resulted in exit from the create environment flow.
           */
          readonly action?: CreateEnvironmentUserActions;

          /**
           * Error if any occurred during environment creation.
           */
          readonly error: Error;
      };

/**
 * Params passed on `onDidCreateEnvironment` event handler.
 */
export type EnvironmentDidCreateEvent = CreateEnvironmentResult & {
    /**
     * Options used to create the Python environment.
     */
    readonly options: CreateEnvironmentOptions | undefined;
};

/**
 * Extensions that want to contribute their own environment creation can do that by registering an object
 * that implements this interface.
 */
export interface CreateEnvironmentProvider {
    /**
     * This API is called when user selects this provider from a QuickPick to select the type of environment
     * user wants. This API is expected to show a QuickPick or QuickInput to get the user input and return
     * the path to the Python executable in the environment.
     *
     * @param {CreateEnvironmentOptions} [options] Options used to create a Python environment.
     *
     * @returns a promise that resolves to the path to the
     * Python executable in the environment. Or any action taken by the user, such as back or cancel.
     */
    createEnvironment(options?: CreateEnvironmentOptions): Promise<CreateEnvironmentResult | undefined>;

    /**
     * Unique ID for the creation provider, typically <ExtensionId>:<environment-type | guid>
     */
    id: EnvironmentProviderId;

    /**
     * Display name for the creation provider.
     */
    name: string;

    /**
     * Description displayed to the user in the QuickPick to select environment provider.
     */
    description: string;

    /**
     * Tools used to manage this environment. e.g., ['conda']. In the most to least priority order
     * for resolving and working with the environment.
     */
    tools: EnvironmentTools[];
}

export interface ProposedCreateEnvironmentAPI {
    /**
     * This API can be used to detect when the environment creation starts for any registered
     * provider (including internal providers). This will also receive any options passed in
     * or defaults used to create environment.
     */
    readonly onWillCreateEnvironment: Event<EnvironmentWillCreateEvent>;

    /**
     * This API can be used to detect when the environment provider exits for any registered
     * provider (including internal providers). This will also receive created environment path,
     * any errors, or user actions taken from the provider.
     */
    readonly onDidCreateEnvironment: Event<EnvironmentDidCreateEvent>;

    /**
     * This API will show a QuickPick to select an environment provider from available list of
     * providers. Based on the selection the `createEnvironment` will be called on the provider.
     */
    createEnvironment(options?: CreateEnvironmentOptions): Promise<CreateEnvironmentResult | undefined>;

    /**
     * This API should be called to register an environment creation provider. It returns
     * a (@link Disposable} which can be used to remove the registration.
     */
    registerCreateEnvironmentProvider(provider: CreateEnvironmentProvider): Disposable;
}
