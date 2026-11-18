/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// eslint-disable-next-line local/code-no-any-casts
(<any>globalThis).projectRoot = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath ?? __dirname;
