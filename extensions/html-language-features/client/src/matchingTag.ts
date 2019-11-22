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

	// let prevCursorCount = 0;
	let cursorCount = 0;
	let inMirrorMode = false;

	function onDidChangeTextEditorSelection(event: TextEditorSelectionChangeEvent) {
		if (!isEnabled) {
			return;
		}

		// prevCursorCount = cursorCount;
		cursorCount = event.selections.length;

		if (cursorCount === 1) {
			if (event.selections[0].isEmpty) {
				matchingTagPositionProvider(event.textEditor.document, event.selections[0].active).then(position => {
					if (position && window.activeTextEditor) {
						inMirrorMode = true;
						const newCursor = new Selection(position.line, position.character, position.line, position.character);
						window.activeTextEditor.selections = [...window.activeTextEditor.selections, newCursor];
					}
				});
			}
		}

		if (cursorCount === 2 && inMirrorMode) {
			// Check two cases
			if (event.selections[0].isEmpty && event.selections[1].isEmpty) {
				const charBeforePrimarySelection = getCharBefore(event.textEditor.document, event.selections[0].anchor);
				const charAfterPrimarySelection = getCharAfter(event.textEditor.document, event.selections[0].anchor);
				const charBeforeSecondarySelection = getCharBefore(event.textEditor.document, event.selections[1].anchor);
				const charAfterSecondarySelection = getCharAfter(event.textEditor.document, event.selections[1].anchor);

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

				if (!charBeforeBothPositionRoughlyEqual || !charAfterBothPositionRoughlyEqual) {
					inMirrorMode = false;
					window.activeTextEditor!.selections = [window.activeTextEditor!.selections[0]];
					return;
				} else {
					// Need to cleanup in the case of <div |></div |>
					if (
						charBeforePrimarySelection === ' ' &&
						charAfterPrimarySelection === '>' &&
						charBeforeSecondarySelection === ' ' &&
						charAfterSecondarySelection === '>'
					) {
						const primaryBeforeSecondary =
							event.textEditor.document.offsetAt(event.selections[0].anchor) <
							event.textEditor.document.offsetAt(event.selections[1].anchor);

						if (primaryBeforeSecondary) {
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
