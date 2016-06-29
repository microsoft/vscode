/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {IEditorOptions} from 'vs/editor/common/editorCommon';
import * as platform from 'vs/base/common/platform';
import {USUAL_WORD_SEPARATORS} from 'vs/editor/common/model/wordHelper';

export interface IConfiguration {
	editor:IEditorOptions;
}

export const DEFAULT_INDENTATION = {
	tabSize: 4,
	insertSpaces: true,
	detectIndentation: true
};
export const DEFAULT_TRIM_AUTO_WHITESPACE = true;

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'Courier New\', monospace, \'Droid Sans Fallback\'';

/**
 * Determined from empirical observations.
 */
export const GOLDEN_LINE_HEIGHT_RATIO = platform.isMacintosh ? 1.5 : 1.35;

class ConfigClass implements IConfiguration {

	public editor: IEditorOptions;

	constructor() {
		this.editor = {
			experimentalScreenReader: true,
			rulers: [],
			wordSeparators: USUAL_WORD_SEPARATORS,
			selectionClipboard: true,
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
			disableTranslate3d: false,
			hideCursorInOverviewRuler: false,
			scrollBeyondLastLine: true,
			automaticLayout: false,
			wrappingColumn: 300,
			wrappingIndent: 'same',
			wordWrapBreakBeforeCharacters: '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋',
			wordWrapBreakAfterCharacters: ' \t})]?|&,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ’”〉》」』】〕）］｝｣',
			wordWrapBreakObtrusiveCharacters: '.',
			tabFocusMode: false,

			// Features
			hover: true,
			contextmenu: true,
			mouseWheelScrollSensitivity: 1,
			quickSuggestions: true,
			quickSuggestionsDelay: 10,
			parameterHints: true,
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
			renderControlCharacters: false,
			renderIndentGuides: false,
			useTabStops: true,

			fontFamily: (
				platform.isMacintosh ? DEFAULT_MAC_FONT_FAMILY : (platform.isLinux ? DEFAULT_LINUX_FONT_FAMILY : DEFAULT_WINDOWS_FONT_FAMILY)
			),
			fontSize: (
				platform.isMacintosh ? 12 : 14
			),
			lineHeight: 0
		};
	}
}

export var DefaultConfig: IConfiguration = new ConfigClass();
