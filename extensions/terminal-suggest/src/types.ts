/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface ICompletionResource {
	label: string;
	/**
	 * The definition command of the completion, this will be the resolved value of an alias
	 * completion.
	 */
	definitionCommand?: string;
	detail?: string;
	kind?: vscode.TerminalCompletionItemKind;
}
