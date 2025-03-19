/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { services } from './services';

/**
 * TODO: @legomushroom - list
 *  - move in `prompt file reference`
 *  - create extension API
 *  - consume extension API
 *  - remove the old code in core
 *  - move in `language features` to the extension
 *  - test in-browser
 *  - create index.ts for utils
 */

export function activate(context: vscode.ExtensionContext): any {
	services.initialize(context);
}
