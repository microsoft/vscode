/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DocumentSelector } from 'vscode';

export const defaultNotebookFormat = { major: 4, minor: 5 };
export const ATTACHMENT_CLEANUP_COMMANDID = 'ipynb.cleanInvalidImageAttachment';

export const JUPYTER_NOTEBOOK_MARKDOWN_SELECTOR: DocumentSelector = { notebookType: 'jupyter-notebook', language: 'markdown' };

// Copied from NotebookCellKind.Markup as we cannot import it from vscode directly in worker threads.
export const NotebookCellKindMarkup = 1;
// Copied from NotebookCellKind.Code as we cannot import it from vscode directly in worker threads.
export const NotebookCellKindCode = 2;

export enum CellOutputMimeTypes {
	error = 'application/vnd.code.notebook.error',
	stderr = 'application/vnd.code.notebook.stderr',
	stdout = 'application/vnd.code.notebook.stdout'
}

export const textMimeTypes = ['text/plain', 'text/markdown', 'text/latex', CellOutputMimeTypes.stderr, CellOutputMimeTypes.stdout];

