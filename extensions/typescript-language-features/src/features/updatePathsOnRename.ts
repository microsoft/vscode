/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { Command } from '../utils/commandManager';
import * as typeConverters from '../utils/typeConverters';
import { isPrimitive } from 'util';

export class RenameFileAndUpdatePathsCommand implements Command {

	id = 'typescript.renameFileAndUpdatePaths';

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async execute(resource: vscode.Uri): Promise<void> {
		if (!resource) {
			return;
		}

		const newFileName = await vscode.window.showInputBox({ prompt: 'Enter new file name...', value: path.basename(resource.fsPath) });
		if (!newFileName) {
			return;
		}

		const newFilePath = path.join(path.dirname(resource.fsPath), newFileName);
		if (fs.existsSync(newFilePath)) {
			return;
		}

		// Do rename
		fs.renameSync(resource.fsPath, newFilePath);
		vscode.window.showTextDocument(vscode.Uri.file(newFilePath));
		const args: Proto.GetEditsForFileRenameRequestArgs = {
			file: newFilePath,
			oldFilePath: resource.fsPath,
			newFilePath: newFilePath
		};

		await new Promise(resolve => setTimeout(resolve, 1000));

		const response = await this.client.execute('getEditsForFileRename', args);
		if (!response || !response.body) {
			return;
		}

		const edit = typeConverters.WorkspaceEdit.fromFromFileCodeEdits(this.client, response.body.edits);
		await vscode.workspace.applyEdit(edit);
	}
}