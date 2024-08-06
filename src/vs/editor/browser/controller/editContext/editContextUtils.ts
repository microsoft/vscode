/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISimpleModel, PagedScreenReaderStrategy, TextAreaState } from 'vs/editor/browser/controller/editContext/textArea/textAreaState';
import { Position } from 'vs/editor/common/core/position';
import { getMapForWordSeparators, WordCharacterClass } from 'vs/editor/common/core/wordCharacterClassifier';
import { IViewModel } from 'vs/editor/common/viewModel';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as strings from 'vs/base/common/strings';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { Selection } from 'vs/editor/common/core/selection';

// TODO: Need to maybe pass in the options object instead of the separate settings
export function getScreenReaderContent(viewContext: ViewContext, selection: Selection, accessibilitySupport: AccessibilitySupport, accessibilityPageSize: number): TextAreaState {

	const simpleModel: ISimpleModel = {
		getLineCount: (): number => {
			return viewModel.getLineCount();
		},
		getLineMaxColumn: (lineNumber: number): number => {
			return viewModel.getLineMaxColumn(lineNumber);
		},
		getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
			return viewModel.getValueInRange(range, eol);
		},
		getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => {
			return viewModel.getValueLengthInRange(range, eol);
		},
		modifyPosition: (position: Position, offset: number): Position => {
			return viewModel.modifyPosition(position, offset);
		}
	};

	const viewModel = viewContext.viewModel;
	if (accessibilitySupport === AccessibilitySupport.Disabled) {
		// We know for a fact that a screen reader is not attached
		// On OSX, we write the character before the cursor to allow for "long-press" composition
		// Also on OSX, we write the word before the cursor to allow for the Accessibility Keyboard to give good hints
		if (platform.isMacintosh && selection.isEmpty()) {
			const position = selection.getStartPosition();

			let textBefore = getWordBeforePosition(viewContext, position);
			if (textBefore.length === 0) {
				textBefore = getCharacterBeforePosition(viewModel, position);
			}

			if (textBefore.length > 0) {
				return new TextAreaState(textBefore, textBefore.length, textBefore.length, Range.fromPositions(position), 0);
			}
		}
		// on macOS, write current selection into textarea will allow system text services pick selected text,
		// but we still want to limit the amount of text given Chromium handles very poorly text even of a few
		// thousand chars
		// (https://github.com/microsoft/vscode/issues/27799)
		const LIMIT_CHARS = 500;
		if (platform.isMacintosh && !selection.isEmpty() && simpleModel.getValueLengthInRange(selection, EndOfLinePreference.TextDefined) < LIMIT_CHARS) {
			const text = simpleModel.getValueInRange(selection, EndOfLinePreference.TextDefined);
			return new TextAreaState(text, 0, text.length, selection, 0);
		}

		// on Safari, document.execCommand('cut') and document.execCommand('copy') will just not work
		// if the textarea has no content selected. So if there is an editor selection, ensure something
		// is selected in the textarea.
		if (browser.isSafari && !selection.isEmpty()) {
			const placeholderText = 'vscode-placeholder';
			return new TextAreaState(placeholderText, 0, placeholderText.length, null, undefined);
		}

		return TextAreaState.EMPTY;
	}

	if (browser.isAndroid) {
		// when tapping in the editor on a word, Android enters composition mode.
		// in the `compositionstart` event we cannot clear the textarea, because
		// it then forgets to ever send a `compositionend`.
		// we therefore only write the current word in the textarea
		if (selection.isEmpty()) {
			const position = selection.getStartPosition();
			const [wordAtPosition, positionOffsetInWord] = getAndroidWordAtPosition(viewModel, position);
			if (wordAtPosition.length > 0) {
				return new TextAreaState(wordAtPosition, positionOffsetInWord, positionOffsetInWord, Range.fromPositions(position), 0);
			}
		}
		return TextAreaState.EMPTY;
	}

	return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, selection, accessibilityPageSize, accessibilitySupport === AccessibilitySupport.Unknown);
}

function getAndroidWordAtPosition(viewModel: IViewModel, position: Position): [string, number] {
	const ANDROID_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:",.<>/?';
	const lineContent = viewModel.getLineContent(position.lineNumber);
	const wordSeparators = getMapForWordSeparators(ANDROID_WORD_SEPARATORS, []);

	let goingLeft = true;
	let startColumn = position.column;
	let goingRight = true;
	let endColumn = position.column;
	let distance = 0;
	while (distance < 50 && (goingLeft || goingRight)) {
		if (goingLeft && startColumn <= 1) {
			goingLeft = false;
		}
		if (goingLeft) {
			const charCode = lineContent.charCodeAt(startColumn - 2);
			const charClass = wordSeparators.get(charCode);
			if (charClass !== WordCharacterClass.Regular) {
				goingLeft = false;
			} else {
				startColumn--;
			}
		}
		if (goingRight && endColumn > lineContent.length) {
			goingRight = false;
		}
		if (goingRight) {
			const charCode = lineContent.charCodeAt(endColumn - 1);
			const charClass = wordSeparators.get(charCode);
			if (charClass !== WordCharacterClass.Regular) {
				goingRight = false;
			} else {
				endColumn++;
			}
		}
		distance++;
	}

	return [lineContent.substring(startColumn - 1, endColumn - 1), position.column - startColumn];
}

function getWordBeforePosition(viewContext: ViewContext, position: Position): string {
	const lineContent = viewContext.viewModel.getLineContent(position.lineNumber);
	const wordSeparators = getMapForWordSeparators(viewContext.configuration.options.get(EditorOption.wordSeparators), []);

	let column = position.column;
	let distance = 0;
	while (column > 1) {
		const charCode = lineContent.charCodeAt(column - 2);
		const charClass = wordSeparators.get(charCode);
		if (charClass !== WordCharacterClass.Regular || distance > 50) {
			return lineContent.substring(column - 1, position.column - 1);
		}
		distance++;
		column--;
	}
	return lineContent.substring(0, position.column - 1);
}

function getCharacterBeforePosition(viewModel: IViewModel, position: Position): string {
	if (position.column > 1) {
		const lineContent = viewModel.getLineContent(position.lineNumber);
		const charBefore = lineContent.charAt(position.column - 2);
		if (!strings.isHighSurrogate(charBefore.charCodeAt(0))) {
			return charBefore;
		}
	}
	return '';
}
