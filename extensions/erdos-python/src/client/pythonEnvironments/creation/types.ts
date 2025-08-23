// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import { Progress, WorkspaceFolder } from 'vscode';

export interface CreateEnvironmentProgress extends Progress<{ message?: string; increment?: number }> {}

/**
 * The interpreter path to use for the environment creation. If not provided, will prompt the user to select one.
 * If the value of `interpreter` & `workspaceFolder` & `providerId` are provided we will not prompt the user to select a provider, nor folder, nor an interpreter.
 */
export interface CreateEnvironmentOptionsInternal {
    workspaceFolder?: WorkspaceFolder;
    providerId?: string;
    interpreterPath?: string;
    condaPythonVersion?: string;
    uvPythonVersion?: string;
    interpreter?: string;
}
