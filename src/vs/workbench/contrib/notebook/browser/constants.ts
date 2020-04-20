/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Cell sizing related
export const CELL_MARGIN = 20;
export const CELL_RUN_GUTTER = 32; // TODO should be dynamic based on execution order width, and runnable enablement

export const EDITOR_TOOLBAR_HEIGHT = 0;
export const BOTTOM_CELL_TOOLBAR_HEIGHT = 32;
export const CELL_STATUSBAR_HEIGHT = 28;

// Top margin of editor
export const EDITOR_TOP_MARGIN = 16;

// Top and bottom padding inside the monaco editor in a cell, which are included in `cell.editorHeight`
export const EDITOR_TOP_PADDING = 12;
export const EDITOR_BOTTOM_PADDING = 8;

// Cell context keys

export const NOTEBOOK_VIEW_TYPE = 'notebookViewType';
export const NOTEBOOK_CELL_TYPE_CONTEXT_KEY = 'notebookCellType'; // code, markdown
export const NOTEBOOK_CELL_EDITABLE_CONTEXT_KEY = 'notebookCellEditable'; // bool
export const NOTEBOOK_CELL_MARKDOWN_EDIT_MODE_CONTEXT_KEY = 'notebookCellMarkdownEditMode'; // bool
export const NOTEBOOK_CELL_RUN_STATE_CONTEXT_KEY = 'notebookCellRunState'; // idle, running

// Notebook context keys
export const NOTEBOOK_EDITABLE_CONTEXT_KEY = 'notebookEditable';
export const NOTEBOOK_EXECUTING_KEY = 'notebookExecuting';
