/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from 'vs/editor/common/core/range';
import { IEditor, IEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { ITextEditorOptions, TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';

export function applyTextEditorOptions(options: ITextEditorOptions, editor: IEditor, scrollType: ScrollType): boolean {

	// First try viewstate
	if (options.viewState) {
		editor.restoreViewState(options.viewState as IEditorViewState);

		return true;
	}

	// Otherwise check for selection
	else if (options.selection) {
		const range: IRange = {
			startLineNumber: options.selection.startLineNumber,
			startColumn: options.selection.startColumn,
			endLineNumber: options.selection.endLineNumber ?? options.selection.startLineNumber,
			endColumn: options.selection.endColumn ?? options.selection.startColumn
		};

		editor.setSelection(range);

		if (options.selectionRevealType === TextEditorSelectionRevealType.NearTop) {
			editor.revealRangeNearTop(range, scrollType);
		} else if (options.selectionRevealType === TextEditorSelectionRevealType.NearTopIfOutsideViewport) {
			editor.revealRangeNearTopIfOutsideViewport(range, scrollType);
		} else if (options.selectionRevealType === TextEditorSelectionRevealType.CenterIfOutsideViewport) {
			editor.revealRangeInCenterIfOutsideViewport(range, scrollType);
		} else {
			editor.revealRangeInCenter(range, scrollType);
		}

		return true;
	}

	return false;
}
