/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { getNotebookEditorFromEditorPane } from './notebookBrowser.js';
import { NOTEBOOK_CELL_LIST_FOCUSED } from '../common/notebookContextKeys.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { InputFocusedContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { getAllOutputsText } from './viewModel/cellOutputTextHelper.js';

export class NotebookAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'notebook';
	readonly type = AccessibleViewType.View;
	readonly when = ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated());
	getProvider(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		return getAccessibleOutputProvider(editorService);
	}
}

export function getAccessibleOutputProvider(editorService: IEditorService) {
	const activePane = editorService.activeEditorPane;
	const notebookEditor = getNotebookEditorFromEditorPane(activePane);
	const notebookViewModel = notebookEditor?.getViewModel();
	const selections = notebookViewModel?.getSelections();
	const notebookDocument = notebookViewModel?.notebookDocument;

	if (!selections || !notebookDocument || !notebookEditor?.textModel) {
		return;
	}

	const viewCell = notebookViewModel.viewCells[selections[0].start];
	const outputContent = getAllOutputsText(notebookDocument, viewCell);

	if (!outputContent) {
		return;
	}

	return new AccessibleContentProvider(
		AccessibleViewProviderId.Notebook,
		{ type: AccessibleViewType.View },
		() => { return outputContent; },
		() => {
			notebookEditor?.setFocus(selections[0]);
			notebookEditor.focus();
		},
		AccessibilityVerbositySettingId.Notebook,
	);
}

