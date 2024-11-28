/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { AccessibleViewType, AccessibleContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { isReplEditorControl } from '../../replNotebook/browser/replEditor.js';
import { IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED } from '../common/notebookContextKeys.js';
import { getAllOutputsText } from './viewModel/cellOutputTextHelper.js';

/**
 * The REPL input is already accessible, so we can show a view for the most recent execution output.
 */
export class ReplEditorAccessibleView implements IAccessibleViewImplentation {
	readonly priority = 100;
	readonly name = 'replEditorInput';
	readonly type = AccessibleViewType.View;
	readonly when = ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED.negate());
	getProvider(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		return getAccessibleOutputProvider(editorService);
	}
}

export function getAccessibleOutputProvider(editorService: IEditorService) {
	const editorControl = editorService.activeEditorPane?.getControl();

	if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
		const notebookEditor = editorControl.notebookEditor;
		const viewModel = notebookEditor?.getViewModel();
		if (notebookEditor && viewModel) {
			// last cell of the viewmodel is the last cell history
			const lastCellIndex = viewModel.length - 1;
			if (lastCellIndex >= 0) {
				const cell = viewModel.viewCells[lastCellIndex];
				const outputContent = getAllOutputsText(viewModel.notebookDocument, cell);

				if (outputContent) {
					return new AccessibleContentProvider(
						AccessibleViewProviderId.Notebook,
						{ type: AccessibleViewType.View },
						() => { return outputContent; },
						() => {
							editorControl.activeCodeEditor?.focus();
						},
						AccessibilityVerbositySettingId.ReplEditor,
					);
				}
			}
		}
	}

	return;
}
