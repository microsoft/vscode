/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NotebookDocument } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const INotebookSummaryTracker = createServiceIdentifier<INotebookSummaryTracker>('INotebookSummaryTracker');

export interface INotebookSummaryTracker {
	readonly _serviceBrand: undefined;
	trackNotebook(notebook: NotebookDocument): void;
	clearState(notebook: NotebookDocument): void;
	listNotebooksWithChanges(): NotebookDocument[];
}
