/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../utils/commandManager';

export class LearnMoreAboutRefactoringsCommand implements Command {
	public readonly id = '_typescript.learnMoreAboutRefactorings';

	public execute() {
		vscode.env.openExternal(vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=2114477'));
	}
}
