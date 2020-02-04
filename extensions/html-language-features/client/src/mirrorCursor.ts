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

export function activateMirrorCursor(
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

		if (event.textEditor.document?.languageId !== 'html' && event.textEditor.document?.languageId !== 'handlebars') {
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
						const charBeforeAndAfterPositionsRoughlyEqual = isCharBeforeAndAfterPositionsRoughlyEqual(
							event.textEditor.document,
							event.selections[0].anchor,
							new Position(matchingTagPosition.line, matchingTagPosition.character)
						);

						if (charBeforeAndAfterPositionsRoughlyEqual) {
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

		const exitMirrorMode = () => {
			inMirrorMode = false;
			window.activeTextEditor!.selections = [window.activeTextEditor!.selections[0]];
		};

		if (cursors.length === 2 && inMirrorMode) {
			/**
			 * Both cursors are positions
			 */
			if (event.selections[0].isEmpty && event.selections[1].isEmpty) {
				if (
					prevCursors.length === 2 &&
					event.selections[0].anchor.line !== prevCursors[0].anchor.line &&
					event.selections[1].anchor.line !== prevCursors[0].anchor.line
				) {
					exitMirrorMode();
					return;
				}

				const charBeforeAndAfterPositionsRoughlyEqual = isCharBeforeAndAfterPositionsRoughlyEqual(
					event.textEditor.document,
					event.selections[0].anchor,
					event.selections[1].anchor
				);

				if (!charBeforeAndAfterPositionsRoughlyEqual) {
					exitMirrorMode();
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
						const cleanupEdit = new WorkspaceEdit();
						const cleanupRange = new Range(event.selections[1].anchor.translate(0, -1), event.selections[1].anchor);
						cleanupEdit.replace(event.textEditor.document.uri, cleanupRange, '');
						exitMirrorMode();
						workspace.applyEdit(cleanupEdit);
					}
				}
			} else {
				/**
				 * Both cursors are selections
				 */
				const charBeforeAndAfterAnchorPositionsRoughlyEqual = isCharBeforeAndAfterPositionsRoughlyEqual(
					event.textEditor.document,
					event.selections[0].anchor,
					event.selections[1].anchor
				);

				const charBeforeAndAfterActivePositionsRoughlyEqual = isCharBeforeAndAfterPositionsRoughlyEqual(
					event.textEditor.document,
					event.selections[0].active,
					event.selections[1].active
				);

				if (!charBeforeAndAfterAnchorPositionsRoughlyEqual || !charBeforeAndAfterActivePositionsRoughlyEqual) {
					exitMirrorMode();
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
// For the chars before, `<` and `/` are considered equal to handle the case of `<|></|>`
function isCharBeforeAndAfterPositionsRoughlyEqual(document: TextDocument, firstPos: Position, secondPos: Position) {
	const charBeforePrimarySelection = getCharBefore(document, firstPos);
	const charAfterPrimarySelection = getCharAfter(document, firstPos);
	const charBeforeSecondarySelection = getCharBefore(document, secondPos);
	const charAfterSecondarySelection = getCharAfter(document, secondPos);

	/**
	 * Special case for exiting
	 * |<div>
	 * |</div>
	 */
	if (
		charBeforePrimarySelection === ' ' &&
		charBeforeSecondarySelection === ' ' &&
		charAfterPrimarySelection === '<' &&
		charAfterSecondarySelection === '<'
	) {
		return false;
	}
	/**
	 * Special case for exiting
	 * |  <div>
	 * |  </div>
	 */
	if (charBeforePrimarySelection === '\n' && charBeforeSecondarySelection === '\n') {
		return false;
	}
	/**
	 * Special case for exiting
	 * <div>|
	 * </div>|
	 */
	if (charAfterPrimarySelection === '\n' && charAfterSecondarySelection === '\n') {
		return false;
	}

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

	/**
	 * Check two cases
	 * <div |></div >
	 * <div | id="a"></div >
	 * Before 1st cursor: ` `
	 * After  1st cursor: `>` or ` `
	 * Before 2nd cursor: ` `
	 * After  2nd cursor: `>`
	 */
	return (
		primaryBeforeSecondary &&
		charBeforePrimarySelection === ' ' &&
		(charAfterPrimarySelection === '>' || charAfterPrimarySelection === ' ') &&
		charBeforeSecondarySelection === ' ' &&
		charAfterSecondarySelection === '>'
	);
}
