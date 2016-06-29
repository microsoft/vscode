/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IPosition, Handler, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import strings = require('vs/base/common/strings');
import snippets = require('vs/editor/contrib/snippet/common/snippet');
import {Range} from 'vs/editor/common/core/range';
import {ReplaceCommand} from 'vs/editor/common/commands/replaceCommand';

import emmet = require('emmet');

export class EditorAccessor implements emmet.Editor {

	editor: ICommonCodeEditor;

	emmetSupportedModes = ['html', 'razor', 'css', 'less', 'sass', 'scss', 'stylus', 'xml', 'xsl', 'jade', 'handlebars', 'ejs', 'hbs', 'jsx', 'tsx', 'erb', 'php', 'twig'];

	constructor(editor: ICommonCodeEditor) {
		this.editor = editor;
	}

	public noExpansionOccurred(actionId?: string): void {
		// return the tab key handling back to the editor only for Expand Abbreviation command
		if (actionId === 'editor.emmet.action.expandAbbreviation') {
			this.editor.trigger('emmet', Handler.Tab, {});
		}
	}

	public isEmmetEnabledMode(): boolean {
		let syntax = this.getSyntax();
		return (this.emmetSupportedModes.indexOf(syntax) !== -1);
	}

	public getSelectionRange(): emmet.Range {
		let selection = this.editor.getSelection();
		return {
			start: this.getOffsetFromPosition(selection.getStartPosition()),
			end: this.getOffsetFromPosition(selection.getEndPosition())
		};
	}

	public getCurrentLineRange(): emmet.Range {
		let currentLine = this.editor.getSelection().startLineNumber;
		return {
			start: this.getOffsetFromPosition({ lineNumber: currentLine, column: 1 }),
			end: this.getOffsetFromPosition({ lineNumber: currentLine + 1, column: 1 })
		};
	}

	public getCaretPos(): number {
		let selectionStart = this.editor.getSelection().getStartPosition();
		return this.getOffsetFromPosition(selectionStart);
	}

	public setCaretPos(pos: number): void {
		this.createSelection(pos);
	}

	public getCurrentLine(): string {
		let selectionStart = this.editor.getSelection().getStartPosition();
		return this.editor.getModel().getLineContent(selectionStart.lineNumber);
	}

	public replaceContent(value: string, start: number, end: number, no_indent: boolean): void {
		//console.log('value', value);
		let startPosition = this.getPositionFromOffset(start);
		let endPosition = this.getPositionFromOffset(end);

		// test if < or </ are located before the replace range. Either replace these too, or block the expansion
		var currentLine = this.editor.getModel().getLineContent(startPosition.lineNumber).substr(0, startPosition.column - 1); // content before the replaced range
		var match = currentLine.match(/<[/]?$/);
		if (match) {
			if (strings.startsWith(value, match[0])) {
				startPosition = { lineNumber: startPosition.lineNumber, column: startPosition.column - 1 - match[0].length };
			} else {
				return; // ignore
			}
		}

		// shift column by +1 since they are 1 based
		let range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);

		let command = new ReplaceCommand(range, '');
		this.editor.executeCommand('emmet', command);

		let snippet = snippets.CodeSnippet.convertExternalSnippet(value, snippets.ExternalSnippetType.EmmetSnippet);
		let codeSnippet = new snippets.CodeSnippet(snippet);
		snippets.getSnippetController(this.editor).run(codeSnippet, 0, 0, false);
	}

	public getContent(): string {
		return this.editor.getModel().getValue();
	}

	public createSelection(startOffset: number, endOffset?: number): void {
		let startPosition = this.getPositionFromOffset(startOffset);
		let endPosition = null;
		if (!endOffset) {
			endPosition = startPosition;
		} else {
			endPosition = this.getPositionFromOffset(endOffset);
		}
		let range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		this.editor.setSelection(range);
		this.editor.revealRange(range);
	}

	public getSyntax(): string {
		let position = this.editor.getSelection().getStartPosition();
		let modeId = this.editor.getModel().getModeIdAtPosition(position.lineNumber, position.column);
		let syntax = modeId.split('.').pop();
		if (/\b(razor|handlebars|erb|php|hbs|ejs|twig)\b/.test(syntax)) { // treat like html
			return 'html';
		}
		if (/\b(typescriptreact|javascriptreact)\b/.test(syntax)) { // treat like tsx like jsx
			return 'jsx';
		}
		if (syntax === 'sass-indented') { // map sass-indented to sass
			return 'sass';
		}
		return syntax;
	}

	public getProfileName(): string {
		return null;
	}

	public prompt(title: string): any {
		//
	}

	public getSelection(): string {
		let selection = this.editor.getSelection();
		let model = this.editor.getModel();
		let start = selection.getStartPosition();
		let end = selection.getEndPosition();
		let range = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
		return model.getValueInRange(range);
	}

	public getFilePath(): string {
		return this.editor.getModel().uri.fsPath;
	}

	private getPositionFromOffset(offset: number): IPosition {
		return this.editor.getModel().getPositionAt(offset);
	}

	private getOffsetFromPosition(position: IPosition): number {
		return this.editor.getModel().getOffsetAt(position);
	}
}
