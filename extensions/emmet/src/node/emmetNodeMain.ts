/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { homedir } from 'os';

import { activateEmmetExtension } from '../emmetCommon';
import { setHomeDir } from '../util';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.updateImageSize', () => {
		return import('../updateImageSize').then(uis => uis.updateImageSize());
	}));

	setHomeDir(vscode.Uri.file(homedir()));
	activateEmmetExtension(context);
}
