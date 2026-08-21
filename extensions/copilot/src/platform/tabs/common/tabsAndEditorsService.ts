/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export interface TabInfo {
	readonly tab: vscode.Tab;
	readonly uri: vscode.Uri | undefined;
}

export interface TabChangeEvent {
	readonly opened: readonly TabInfo[];
	readonly closed: readonly TabInfo[];
	readonly changed: readonly TabInfo[];
}

export const ITabsAndEditorsService = createServiceIdentifier<ITabsAndEditorsService>('ITabsAndEditorsService');

export interface ITabsAndEditorsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeActiveTextEditor: vscode.Event<vscode.TextEditor | undefined>;
	readonly activeTextEditor: vscode.TextEditor | undefined;
	readonly visibleTextEditors: readonly vscode.TextEditor[];
	readonly activeNotebookEditor: vscode.NotebookEditor | undefined;
	readonly visibleNotebookEditors: readonly vscode.NotebookEditor[];
	readonly onDidChangeTabs: vscode.Event<TabChangeEvent>;
	readonly tabs: TabInfo[];
}
