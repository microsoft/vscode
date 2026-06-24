/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IUrlOpener } from '../common/opener';

export class RealUrlOpener implements IUrlOpener {

	declare readonly _serviceBrand: undefined;

	async open(target: string): Promise<void> {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(target));
	}
}
