/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface CompletionArgs {
	uri: vscode.Uri;
	langId: string;
	line: string;
	position: vscode.Position;
}

export interface CompleterProvider {
	from(result: RegExpMatchArray, args: CompletionArgs): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;
}

