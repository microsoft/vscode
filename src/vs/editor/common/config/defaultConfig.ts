/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {IEditorOptions} from 'vs/editor/common/editorCommon';

export interface IConfiguration {
	editor:IEditorOptions;
}

export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';
export const DEFAULT_INDENTATION = {
	tabSize: 4,
	insertSpaces: true,
	detectIndentation: true
};

class ConfigClass implements IConfiguration {

	public editor: IEditorOptions;

	constructor() {
		this.editor = {
			experimentalScreenReader: true,
			rulers: [],
			wordSeparators: USUAL_WORD_SEPARATORS,
			selectionClipboard: false,
			ariaLabel: nls.localize('editorViewAccessibleLabel', "Editor content"),
			lineNumbers: true,
			selectOnLineNumbers: true,
			lineNumbersMinChars: 5,
			glyphMargin: false,
			lineDecorationsWidth: 10,
			revealHorizontalRightPadding: 30,
			roundedSelection: true,
			theme: 'vs',
			readOnly: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			cursorBlinking: 'blink',
			cursorStyle: 'line',
			fontLigatures: false,
			hideCursorInOverviewRuler: false,
			scrollBeyondLastLine: true,
			automaticLayout: false,
			wrappingColumn: 300,
			wrappingIndent: 'same',
			wordWrapBreakBeforeCharacters: '{([+',
			wordWrapBreakAfterCharacters: ' \t})]?|&,;',
			wordWrapBreakObtrusiveCharacters: '.',
			tabFocusMode: false,
			// stopLineTokenizationAfter
			// stopRenderingLineAfter
			longLineBoundary: 300,
			forcedTokenizationBoundary: 1000,

			// Features
			hover: true,
			contextmenu: true,
			mouseWheelScrollSensitivity: 1,
			quickSuggestions: true,
			quickSuggestionsDelay: 10,
			iconsInSuggestions: true,
			autoClosingBrackets: true,
			formatOnType: false,
			suggestOnTriggerCharacters: true,
			acceptSuggestionOnEnter: true,
			selectionHighlight: true,
			outlineMarkers: false,
			referenceInfos: true,
			folding: true,
			renderWhitespace: false,

			fontFamily: '',
			fontSize: 0,
			lineHeight: 0
		};
	}
}

export var DefaultConfig: IConfiguration = new ConfigClass();