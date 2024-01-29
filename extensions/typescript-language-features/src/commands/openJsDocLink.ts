/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from './commandManager';

export interface OpenJsDocLinkCommand_Args {
	readonly file: vscode.Uri;
	readonly position: vscode.Position;
}

/**
 * Proxy command for opening links in jsdoc comments.
 *
 * This is needed to avoid incorrectly rewriting uris.
 */
export class OpenJsDocLinkCommand implements Command {
	public static readonly id = '_typescript.openJsDocLink';
	public readonly id = OpenJsDocLinkCommand.id;

	public async execute(args: OpenJsDocLinkCommand_Args): Promise<void> {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.from(args.file), <vscode.TextDocumentShowOptions>{
			selection: new vscode.Range(args.position, args.position),
		});
	}
}
