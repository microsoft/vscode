/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	window,
	workspace,
	Disposable,
	TextDocument,
	Position,
	TextEditorSelectionChangeEvent,
	Selection,
	Range,
	WorkspaceEdit
} from 'vscode';

export function activateMatchingTagPosition(
	matchingTagPositionProvider: (document: TextDocument, position: Position) => Thenable<Position | null>,
	supportedLanguages: { [id: string]: boolean },
	configName: string
): Disposable {
	let disposables: Disposable[] = [];

	window.onDidChangeTextEditorSelection(event => onDidChangeTextEditorSelection(event), null, disposables);

	let isEnabled = false;
	updateEnabledState();

	window.onDidChangeActiveTextEditor(updateEnabledState, null, disposables);

	function updateEnabledState() {
		isEnabled = false;
		let editor = window.activeTextEditor;
		if (!editor) {
			return;
		}
		let document = editor.document;
		if (!supportedLanguages[document.languageId]) {
			return;
		}
		if (!workspace.getConfiguration(undefined, document.uri).get<boolean>(configName)) {
			return;
		}
		isEnabled = true;
	}

	let prevCursors: readonly Selection[] = [];
	let cursors: readonly Selection[] = [];
	let inMirrorMode = false;

	function onDidChangeTextEditorSelection(event: TextEditorSelectionChangeEvent) {
		if (!isEnabled) {
			return;
		}

		prevCursors = cursors;
		cursors = event.selections;

		if (cursors.length === 1) {
			if (inMirrorMode && prevCursors.length === 2) {
				if (cursors[0].isEqual(prevCursors[0]) || cursors[0].isEqual(prevCursors[1])) {
					return;
				}
			}
			if (event.selections[0].isEmpty) {
				matchingTagPositionProvider(event.textEditor.document, event.selections[0].active).then(matchingTagPosition => {
					if (matchingTagPosition && window.activeTextEditor) {
						const charBeforeAndAfterPositionsRoughtlyEqual = isCharBeforeAndAfterPositionsRoughtlyEqual(
							event.textEditor.document,
							event.selections[0].anchor,
							new Position(matchingTagPosition.line, matchingTagPosition.character)
						);

						if (charBeforeAndAfterPositionsRoughtlyEqual) {
							inMirrorMode = true;
							const newCursor = new Selection(
								matchingTagPosition.line,
								matchingTagPosition.character,
								matchingTagPosition.line,
								matchingTagPosition.character
							);
							window.activeTextEditor.selections = [...window.activeTextEditor.selections, newCursor];
						}
					}
				});
			}
		}

		if (cursors.length === 2 && inMirrorMode) {
			// Check two cases
			if (event.selections[0].isEmpty && event.selections[1].isEmpty) {
				const charBeforeAndAfterPositionsRoughtlyEqual = isCharBeforeAndAfterPositionsRoughtlyEqual(
					event.textEditor.document,
					event.selections[0].anchor,
					event.selections[1].anchor
				);

				if (!charBeforeAndAfterPositionsRoughtlyEqual) {
					inMirrorMode = false;
					window.activeTextEditor!.selections = [window.activeTextEditor!.selections[0]];
					return;
				} else {
					// Need to cleanup in the case of <div |></div |>
					if (
						shouldDoCleanupForHtmlAttributeInput(
							event.textEditor.document,
							event.selections[0].anchor,
							event.selections[1].anchor
						)
					) {
						inMirrorMode = false;
						const cleanupEdit = new WorkspaceEdit();
						const cleanupRange = new Range(event.selections[1].anchor.translate(0, -1), event.selections[1].anchor);
						cleanupEdit.replace(event.textEditor.document.uri, cleanupRange, '');
						window.activeTextEditor!.selections = [window.activeTextEditor!.selections[0]];
						workspace.applyEdit(cleanupEdit);
					}
				}
			}
		}
	}

	return Disposable.from(...disposables);
}

function getCharBefore(document: TextDocument, position: Position) {
	const offset = document.offsetAt(position);
	if (offset === 0) {
		return '';
	}

	return document.getText(new Range(document.positionAt(offset - 1), position));
}

function getCharAfter(document: TextDocument, position: Position) {
	const offset = document.offsetAt(position);
	if (offset === document.getText().length) {
		return '';
	}

	return document.getText(new Range(position, document.positionAt(offset + 1)));
}

// Check if chars before and after the two positions are equal
// For the chars before, `<` and `/` are consiered equal to handle the case of `<|></|>`
function isCharBeforeAndAfterPositionsRoughtlyEqual(document: TextDocument, firstPos: Position, secondPos: Position) {
	const charBeforePrimarySelection = getCharBefore(document, firstPos);
	const charAfterPrimarySelection = getCharAfter(document, firstPos);
	const charBeforeSecondarySelection = getCharBefore(document, secondPos);
	const charAfterSecondarySelection = getCharAfter(document, secondPos);

	// Exit mirror mode when cursor position no longer mirror
	// Unless it's in the case of `<|></|>`
	const charBeforeBothPositionRoughlyEqual =
		charBeforePrimarySelection === charBeforeSecondarySelection ||
		(charBeforePrimarySelection === '/' && charBeforeSecondarySelection === '<') ||
		(charBeforeSecondarySelection === '/' && charBeforePrimarySelection === '<');
	const charAfterBothPositionRoughlyEqual =
		charAfterPrimarySelection === charAfterSecondarySelection ||
		(charAfterPrimarySelection === ' ' && charAfterSecondarySelection === '>') ||
		(charAfterSecondarySelection === ' ' && charAfterPrimarySelection === '>');

	return charBeforeBothPositionRoughlyEqual && charAfterBothPositionRoughlyEqual;
}

function shouldDoCleanupForHtmlAttributeInput(document: TextDocument, firstPos: Position, secondPos: Position) {
	// Need to cleanup in the case of <div |></div |>
	const charBeforePrimarySelection = getCharBefore(document, firstPos);
	const charAfterPrimarySelection = getCharAfter(document, firstPos);
	const charBeforeSecondarySelection = getCharBefore(document, secondPos);
	const charAfterSecondarySelection = getCharAfter(document, secondPos);

	const primaryBeforeSecondary = document.offsetAt(firstPos) < document.offsetAt(secondPos);

	return (
		primaryBeforeSecondary &&
		charBeforePrimarySelection === ' ' &&
		charAfterPrimarySelection === '>' &&
		charBeforeSecondarySelection === ' ' &&
		charAfterSecondarySelection === '>'
	);
}
