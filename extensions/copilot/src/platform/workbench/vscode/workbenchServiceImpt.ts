/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SettingListItem } from '../../embeddings/common/vscodeIndex';
import { IWorkbenchService } from '../common/workbenchService';

export class WorkbenchServiceImpl implements IWorkbenchService {

	declare readonly _serviceBrand: undefined;

	getAllExtensions(): readonly vscode.Extension<any>[] {
		return vscode.extensions.all;
	}

	async getAllCommands(filterByPreCondition?: boolean): Promise<{ label: string; command: string; keybinding: string }[]> {
		return vscode.commands.executeCommand('_getAllCommands', filterByPreCondition);
	}

	async getAllSettings(): Promise<{ [key: string]: SettingListItem }> {
		return vscode.commands.executeCommand('_getAllSettings');
	}
}
