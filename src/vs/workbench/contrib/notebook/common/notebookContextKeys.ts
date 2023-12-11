/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { INTERACTIVE_WINDOW_EDITOR_ID, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';



//#region Context Keys
export const HAS_OPENED_NOTEBOOK = new RawContextKey<boolean>('userHasOpenedNotebook', false);
export const KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('notebookFindWidgetFocused', false);
export const InteractiveWindowOpen = new RawContextKey<boolean>('interactiveWindowOpen', false);

// Is Notebook
export const NOTEBOOK_IS_ACTIVE_EDITOR = ContextKeyExpr.equals('activeEditor', NOTEBOOK_EDITOR_ID);
export const INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR = ContextKeyExpr.equals('activeEditor', INTERACTIVE_WINDOW_EDITOR_ID);

// Editor keys
export const NOTEBOOK_EDITOR_FOCUSED = new RawContextKey<boolean>('notebookEditorFocused', false);
export const NOTEBOOK_CELL_LIST_FOCUSED = new RawContextKey<boolean>('notebookCellListFocused', false);
export const NOTEBOOK_OUTPUT_FOCUSED = new RawContextKey<boolean>('notebookOutputFocused', false);
export const NOTEBOOK_OUPTUT_INPUT_FOCUSED = new RawContextKey<boolean>('notebookOutputInputFocused', false);
export const NOTEBOOK_EDITOR_EDITABLE = new RawContextKey<boolean>('notebookEditable', true);
export const NOTEBOOK_HAS_RUNNING_CELL = new RawContextKey<boolean>('notebookHasRunningCell', false);
export const NOTEBOOK_HAS_SOMETHING_RUNNING = new RawContextKey<boolean>('notebookHasSomethingRunning', false);
export const NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON = new RawContextKey<boolean>('notebookUseConsolidatedOutputButton', false);
export const NOTEBOOK_BREAKPOINT_MARGIN_ACTIVE = new RawContextKey<boolean>('notebookBreakpointMargin', false);
export const NOTEBOOK_CELL_TOOLBAR_LOCATION = new RawContextKey<'left' | 'right' | 'hidden'>('notebookCellToolbarLocation', 'left');
export const NOTEBOOK_CURSOR_NAVIGATION_MODE = new RawContextKey<boolean>('notebookCursorNavigationMode', false);
export const NOTEBOOK_LAST_CELL_FAILED = new RawContextKey<boolean>('notebookLastCellFailed', false);

// Cell keys
export const NOTEBOOK_VIEW_TYPE = new RawContextKey<string>('notebookType', undefined);
export const NOTEBOOK_CELL_TYPE = new RawContextKey<'code' | 'markup'>('notebookCellType', undefined);
export const NOTEBOOK_CELL_EDITABLE = new RawContextKey<boolean>('notebookCellEditable', false);
export const NOTEBOOK_CELL_FOCUSED = new RawContextKey<boolean>('notebookCellFocused', false);
export const NOTEBOOK_CELL_EDITOR_FOCUSED = new RawContextKey<boolean>('notebookCellEditorFocused', false);
export const NOTEBOOK_CELL_MARKDOWN_EDIT_MODE = new RawContextKey<boolean>('notebookCellMarkdownEditMode', false);
export const NOTEBOOK_CELL_LINE_NUMBERS = new RawContextKey<'on' | 'off' | 'inherit'>('notebookCellLineNumbers', 'inherit');
export type NotebookCellExecutionStateContext = 'idle' | 'pending' | 'executing' | 'succeeded' | 'failed';
export const NOTEBOOK_CELL_EXECUTION_STATE = new RawContextKey<NotebookCellExecutionStateContext>('notebookCellExecutionState', undefined);
export const NOTEBOOK_CELL_EXECUTING = new RawContextKey<boolean>('notebookCellExecuting', false); // This only exists to simplify a context key expression, see #129625
export const NOTEBOOK_CELL_HAS_OUTPUTS = new RawContextKey<boolean>('notebookCellHasOutputs', false);
export const NOTEBOOK_CELL_INPUT_COLLAPSED = new RawContextKey<boolean>('notebookCellInputIsCollapsed', false);
export const NOTEBOOK_CELL_OUTPUT_COLLAPSED = new RawContextKey<boolean>('notebookCellOutputIsCollapsed', false);
export const NOTEBOOK_CELL_RESOURCE = new RawContextKey<string>('notebookCellResource', '');

// Kernels
export const NOTEBOOK_KERNEL = new RawContextKey<string>('notebookKernel', undefined);
export const NOTEBOOK_KERNEL_COUNT = new RawContextKey<number>('notebookKernelCount', 0);
export const NOTEBOOK_KERNEL_SOURCE_COUNT = new RawContextKey<number>('notebookKernelSourceCount', 0);
export const NOTEBOOK_KERNEL_SELECTED = new RawContextKey<boolean>('notebookKernelSelected', false);
export const NOTEBOOK_INTERRUPTIBLE_KERNEL = new RawContextKey<boolean>('notebookInterruptibleKernel', false);
export const NOTEBOOK_MISSING_KERNEL_EXTENSION = new RawContextKey<boolean>('notebookMissingKernelExtension', false);
export const NOTEBOOK_HAS_OUTPUTS = new RawContextKey<boolean>('notebookHasOutputs', false);

//#endregion
