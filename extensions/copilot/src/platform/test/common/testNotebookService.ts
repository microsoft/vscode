/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NotebookCell, Uri } from 'vscode';
import { INotebookService, PipPackage, VariablesResult } from '../../notebook/common/notebookService';

export const mockNotebookService = new class implements INotebookService {
	_serviceBrand: undefined;
	async getVariables(notebook: Uri): Promise<VariablesResult[]> {
		return [];
	}
	async getPipPackages(notebook: Uri): Promise<PipPackage[]> {
		return [];
	}
	setVariables(notebook: Uri, variables: VariablesResult[]): void {
	}
	getCellExecutions(notebook: Uri): NotebookCell[] {
		return [];
	}
	runCells(notebook: Uri, range: { start: number; end: number }, autoreveal: boolean): Promise<void> {
		return Promise.resolve();
	}
	ensureKernelSelected(notebook: Uri): Promise<void> {
		return Promise.resolve();
	}
	populateNotebookProviders(): void {
		return;
	}
	hasSupportedNotebooks(uri: Uri): boolean {
		return false;
	}
	trackAgentUsage() { }
	setFollowState(state: boolean): void { }
	getFollowState(): boolean {
		return false;
	}
}();