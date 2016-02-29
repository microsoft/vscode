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

	lineStarts: number[] = null;

	emmetSupportedModes = ['html', 'razor', 'css', 'less', 'scss', 'xml', 'xsl', 'jade', 'handlebars', 'hbs', 'jsx', 'tsx', 'erb', 'php', 'twig'];

	constructor(editor: ICommonCodeEditor) {
		this.editor = editor;
	}

	public noExpansionOccurred(): void {
		// return the tab key handling back to the editor
		this.editor.trigger('emmet', Handler.Tab, {});
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
		let lineStarts = this.getLineStarts();
		let start = lineStarts[currentLine - 1];
		let end = lineStarts[currentLine];
		return {
			start: start,
			end: end
		};
	}

	public getCaretPos(): number {
		let selectionStart = this.editor.getSelection().getStartPosition();
		return this.getOffsetFromPosition(selectionStart);
	}

	public setCaretPos(pos: number): void {
		//
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
		var currentLine = this.editor.getModel().getLineContent(startPosition.lineNumber).substr(0, startPosition.column); // cpontent before the replaced range
		var match = currentLine.match(/<[/]?$/);
		if (match) {
			if (strings.startsWith(value, match[0])) {
				startPosition = { lineNumber: startPosition.lineNumber, column: startPosition.column - match[0].length };
			} else {
				return; // ignore
			}
		}

		// shift column by +1 since they are 1 based
		let range = new Range(startPosition.lineNumber, startPosition.column + 1, endPosition.lineNumber, endPosition.column + 1);
		let deletePreviousChars = 0;

		if (range.startLineNumber === range.endLineNumber) {
			// The snippet will delete
			deletePreviousChars = range.endColumn - range.startColumn;
		} else {
			// We must manually delete
			let command = new ReplaceCommand(range, '');
			this.editor.executeCommand('emmet', command);
			deletePreviousChars = 0;
		}

		let snippet = snippets.CodeSnippet.convertExternalSnippet(value, snippets.ExternalSnippetType.EmmetSnippet);
		let codeSnippet = new snippets.CodeSnippet(snippet);
		snippets.getSnippetController(this.editor).run(codeSnippet, deletePreviousChars, 0);
	}

	public getContent(): string {
		return this.editor.getModel().getValue();
	}

	public createSelection(start: number, end: number): void {
		//
	}

	public getSyntax(): string {
		let position = this.editor.getSelection().getStartPosition();
		let mode = this.editor.getModel().getModeAtPosition(position.lineNumber, position.column);
		let syntax = mode.getId().split('.').pop();
		if (/\b(razor|handlebars|erb|php|hbs|twig)\b/.test(syntax)) { // treat like html
			return 'html';
		}
		if (/\b(typescriptreact|javascriptreact)\b/.test(syntax)) { // treat like tsx like jsx
			return 'jsx';
		}
		if (syntax === 'sass') { // sass is really sccs... map it to scss
			return'scss';
		}
		return syntax;
	}

	public getProfileName(): string {
		return null;
	}

	public prompt(title: string): void {
		//
	}

	public getSelection(): string {
		return '';
	}

	public getFilePath(): string {
		return '';
	}

	public flushCache(): void {
		this.lineStarts = null;
	}

	private getPositionFromOffset(offset: number): IPosition {
		let lineStarts = this.getLineStarts();
		let low = 0;
		let high = lineStarts.length - 1;
		let mid: number;

		while (low <= high) {
			mid = low + ((high - low) / 2) | 0;

			if (lineStarts[mid] > offset) {
				high = mid - 1;
			} else {
				low = mid + 1;
			}
		}
		return {
			lineNumber: low,
			column: offset - lineStarts[low - 1]
		};
	}

	private getOffsetFromPosition(position: IPosition): number {
		let lineStarts = this.getLineStarts();
		return lineStarts[position.lineNumber - 1] + position.column - 1;
	}

	private getLineStarts(): number[] {
		if (this.lineStarts === null) {
			this.lineStarts = this.computeLineStarts();
		}
		return this.lineStarts;
	}

	private computeLineStarts(): number[] {
		let value = this.editor.getModel().getValue();
		return strings.computeLineStarts(value);
	}
}
