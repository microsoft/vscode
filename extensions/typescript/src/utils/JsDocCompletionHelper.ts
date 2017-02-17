/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TextEditor, Position, Range, Selection } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';

import { FileLocationRequestArgs, DocCommandTemplateResponse } from '../protocol';

export default class JsDocCompletionHelper {

	constructor(
		private client: ITypescriptServiceClient,
	) { }

	public tryCompleteJsDoc(editor: TextEditor, position: Position): Thenable<boolean> {
		const file = this.client.normalizePath(editor.document.uri);
		if (!file) {
			return Promise.resolve(false);
		}

		const line = editor.document.lineAt(position.line).text;

		// Ensure line starts with '/**' then cursor
		const prefix = line.slice(0, position.character).match(/^\s*(\/\*\*+)$/);
		if (!prefix) {
			return Promise.resolve(false);
		}

		// Ensure there is no content after the cursor besides possibly the end of the comment
		const suffix = line.slice(position.character).match(/^\s*\**\/?$/);
		if (!suffix) {
			return Promise.resolve(false);
		}

		const start = position.translate(0, -prefix[1].length);
		return editor.edit(
			edits => {
				edits.delete(new Range(start, new Position(start.line, line.length)));
			}, {
				undoStopBefore: true,
				undoStopAfter: false
			}
		).then(removedComment => {
			if (!removedComment) {
				// Edit failed, nothing to revert.
				return false;
			}

			const args: FileLocationRequestArgs = {
				file: file,
				line: start.line + 1,
				offset: start.character + 1
			};

			return Promise.race([
				this.client.execute('docCommentTemplate', args),
				new Promise((_, reject) => {
					setTimeout(reject, 250);
				})
			]).then((res: DocCommandTemplateResponse) => {
				if (!res || !res.body) {
					return false;
				}
				const commentText = res.body.newText;
				return editor.edit(
					edits => edits.insert(start, commentText),
					{ undoStopBefore: false, undoStopAfter: true });
			}, () => {
				return false;
			}).then(didInsertComment => {
				if (didInsertComment) {
					const newCursorPosition = new Position(start.line + 1, editor.document.lineAt(start.line + 1).text.length);
					editor.selection = new Selection(newCursorPosition, newCursorPosition);
					return true;
				}

				// Revert to the original line content and restore position
				return editor.edit(
					edits => {
						edits.insert(start, prefix[1] + suffix[0]);
					}, {
						undoStopBefore: false,
						undoStopAfter: true
					}
				).then(() => {
					editor.selection = new Selection(position, position);
					return false;
				});
			});
		});
	}
}