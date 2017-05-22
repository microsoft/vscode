/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as interfaces from './interfaces';
import * as vscode from 'vscode';

export class DocumentMergeConflict implements interfaces.IDocumentMergeConflict {

	public range: vscode.Range;
	public current: interfaces.IMergeRegion;
	public incoming: interfaces.IMergeRegion;
	public splitter: vscode.Range;

	constructor(document: vscode.TextDocument, descriptor: interfaces.IDocumentMergeConflictDescriptor) {
		this.range = descriptor.range;
		this.current = descriptor.current;
		this.incoming = descriptor.incoming;
		this.splitter = descriptor.splitter;
	}

	public commitEdit(type: interfaces.CommitType, editor: vscode.TextEditor, edit?: vscode.TextEditorEdit): Thenable<boolean> {

		if (edit) {

			this.applyEdit(type, editor, edit);
			return Promise.resolve(true);
		};

		return editor.edit((edit) => this.applyEdit(type, editor, edit));
	}

	public applyEdit(type: interfaces.CommitType, editor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {

		// Each conflict is a set of ranges as follows, note placements or newlines
		// which may not in in spans
		// [ Conflict Range             -- (Entire content below)
		//   [ Current Header ]\n       -- >>>>> Header
		//   [ Current Content ]        -- (content)
		//   [ Splitter ]\n             -- =====
		//   [ Incoming Content ]       -- (content)
		//   [ Incoming Header ]\n      -- <<<<< Incoming
		// ]
		if (type === interfaces.CommitType.Current) {
			// Replace [ Conflict Range ] with [ Current Content ]
			let content = editor.document.getText(this.current.content);
			this.replaceRangeWithContent(content, edit);
		}
		else if (type === interfaces.CommitType.Incoming) {
			let content = editor.document.getText(this.incoming.content);
			this.replaceRangeWithContent(content, edit);
		}
		else if (type === interfaces.CommitType.Both) {
			// Replace [ Conflict Range ] with [ Current Content ] + \n + [ Incoming Content ]
			//
			// NOTE: Due to headers and splitters NOT covering \n (this is so newlines inserted)
			// by the user after (e.g. <<<<< HEAD do not fall into the header range but the
			// content ranges), we can't push 3x deletes, we need to replace the range with the
			// union of the content.

			const currentContent = editor.document.getText(this.current.content);
			const incomingContent = editor.document.getText(this.incoming.content);

			let finalContent = '';

			if (!this.isNewlineOnly(currentContent)) {
				finalContent += currentContent;
			}

			if (!this.isNewlineOnly(incomingContent)) {
				if (finalContent.length > 0) {
					finalContent += '\n';
				}

				finalContent += incomingContent;
			}

			if (finalContent.length > 0 && !this.isNewlineOnly(finalContent)) {
				finalContent += '\n';
			}

			edit.setEndOfLine(vscode.EndOfLine.LF);
			edit.replace(this.range, finalContent);
		}
	}

	private replaceRangeWithContent(content: string, edit: vscode.TextEditorEdit) {
		if (this.isNewlineOnly(content)) {
			edit.replace(this.range, '');
			return;
		}

		let updatedContent = content.concat('\n');
		edit.setEndOfLine(vscode.EndOfLine.LF);

		// Replace [ Conflict Range ] with [ Current Content ]

		edit.replace(this.range, updatedContent);
	}

	private isNewlineOnly(text: string) {
		return text === '\n' || text === '\r\n';
	}
}