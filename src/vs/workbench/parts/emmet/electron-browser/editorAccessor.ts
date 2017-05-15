/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ICommonCodeEditor, Handler } from 'vs/editor/common/editorCommon';
import strings = require('vs/base/common/strings');
import snippets = require('vs/editor/contrib/snippet/common/snippet');
import { Range } from 'vs/editor/common/core/range';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';

import emmet = require('emmet');

export interface IGrammarContributions {
	getGrammar(mode: string): string;
}

export interface ILanguageIdentifierResolver {
	getLanguageIdentifier(modeId: LanguageId): LanguageIdentifier;
}

export class EditorAccessor implements emmet.Editor {

	private _languageIdentifierResolver: ILanguageIdentifierResolver;
	private _editor: ICommonCodeEditor;
	private _syntaxProfiles: any;
	private _excludedLanguages: any;
	private _grammars: IGrammarContributions;
	private _emmetActionName: string;
	private _hasMadeEdits: boolean;

	private readonly emmetSupportedModes = ['html', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl', 'svg'];

	constructor(languageIdentifierResolver: ILanguageIdentifierResolver, editor: ICommonCodeEditor, syntaxProfiles: any, excludedLanguages: String[], grammars: IGrammarContributions, emmetActionName?: string) {
		this._languageIdentifierResolver = languageIdentifierResolver;
		this._editor = editor;
		this._syntaxProfiles = syntaxProfiles;
		this._excludedLanguages = excludedLanguages;
		this._hasMadeEdits = false;
		this._grammars = grammars;
		this._emmetActionName = emmetActionName;
	}

	public getEmmetSupportedModes(): string[] {
		return this.emmetSupportedModes;
	}

	public isEmmetEnabledMode(): boolean {
		return this.emmetSupportedModes.indexOf(this.getSyntax()) !== -1;
	}

	public getSelectionRange(): emmet.Range {
		let selection = this._editor.getSelection();
		return {
			start: this.getOffsetFromPosition(selection.getStartPosition()),
			end: this.getOffsetFromPosition(selection.getEndPosition())
		};
	}

	public getCurrentLineRange(): emmet.Range {
		let currentLine = this._editor.getSelection().startLineNumber;
		return {
			start: this.getOffsetFromPosition(new Position(currentLine, 1)),
			end: this.getOffsetFromPosition(new Position(currentLine + 1, 1))
		};
	}

	public getCaretPos(): number {
		let selectionStart = this._editor.getSelection().getStartPosition();
		return this.getOffsetFromPosition(selectionStart);
	}

	public setCaretPos(pos: number): void {
		this.createSelection(pos);
	}

	public getCurrentLine(): string {
		let selectionStart = this._editor.getSelection().getStartPosition();
		return this._editor.getModel().getLineContent(selectionStart.lineNumber);
	}

	public onBeforeEmmetAction(): void {
		this._hasMadeEdits = false;
	}

	public replaceContent(value: string, start: number, end: number, no_indent: boolean): void {
		let range = this.getRangeToReplace(value, start, end);
		if (!range) {
			return;
		}

		const tweakedValue = snippets.CodeSnippet.fixEmmetFinalTabstop(value);

		// let selection define the typing range
		this._editor.setSelection(range);
		SnippetController2.get(this._editor).insert(tweakedValue);

		// let codeSnippet = snippets.CodeSnippet.fromEmmet(value);
		// SnippetController.get(this._editor).runWithReplaceRange(codeSnippet, range);
	}

	public getRangeToReplace(value: string, start: number, end: number): Range {
		//console.log('value', value);
		let startPosition = this.getPositionFromOffset(start);
		let endPosition = this.getPositionFromOffset(end);

		// test if < or </ are located before or > after the replace range. Either replace these too, or block the expansion
		var currentLine = this._editor.getModel().getLineContent(startPosition.lineNumber).substr(0, startPosition.column - 1); // content before the replaced range
		var match = currentLine.match(/<[/]?$/);
		if (match) {
			if (strings.startsWith(value, match[0])) {
				startPosition = new Position(startPosition.lineNumber, startPosition.column - match[0].length);
			} else {
				return null; // ignore
			}
		}

		// test if > is located after the replace range. Either replace these too, or block the expansion
		if (this._editor.getModel().getLineContent(endPosition.lineNumber).substr(endPosition.column - 1, endPosition.column) === '>') {
			if (strings.endsWith(value, '>')) {
				endPosition = new Position(endPosition.lineNumber, endPosition.column + 1);
			} else {
				return null; // ignore
			}
		}

		// If this is the first edit in this "transaction", push an undo stop before them
		if (!this._hasMadeEdits) {
			this._hasMadeEdits = true;
			this._editor.pushUndoStop();
		}

		let range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		let textToReplace = this._editor.getModel().getValueInRange(range);

		// During Expand Abbreviation action, if the expanded abbr is the same as the text it intends to replace,
		// then treat it as a no-op and return TAB to the editor
		if (this._emmetActionName === 'expand_abbreviation' && (value === textToReplace || value === textToReplace + '${0}')) {
			this._editor.trigger('emmet', Handler.Tab, {});
			return null;
		}

		return range;
	}

	public onAfterEmmetAction(): void {
		// If there were any edits in this "transaction", push an undo stop after them
		if (this._hasMadeEdits) {
			this._editor.pushUndoStop();
		}
	}

	public getContent(): string {
		return this._editor.getModel().getValue();
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
		this._editor.setSelection(range);
		this._editor.revealRange(range);
	}

	public getSyntax(): string {
		return this.getSyntaxInternal(true);
	}

	public getSyntaxInternal(overrideUsingProfiles: boolean): string {
		let position = this._editor.getSelection().getStartPosition();
		this._editor.getModel().forceTokenization(position.lineNumber);
		let languageId = this._editor.getModel().getLanguageIdAtPosition(position.lineNumber, position.column);
		let language = this._languageIdentifierResolver.getLanguageIdentifier(languageId).language;
		let syntax = language.split('.').pop();

		if (this._excludedLanguages.indexOf(syntax) !== -1) {
			return '';
		}

		// user can overwrite the syntax using the emmet syntaxProfiles setting
		let profile = this.getSyntaxProfile(syntax);
		if (overrideUsingProfiles && profile && this.emmetSupportedModes.indexOf(profile) !== -1) {
			return profile;
		}

		if (this.emmetSupportedModes.indexOf(syntax) !== -1) {
			return syntax;
		}

		if (/\b(typescriptreact|javascriptreact|jsx-tags)\b/.test(syntax)) { // treat tsx like jsx
			return 'jsx';
		}
		if (syntax === 'sass-indented') { // map sass-indented to sass
			return 'sass';
		}
		syntax = this.checkParentMode(syntax);

		return syntax;
	}

	private getSyntaxProfile(syntax: string): string {
		const profile = this._syntaxProfiles[syntax];
		if (profile && typeof profile === 'string') {
			return profile;
		}
		return undefined;
	}

	private checkParentMode(syntax: string): string {
		let languageGrammar = this._grammars.getGrammar(syntax);
		if (!languageGrammar) {
			return syntax;
		}
		let languages = languageGrammar.split('.');
		if (languages.length < 2) {
			return syntax;
		}
		for (let i = 1; i < languages.length; i++) {
			const language = languages[languages.length - i];
			if (this.emmetSupportedModes.indexOf(language) !== -1) {
				return language;
			}
		}
		return syntax;
	}

	// If users have created their own output profile for current syntax as described
	// http://docs.emmet.io/customization/syntax-profiles/#create-your-own-profile
	// then we return the name of this profile. Else, we send null and
	// emmet is smart enough to guess the right output profile
	public getProfileName(): string {
		let syntax = this.getSyntaxInternal(false);
		const profile = this._syntaxProfiles[syntax];
		if (profile && typeof profile !== 'string') {
			return syntax;
		}
		return null;
	}

	public prompt(title: string): any {
		//
	}

	public getSelection(): string {
		let selection = this._editor.getSelection();
		let model = this._editor.getModel();
		let start = selection.getStartPosition();
		let end = selection.getEndPosition();
		let range = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
		return model.getValueInRange(range);
	}

	public getFilePath(): string {
		return this._editor.getModel().uri.fsPath;
	}

	private getPositionFromOffset(offset: number): Position {
		return this._editor.getModel().getPositionAt(offset);
	}

	private getOffsetFromPosition(position: Position): number {
		return this._editor.getModel().getOffsetAt(position);
	}
}
