/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Easter egg: typing "uuddlrlrba" (the Konami code using letter keys)
 * anywhere in the editor triggers a Silicon Valley reference notification.
 *
 * Also available via the command palette as "Anton: Konami Code".
 *
 * The listener watches document edits and maintains a rolling buffer of
 * recent characters. It does not interfere with normal editing — characters
 * still appear in the document as typed.
 */
const KONAMI_STRING = 'uuddlrlrba';

export class KonamiCode implements vscode.Disposable {
	private buffer = '';
	private readonly disposables: vscode.Disposable[] = [];

	constructor() {
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(event => {
				for (const change of event.contentChanges) {
					if (change.text.length === 1) {
						this.buffer += change.text.toLowerCase();
						// Keep the buffer at a reasonable length
						if (this.buffer.length > KONAMI_STRING.length) {
							this.buffer = this.buffer.slice(-KONAMI_STRING.length);
						}
						if (this.buffer === KONAMI_STRING) {
							this.buffer = '';
							this.trigger();
						}
					} else {
						// Multi-character insert (paste, autocomplete) resets the buffer
						this.buffer = '';
					}
				}
			})
		);

		this.disposables.push(
			vscode.commands.registerCommand('sota.konami', () => this.trigger())
		);
	}

	private trigger(): void {
		vscode.window.showInformationMessage('This guy fucks.');
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
