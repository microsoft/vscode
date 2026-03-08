/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isTypeScriptDocument } from '../configuration/languageIds';
import { Command } from './commandManager';

export class LearnMoreAboutRefactoringsCommand implements Command {
	public static readonly id = '_typescript.learnMoreAboutRefactorings';
	public readonly id = LearnMoreAboutRefactoringsCommand.id;

	public execute() {
		const docUrl = vscode.window.activeTextEditor && isTypeScriptDocument(vscode.window.activeTextEditor.document)
			? 'https://code.visualstudio.com/Docs/languages/typescript#_refactoring'
			: 'https://code.visualstudio.com/docs/editor/refactoring';

		vscode.env.openExternal(vscode.Uri.parse(docUrl));
	}
}
