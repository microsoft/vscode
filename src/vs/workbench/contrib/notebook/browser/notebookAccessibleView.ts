/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { getNotebookEditorFromEditorPane } from './notebookBrowser.js';
import { NOTEBOOK_OUTPUT_FOCUSED } from '../common/notebookContextKeys.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class NotebookAccessibleView implements IAccessibleViewImplentation {
	readonly priority = 100;
	readonly name = 'notebook';
	readonly type = AccessibleViewType.View;
	readonly when = ContextKeyExpr.and(NOTEBOOK_OUTPUT_FOCUSED, ContextKeyExpr.equals('resourceExtname', '.ipynb'));
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
	let outputContent = '';
	const decoder = new TextDecoder();
	for (let i = 0; i < viewCell.outputsViewModels.length; i++) {
		const outputViewModel = viewCell.outputsViewModels[i];
		const outputTextModel = viewCell.model.outputs[i];
		const [mimeTypes, pick] = outputViewModel.resolveMimeTypes(notebookEditor.textModel, undefined);
		const mimeType = mimeTypes[pick].mimeType;
		let buffer = outputTextModel.outputs.find(output => output.mime === mimeType);

		if (!buffer || mimeType.startsWith('image')) {
			buffer = outputTextModel.outputs.find(output => !output.mime.startsWith('image'));
		}

		let text = `${mimeType}`; // default in case we can't get the text value for some reason.
		if (buffer) {
			const charLimit = 100_000;
			text = decoder.decode(buffer.data.slice(0, charLimit).buffer);

			if (buffer.data.byteLength > charLimit) {
				text = text + '...(truncated)';
			}

			if (mimeType.endsWith('error')) {
				text = text.replace(/\\u001b\[[0-9;]*m/gi, '').replaceAll('\\n', '\n');
			}
		}

		const index = viewCell.outputsViewModels.length > 1
			? `Cell output ${i + 1} of ${viewCell.outputsViewModels.length}\n`
			: '';
		outputContent = outputContent.concat(`${index}${text}\n`);
	}

	if (!outputContent) {
		return;
	}

	return new AccessibleContentProvider(
		AccessibleViewProviderId.Notebook,
		{ type: AccessibleViewType.View },
		() => { return outputContent; },
		() => {
			notebookEditor?.setFocus(selections[0]);
			activePane?.focus();
		},
		AccessibilityVerbositySettingId.Notebook,
	);
}

