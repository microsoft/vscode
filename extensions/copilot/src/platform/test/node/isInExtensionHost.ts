/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// For use with the `--in-ext-host` mode of the simulation works.ace

export const isInExtensionHost = !!process.env.VSCODE_SIMULATION_EXTENSION_ENTRY;

export const extensionHostWorkspaceUri = () => require('vscode').workspace.workspaceFolders![0].uri;
