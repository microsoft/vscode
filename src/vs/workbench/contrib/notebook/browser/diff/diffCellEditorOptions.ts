/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffEditorConstructionOptions } from '../../../../../editor/browser/editorBrowser.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';

/**
 * Do not leave at 12, when at 12 and we have whitespace and only one line,
 * then there's not enough space for the button `Show Whitespace Differences`
 */
const fixedEditorPaddingSingleLineCells = {
	top: 24,
	bottom: 24
};
const fixedEditorPadding = {
	top: 12,
	bottom: 12
};

export function getEditorPadding(lineCount: number) {
	return lineCount === 1 ? fixedEditorPaddingSingleLineCells : fixedEditorPadding;
}

export const fixedEditorOptions: IEditorOptions = {
	padding: fixedEditorPadding,
	scrollBeyondLastLine: false,
	scrollbar: {
		verticalScrollbarSize: 14,
		horizontal: 'auto',
		vertical: 'auto',
		useShadows: true,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		alwaysConsumeMouseWheel: false,
	},
	renderLineHighlightOnlyWhenFocus: true,
	overviewRulerLanes: 0,
	overviewRulerBorder: false,
	selectOnLineNumbers: false,
	wordWrap: 'off',
	lineNumbers: 'off',
	glyphMargin: true,
	fixedOverflowWidgets: true,
	minimap: { enabled: false },
	renderValidationDecorations: 'on',
	renderLineHighlight: 'none',
	readOnly: true
};

export const fixedDiffEditorOptions: IDiffEditorConstructionOptions = {
	...fixedEditorOptions,
	glyphMargin: true,
	enableSplitViewResizing: false,
	renderIndicators: true,
	renderMarginRevertIcon: false,
	readOnly: false,
	isInEmbeddedEditor: true,
	renderOverviewRuler: false,
	wordWrap: 'off',
	diffWordWrap: 'off',
	diffAlgorithm: 'advanced',
	renderSideBySide: true,
	useInlineViewWhenSpaceIsLimited: false
};
