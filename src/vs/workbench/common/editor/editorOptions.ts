/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from 'vs/editor/common/core/range';
import { ICodeEditorViewState, IDiffEditorViewState, IEditor, ScrollType } from 'vs/editor/common/editorCommon';
import { ITextEditorOptions, TextEditorSelectionRevealType, TextEditorSelectionSource } from 'vs/platform/editor/common/editor';
import { isTextEditorViewState } from 'vs/workbench/common/editor';

export function applyTextEditorOptions(options: ITextEditorOptions, editor: IEditor, scrollType: ScrollType): boolean {
	let applied = false;

	// Restore view state if any
	const viewState = massageEditorViewState(options);
	if (isTextEditorViewState(viewState)) {
		editor.restoreViewState(viewState);

		applied = true;
	}

	// Restore selection if any
	if (options.selection) {
		const range: IRange = {
			startLineNumber: options.selection.startLineNumber,
			startColumn: options.selection.startColumn,
			endLineNumber: options.selection.endLineNumber ?? options.selection.startLineNumber,
			endColumn: options.selection.endColumn ?? options.selection.startColumn
		};

		// Apply selection with a source so that listeners can
		// distinguish this selection change from others.
		// If no source is provided, set a default source to
		// signal this navigation.
		editor.setSelection(range, options.selectionSource ?? TextEditorSelectionSource.NAVIGATION);

		// Reveal selection
		if (options.selectionRevealType === TextEditorSelectionRevealType.NearTop) {
			editor.revealRangeNearTop(range, scrollType);
		} else if (options.selectionRevealType === TextEditorSelectionRevealType.NearTopIfOutsideViewport) {
			editor.revealRangeNearTopIfOutsideViewport(range, scrollType);
		} else if (options.selectionRevealType === TextEditorSelectionRevealType.CenterIfOutsideViewport) {
			editor.revealRangeInCenterIfOutsideViewport(range, scrollType);
		} else {
			editor.revealRangeInCenter(range, scrollType);
		}

		applied = true;
	}

	return applied;
}

function massageEditorViewState(options: ITextEditorOptions): object | undefined {

	// Without a selection or view state, just return immediately
	if (!options.selection || !options.viewState) {
		return options.viewState;
	}

	// Diff editor: since we have an explicit selection, clear the
	// cursor state from the modified side where the selection
	// applies. This avoids a redundant selection change event.
	const candidateDiffViewState = options.viewState as IDiffEditorViewState;
	if (candidateDiffViewState.modified) {
		candidateDiffViewState.modified.cursorState = [];

		return candidateDiffViewState;
	}

	// Code editor: since we have an explicit selection, clear the
	// cursor state. This avoids a redundant selection change event.
	const candidateEditorViewState = options.viewState as ICodeEditorViewState;
	if (candidateEditorViewState.cursorState) {
		candidateEditorViewState.cursorState = [];
	}

	return candidateEditorViewState;
}
