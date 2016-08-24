/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IPosition, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import strings = require('vs/base/common/strings');
import snippets = require('vs/editor/contrib/snippet/common/snippet');
import {Range} from 'vs/editor/common/core/range';
import {SnippetController} from 'vs/editor/contrib/snippet/common/snippetController';
import {ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';


import emmet = require('emmet');

interface ModeScopeMap {
    [key: string]: string;
}

let modeScopesMap: ModeScopeMap = null;

export class EditorAccessor implements emmet.Editor {

	editor: ICommonCodeEditor;
	syntaxProfiles: any;

	private _hasMadeEdits: boolean;

	emmetSupportedModes = ['html', 'razor', 'css', 'less', 'sass', 'scss', 'stylus', 'xml', 'xsl', 'jade', 'handlebars', 'ejs', 'hbs', 'jsx', 'tsx', 'erb', 'php', 'twig'];

	constructor(editor: ICommonCodeEditor, syntaxProfiles: any) {
		this.editor = editor;
		this.syntaxProfiles = syntaxProfiles;
		this._hasMadeEdits = false;
	}

	public isEmmetEnabledMode(): boolean {
		return this.emmetSupportedModes.indexOf(this.getSyntax()) !== -1;
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

	public onBeforeEmmetAction(): void {
		this._hasMadeEdits = false;
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
				startPosition = { lineNumber: startPosition.lineNumber, column: startPosition.column - match[0].length };
			} else {
				return; // ignore
			}
		}

		// If this is the first edit in this "transaction", push an undo stop before them
		if (!this._hasMadeEdits) {
			this._hasMadeEdits = true;
			this.editor.pushUndoStop();
		}

		let range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		let codeSnippet = snippets.CodeSnippet.fromEmmet(value);
		SnippetController.get(this.editor).runWithReplaceRange(codeSnippet, range);
	}

	public onAfterEmmetAction(): void {
		// If there were any edits in this "transaction", push an undo stop after them
		if (this._hasMadeEdits) {
			this.editor.pushUndoStop();
		}
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

		// user can overwrite the syntax using the emmet syntaxProfiles setting
		let profile = this.getSyntaxProfile(syntax);
		if (profile) {
			return profile;
		}

		if (/\b(razor|handlebars|erb|php|hbs|ejs|twig)\b/.test(syntax)) { // treat like html
			return 'html';
		}
		if (/\b(typescriptreact|javascriptreact)\b/.test(syntax)) { // treat like tsx like jsx
			return 'jsx';
		}
		if (syntax === 'sass-indented') { // map sass-indented to sass
			return 'sass';
		}
		syntax = this.checkParentMode(syntax);

		return syntax;
	}

	private getSyntaxProfile(syntax: string): string {
		const profile = this.syntaxProfiles[syntax];
		if (profile && typeof profile === 'string') {
			return profile;
		}
	}

	private checkParentMode(syntax: string): string {
		if (!modeScopesMap) {
			modeScopesMap = this.getModeScopeMap();
		}
		let languageGrammar = modeScopesMap[syntax];
		if (!languageGrammar) {
			return syntax;
		}
		let languages = languageGrammar.split('.');
		let thisLanguage = languages[languages.length-1];
		if (syntax !== thisLanguage || languages.length < 2) {
			return syntax;
		}
		let parentMode = languages[languages.length-2];
		if (this.emmetSupportedModes.indexOf(parentMode) !== -1) {
			return parentMode;
		}
		return syntax;
	}

	private getModeScopeMap(): ModeScopeMap {
		let map: ModeScopeMap = {};
		ExtensionsRegistry.getAllExtensionDescriptions().forEach((desc) => {
			if (desc.contributes) {
				let grammars = (<any>desc.contributes).grammars;
				if (grammars) {
					grammars.forEach((grammar) => {
						if (grammar.language && grammar.scopeName) {
							map[grammar.language] = grammar.scopeName;
						}
					});
				}
			}
		});
		return map;
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
