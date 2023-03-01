/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const defaultNotebookFormat = { major: 4, minor: 2 };
export const ATTACHMENT_CLEANUP_COMMANDID = 'ipynb.cleanInvalidImageAttachment';

export const JUPYTER_NOTEBOOK_MARKDOWN_SELECTOR: vscode.DocumentSelector = { notebookType: 'jupyter-notebook', language: 'markdown' };
