/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { SettingListItem } from '../../embeddings/common/vscodeIndex';

export const IWorkbenchService = createServiceIdentifier<IWorkbenchService>('IWorkbenchService');

export interface IWorkbenchService {
	_serviceBrand: undefined;
	getAllExtensions(): readonly vscode.Extension<any>[];
	getAllCommands(filterByPreCondition?: boolean): Promise<{ label: string; command: string; keybinding: string }[]>;
	getAllSettings(): Promise<{ [key: string]: SettingListItem }>;
}
