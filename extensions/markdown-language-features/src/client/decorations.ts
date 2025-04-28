/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { IMdParser } from '../markdownEngine';


export class MarkdownDecorationManager {
	// Heading decorations for levels 1-6
	private readonly _headingDecorationTypes: vscode.TextEditorDecorationType[] = [
		vscode.window.createTextEditorDecorationType({ lineHeight: 80 }), // h1
		vscode.window.createTextEditorDecorationType({ lineHeight: 70 }), // h2
		vscode.window.createTextEditorDecorationType({ lineHeight: 60 }), // h3
		vscode.window.createTextEditorDecorationType({ lineHeight: 50 }), // h4
		vscode.window.createTextEditorDecorationType({ lineHeight: 40 }), // h5
		vscode.window.createTextEditorDecorationType({ lineHeight: 30 }), // h6
	];
	private readonly _listDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 30 });
	private readonly _codeBlockDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 30 });

	constructor(
		private readonly _parser: IMdParser
	) {
		vscode.window.onDidChangeVisibleTextEditors(e => {
			e.forEach(async editor => {
				this.setDecorations(editor);
			});
		});
		vscode.window.visibleTextEditors.forEach(async editor => {
			this.setDecorations(editor);
		});
		vscode.workspace.onDidChangeTextDocument(_ => {
			const activeTextEditor = vscode.window.activeTextEditor;
			if (!activeTextEditor) {
				return;
			}
			this.setDecorations(activeTextEditor);
		});
	}

	async setDecorations(editor: vscode.TextEditor): Promise<void> {
		if (editor.document.languageId !== 'markdown') {
			return;
		}
		const document = editor.document;
		const result = await this._parser.tokenize(document);
		if (!result.length) {
			return;
		}

		// Collect ranges for headings by level, lists, and code block fences
		const headingRangesByLevel: vscode.Range[][] = [[], [], [], [], [], []]; // h1-h6
		const listRanges: vscode.Range[] = [];
		const codeBlockRanges: vscode.Range[] = [];

		for (const token of result) {
			// Headings: type === 'heading_open', map gives [start, end], use token.level (1-6)
			if (token.type === 'heading_open' && token.map && /^h[1-6]$/.test(token.tag)) {
				const level = parseInt(token.tag.charAt(1), 10); // 1-6
				if (level >= 1 && level <= 6) {
					headingRangesByLevel[level - 1].push(new vscode.Range(token.map[0], 0, token.map[0], Infinity));
				}
			}

			// Lists: type === 'bullet_list_open' or 'ordered_list_open', map gives [start, end]
			if ((token.type === 'bullet_list_open' || token.type === 'ordered_list_open') && token.map) {
				for (let line = token.map[0]; line < token.map[1]; line++) {
					listRanges.push(new vscode.Range(line, 0, line, Infinity));
				}
			}

			// Code blocks: type === 'fence', map gives [start, end], but only decorate the fence lines
			if (token.type === 'fence' && token.map) {
				const startLine = token.map[0];
				const endLine = token.map[1] - 1;
				codeBlockRanges.push(new vscode.Range(startLine, 0, startLine, Infinity));
				if (endLine > startLine) {
					codeBlockRanges.push(new vscode.Range(endLine, 0, endLine, Infinity));
				}
			}
		}

		// Apply heading decorations by level
		for (let i = 0; i < this._headingDecorationTypes.length; i++) {
			editor.setDecorations(this._headingDecorationTypes[i], headingRangesByLevel[i]);
		}
		editor.setDecorations(this._listDecorationType, listRanges);
		editor.setDecorations(this._codeBlockDecorationType, codeBlockRanges);
	}
}
