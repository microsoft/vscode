/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

export const selectKernelIcon = registerIcon('notebook-kernel-select', Codicon.serverEnvironment, localize('selectKernelIcon', 'Configure icon to select a kernel in notebook editors.'));
export const executeIcon = registerIcon('notebook-execute', Codicon.play, localize('executeIcon', 'Icon to execute in notebook editors.'));
export const executeAboveIcon = registerIcon('notebook-execute-above', Codicon.runAbove, localize('executeAboveIcon', 'Icon to execute above cells in notebook editors.'));
export const executeBelowIcon = registerIcon('notebook-execute-below', Codicon.runBelow, localize('executeBelowIcon', 'Icon to execute below cells in notebook editors.'));
export const stopIcon = registerIcon('notebook-stop', Codicon.primitiveSquare, localize('stopIcon', 'Icon to stop an execution in notebook editors.'));
export const deleteCellIcon = registerIcon('notebook-delete-cell', Codicon.trash, localize('deleteCellIcon', 'Icon to delete a cell in notebook editors.'));
export const executeAllIcon = registerIcon('notebook-execute-all', Codicon.runAll, localize('executeAllIcon', 'Icon to execute all cells in notebook editors.'));
export const editIcon = registerIcon('notebook-edit', Codicon.pencil, localize('editIcon', 'Icon to edit a cell in notebook editors.'));
export const stopEditIcon = registerIcon('notebook-stop-edit', Codicon.check, localize('stopEditIcon', 'Icon to stop editing a cell in notebook editors.'));
export const moveUpIcon = registerIcon('notebook-move-up', Codicon.arrowUp, localize('moveUpIcon', 'Icon to move up a cell in notebook editors.'));
export const moveDownIcon = registerIcon('notebook-move-down', Codicon.arrowDown, localize('moveDownIcon', 'Icon to move down a cell in notebook editors.'));
export const clearIcon = registerIcon('notebook-clear', Codicon.clearAll, localize('clearIcon', 'Icon to clear cell outputs in notebook editors.'));
export const splitCellIcon = registerIcon('notebook-split-cell', Codicon.splitVertical, localize('splitCellIcon', 'Icon to split a cell in notebook editors.'));
export const successStateIcon = registerIcon('notebook-state-success', Codicon.check, localize('successStateIcon', 'Icon to indicate a success state in notebook editors.'));
export const errorStateIcon = registerIcon('notebook-state-error', Codicon.error, localize('errorStateIcon', 'Icon to indicate an error state in notebook editors.'));
export const pendingStateIcon = registerIcon('notebook-state-pending', Codicon.clock, localize('pendingStateIcon', 'Icon to indicate a pending state in notebook editors.'));
export const executingStateIcon = registerIcon('notebook-state-executing', Codicon.sync, localize('executingStateIcon', 'Icon to indicate an executing state in notebook editors.'));

export const collapsedIcon = registerIcon('notebook-collapsed', Codicon.chevronRight, localize('collapsedIcon', 'Icon to annotate a collapsed section in notebook editors.'));
export const expandedIcon = registerIcon('notebook-expanded', Codicon.chevronDown, localize('expandedIcon', 'Icon to annotate an expanded section in notebook editors.'));
export const openAsTextIcon = registerIcon('notebook-open-as-text', Codicon.fileCode, localize('openAsTextIcon', 'Icon to open the notebook in a text editor.'));
export const revertIcon = registerIcon('notebook-revert', Codicon.discard, localize('revertIcon', 'Icon to revert in notebook editors.'));
export const toggleWhitespace = registerIcon('notebook-diff-cell-toggle-whitespace', Codicon.whitespace, localize('toggleWhitespace', 'Icon for the toggle whitespace action in the diff editor.'));
export const renderOutputIcon = registerIcon('notebook-render-output', Codicon.preview, localize('renderOutputIcon', 'Icon to render output in diff editor.'));
export const mimetypeIcon = registerIcon('notebook-mimetype', Codicon.code, localize('mimetypeIcon', 'Icon for a mime type in notebook editors.'));
export const copyIcon = registerIcon('notebook-copy', Codicon.copy, localize('copyIcon', 'Icon to copy content to clipboard'));

export const previousChangeIcon = registerIcon('notebook-diff-editor-previous-change', Codicon.arrowUp, localize('previousChangeIcon', 'Icon for the previous change action in the diff editor.'));
export const nextChangeIcon = registerIcon('notebook-diff-editor-next-change', Codicon.arrowDown, localize('nextChangeIcon', 'Icon for the next change action in the diff editor.'));

export const variablesViewIcon = registerIcon('variables-view-icon', Codicon.debugAlt, localize('variablesViewIcon', 'View icon of the variables view.'));
