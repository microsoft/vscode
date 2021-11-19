/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, workspace, Disposable, TextDocument, Position, SnippetString, TextDocumentChangeEvent, TextDocumentChangeReason } from 'vscode';
import { Runtime } from './htmlClient';

export function activateTagClosing(tagProvider: (document: TextDocument, position: Position) => Thenable<string>, supportedLanguages: { [id: string]: boolean }, configName: string, runtime: Runtime): Disposable {

	const disposables: Disposable[] = [];
	workspace.onDidChangeTextDocument(onDidChangeTextDocument, null, disposables);

	let isEnabled = false;
	updateEnabledState();
	window.onDidChangeActiveTextEditor(updateEnabledState, null, disposables);

	let timeout: Disposable | undefined = undefined;

	disposables.push({
		dispose: () => {
			timeout?.dispose();
		}
	});

	function updateEnabledState() {
		isEnabled = false;
		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}
		const document = editor.document;
		if (!supportedLanguages[document.languageId]) {
			return;
		}
		if (!workspace.getConfiguration(undefined, document.uri).get<boolean>(configName)) {
			return;
		}
		isEnabled = true;
	}

	function onDidChangeTextDocument({ document, contentChanges, reason }: TextDocumentChangeEvent) {
		if (!isEnabled || contentChanges.length === 0 || reason === TextDocumentChangeReason.Undo || reason === TextDocumentChangeReason.Redo) {
			return;
		}
		const activeDocument = window.activeTextEditor && window.activeTextEditor.document;
		if (document !== activeDocument) {
			return;
		}
		if (timeout) {
			timeout.dispose();
		}

		const lastChange = contentChanges[contentChanges.length - 1];
		const lastCharacter = lastChange.text[lastChange.text.length - 1];
		if (lastChange.rangeLength > 0 || lastCharacter !== '>' && lastCharacter !== '/') {
			return;
		}
		const rangeStart = lastChange.range.start;
		const version = document.version;
		timeout = runtime.timer.setTimeout(() => {
			const position = new Position(rangeStart.line, rangeStart.character + lastChange.text.length);
			tagProvider(document, position).then(text => {
				if (text && isEnabled) {
					const activeEditor = window.activeTextEditor;
					if (activeEditor) {
						const activeDocument = activeEditor.document;
						if (document === activeDocument && activeDocument.version === version) {
							const selections = activeEditor.selections;
							if (selections.length && selections.some(s => s.active.isEqual(position))) {
								activeEditor.insertSnippet(new SnippetString(text), selections.map(s => s.active));
							} else {
								activeEditor.insertSnippet(new SnippetString(text), position);
							}
						}
					}
				}
			});
			timeout = undefined;
		}, 100);
	}
	return Disposable.from(...disposables);
}
