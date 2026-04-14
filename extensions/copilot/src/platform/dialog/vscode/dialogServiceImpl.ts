/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IDialogService } from '../common/dialogService';

export class DialogServiceImpl implements IDialogService {
	declare readonly _serviceBrand: undefined;

	showQuickPick<T extends vscode.QuickPickItem>(items: readonly T[] | Thenable<readonly T[]>, options: vscode.QuickPickOptions, token?: vscode.CancellationToken): Thenable<T | undefined> {
		return vscode.window.showQuickPick(items, options, token);
	}

	showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
		return vscode.window.showOpenDialog(options).then(result => result);
	}
}
