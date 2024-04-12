/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';

export const fixedEditorPadding = {
	top: 12,
	bottom: 12
};

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
	lineDecorationsWidth: 0,
	glyphMargin: false,
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
