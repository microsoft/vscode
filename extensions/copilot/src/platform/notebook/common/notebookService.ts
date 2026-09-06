/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NotebookCell, Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';


export interface Variable {
	name: string;
	value: string;
	type?: string;
	summary?: string;
}

export interface VariablesResult {
	variable: Variable;
	hasNamedChildren: boolean;
	indexedChildrenCount: number;
}

export interface PipPackage {
	name: string;
	version: string;
}

export const INotebookService = createServiceIdentifier<INotebookService>('INotebookService');

export interface INotebookService {
	readonly _serviceBrand: undefined;
	getVariables(notebook: Uri): Promise<VariablesResult[]>;
	getPipPackages(notebook: Uri): Promise<PipPackage[]>;
	getCellExecutions(notebook: Uri): NotebookCell[];
	runCells(notebook: Uri, range: { start: number; end: number }, autoReveal: boolean): Promise<void>;
	trackAgentUsage(): void;
	setFollowState(state: boolean): void;
	getFollowState(): boolean;
	ensureKernelSelected(notebook: Uri): Promise<void>;
	hasSupportedNotebooks(uri: Uri): boolean;
	// testing utility
	setVariables(notebook: Uri, variables: VariablesResult[]): void;
}
