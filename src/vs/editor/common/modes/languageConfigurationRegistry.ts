/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CharacterPairSupport } from 'vs/editor/common/modes/supports/characterPair';
import { BracketElectricCharacterSupport, IElectricAction } from 'vs/editor/common/modes/supports/electricCharacter';
import { IOnEnterSupportOptions, OnEnterSupport } from 'vs/editor/common/modes/supports/onEnter';
import { RichEditBrackets } from 'vs/editor/common/modes/supports/richEditBrackets';
import Event, { Emitter } from 'vs/base/common/event';
import { ITokenizedModel } from 'vs/editor/common/editorCommon';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import { IDisposable } from 'vs/base/common/lifecycle';
import { DEFAULT_WORD_REGEXP, ensureValidWordDefinition } from 'vs/editor/common/model/wordHelper';
import { createScopedLineTokens } from 'vs/editor/common/modes/supports';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Range } from 'vs/editor/common/core/range';
import { IndentAction, EnterAction, IAutoClosingPair, LanguageConfiguration, IndentationRule } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageIdentifier, LanguageId } from 'vs/editor/common/modes';

/**
 * Interface used to support insertion of mode specific comments.
 */
export interface ICommentsConfiguration {
	lineCommentToken?: string;
	blockCommentStartToken?: string;
	blockCommentEndToken?: string;
}

export class RichEditSupport {

	private readonly _conf: LanguageConfiguration;

	public readonly electricCharacter: BracketElectricCharacterSupport;
	public readonly comments: ICommentsConfiguration;
	public readonly characterPair: CharacterPairSupport;
	public readonly wordDefinition: RegExp;
	public readonly onEnter: OnEnterSupport;
	public readonly brackets: RichEditBrackets;
	public readonly indentationRules: IndentationRule;

	constructor(languageIdentifier: LanguageIdentifier, previous: RichEditSupport, rawConf: LanguageConfiguration) {

		let prev: LanguageConfiguration = null;
		if (previous) {
			prev = previous._conf;
		}

		this._conf = RichEditSupport._mergeConf(prev, rawConf);

		if (this._conf.brackets) {
			this.brackets = new RichEditBrackets(languageIdentifier, this._conf.brackets);
		}

		this.onEnter = RichEditSupport._handleOnEnter(this._conf);

		this.comments = RichEditSupport._handleComments(this._conf);

		this.characterPair = new CharacterPairSupport(this._conf);
		this.electricCharacter = new BracketElectricCharacterSupport(this.brackets, this.characterPair.getAutoClosingPairs(), this._conf.__electricCharacterSupport);

		this.wordDefinition = this._conf.wordPattern || DEFAULT_WORD_REGEXP;

		this.indentationRules = this._conf.indentationRules;
	}

	private static _mergeConf(prev: LanguageConfiguration, current: LanguageConfiguration): LanguageConfiguration {
		return {
			comments: (prev ? current.comments || prev.comments : current.comments),
			brackets: (prev ? current.brackets || prev.brackets : current.brackets),
			wordPattern: (prev ? current.wordPattern || prev.wordPattern : current.wordPattern),
			indentationRules: (prev ? current.indentationRules || prev.indentationRules : current.indentationRules),
			onEnterRules: (prev ? current.onEnterRules || prev.onEnterRules : current.onEnterRules),
			autoClosingPairs: (prev ? current.autoClosingPairs || prev.autoClosingPairs : current.autoClosingPairs),
			surroundingPairs: (prev ? current.surroundingPairs || prev.surroundingPairs : current.surroundingPairs),
			__electricCharacterSupport: (prev ? current.__electricCharacterSupport || prev.__electricCharacterSupport : current.__electricCharacterSupport),
		};
	}

	private static _handleOnEnter(conf: LanguageConfiguration): OnEnterSupport {
		// on enter
		let onEnter: IOnEnterSupportOptions = {};
		let empty = true;

		if (conf.brackets) {
			empty = false;
			onEnter.brackets = conf.brackets;
		}
		if (conf.indentationRules) {
			empty = false;
			onEnter.indentationRules = conf.indentationRules;
		}
		if (conf.onEnterRules) {
			empty = false;
			onEnter.regExpRules = conf.onEnterRules;
		}

		if (!empty) {
			return new OnEnterSupport(onEnter);
		}
		return null;
	}

	private static _handleComments(conf: LanguageConfiguration): ICommentsConfiguration {
		let commentRule = conf.comments;
		if (!commentRule) {
			return null;
		}

		// comment configuration
		let comments: ICommentsConfiguration = {};

		if (commentRule.lineComment) {
			comments.lineCommentToken = commentRule.lineComment;
		}
		if (commentRule.blockComment) {
			let [blockStart, blockEnd] = commentRule.blockComment;
			comments.blockCommentStartToken = blockStart;
			comments.blockCommentEndToken = blockEnd;
		}

		return comments;
	}
}

export class LanguageConfigurationRegistryImpl {

	private _entries: RichEditSupport[];

	private _onDidChange: Emitter<void> = new Emitter<void>();
	public onDidChange: Event<void> = this._onDidChange.event;

	constructor() {
		this._entries = [];
	}

	public register(languageIdentifier: LanguageIdentifier, configuration: LanguageConfiguration): IDisposable {
		let previous = this._getRichEditSupport(languageIdentifier.id);
		let current = new RichEditSupport(languageIdentifier, previous, configuration);
		this._entries[languageIdentifier.id] = current;
		this._onDidChange.fire(void 0);
		return {
			dispose: () => {
				if (this._entries[languageIdentifier.id] === current) {
					this._entries[languageIdentifier.id] = previous;
					this._onDidChange.fire(void 0);
				}
			}
		};
	}

	private _getRichEditSupport(languageId: LanguageId): RichEditSupport {
		return this._entries[languageId] || null;
	}

	public getIndentationRules(languageId: LanguageId) {
		let value = this._entries[languageId];

		if (!value) {
			return null;
		}

		return value.indentationRules || null;
	}

	// begin electricCharacter

	private _getElectricCharacterSupport(languageId: LanguageId): BracketElectricCharacterSupport {
		let value = this._getRichEditSupport(languageId);
		if (!value) {
			return null;
		}
		return value.electricCharacter || null;
	}

	public getElectricCharacters(languageId: LanguageId): string[] {
		let electricCharacterSupport = this._getElectricCharacterSupport(languageId);
		if (!electricCharacterSupport) {
			return [];
		}
		return electricCharacterSupport.getElectricCharacters();
	}

	/**
	 * Should return opening bracket type to match indentation with
	 */
	public onElectricCharacter(character: string, context: LineTokens, column: number): IElectricAction {
		let scopedLineTokens = createScopedLineTokens(context, column - 1);
		let electricCharacterSupport = this._getElectricCharacterSupport(scopedLineTokens.languageId);
		if (!electricCharacterSupport) {
			return null;
		}
		return electricCharacterSupport.onElectricCharacter(character, scopedLineTokens, column - scopedLineTokens.firstCharOffset);
	}

	// end electricCharacter

	public getComments(languageId: LanguageId): ICommentsConfiguration {
		let value = this._getRichEditSupport(languageId);
		if (!value) {
			return null;
		}
		return value.comments || null;
	}

	// begin characterPair

	private _getCharacterPairSupport(languageId: LanguageId): CharacterPairSupport {
		let value = this._getRichEditSupport(languageId);
		if (!value) {
			return null;
		}
		return value.characterPair || null;
	}

	public getAutoClosingPairs(languageId: LanguageId): IAutoClosingPair[] {
		let characterPairSupport = this._getCharacterPairSupport(languageId);
		if (!characterPairSupport) {
			return [];
		}
		return characterPairSupport.getAutoClosingPairs();
	}

	public getSurroundingPairs(languageId: LanguageId): IAutoClosingPair[] {
		let characterPairSupport = this._getCharacterPairSupport(languageId);
		if (!characterPairSupport) {
			return [];
		}
		return characterPairSupport.getSurroundingPairs();
	}

	public shouldAutoClosePair(character: string, context: LineTokens, column: number): boolean {
		let scopedLineTokens = createScopedLineTokens(context, column - 1);
		let characterPairSupport = this._getCharacterPairSupport(scopedLineTokens.languageId);
		if (!characterPairSupport) {
			return false;
		}
		return characterPairSupport.shouldAutoClosePair(character, scopedLineTokens, column - scopedLineTokens.firstCharOffset);
	}

	// end characterPair

	public getWordDefinition(languageId: LanguageId): RegExp {
		let value = this._getRichEditSupport(languageId);
		if (!value) {
			return ensureValidWordDefinition(null);
		}
		return ensureValidWordDefinition(value.wordDefinition || null);
	}

	// begin onEnter

	private _getOnEnterSupport(languageId: LanguageId): OnEnterSupport {
		let value = this._getRichEditSupport(languageId);
		if (!value) {
			return null;
		}
		return value.onEnter || null;
	}

	public getRawEnterActionAtPosition(model: ITokenizedModel, lineNumber: number, column: number): EnterAction {
		let r = this.getEnterAction(model, new Range(lineNumber, column, lineNumber, column));

		return r ? r.enterAction : null;
	}

	public getEnterAction(model: ITokenizedModel, range: Range): { enterAction: EnterAction; indentation: string; ignoreCurrentLine: boolean } {
		let indentation = this.getIndentationAtPosition(model, range.startLineNumber, range.startColumn);
		let ignoreCurrentLine = false;

		let scopedLineTokens = this.getScopedLineTokens(model, range.startLineNumber);
		let onEnterSupport = this._getOnEnterSupport(scopedLineTokens.languageId);
		if (!onEnterSupport) {
			return {
				enterAction: { indentAction: IndentAction.None, appendText: '' },
				indentation: indentation,
				ignoreCurrentLine: false
			};
		}

		let scopedLineText = scopedLineTokens.getLineContent();
		let beforeEnterText = scopedLineText.substr(0, range.startColumn - 1 - scopedLineTokens.firstCharOffset);
		let afterEnterText;

		// selection support
		if (range.isEmpty()) {
			afterEnterText = scopedLineText.substr(range.startColumn - 1 - scopedLineTokens.firstCharOffset);
		} else {
			let endScopedLineTokens = this.getScopedLineTokens(model, range.endLineNumber);
			afterEnterText = endScopedLineTokens.getLineContent().substr(range.endColumn - 1 - endScopedLineTokens.firstCharOffset);
		}

		let lineNumber = range.startLineNumber;

		// if the text before the cursor/range start position is empty or matches `unIndentedLinePattern`
		// this line is actually ignored after the enter action
		if (onEnterSupport.shouldIgnore(beforeEnterText)) {
			ignoreCurrentLine = true;
			let lastLineNumber = this.getLastValidLine(model, lineNumber, onEnterSupport);

			if (lastLineNumber <= 0) {
				return {
					enterAction: { indentAction: IndentAction.None, appendText: '' },
					indentation: '',
					ignoreCurrentLine: ignoreCurrentLine
				};
			}

			scopedLineTokens = this.getScopedLineTokens(model, lastLineNumber);
			beforeEnterText = this.getLineContent(model, lastLineNumber);
			lineNumber = lastLineNumber;
			indentation = this.getIndentationAtPosition(model, lineNumber, model.getLineMaxColumn(lineNumber));
		}

		let oneLineAboveText = '';

		if (lineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
			// This is not the first line and the entire line belongs to this mode
			let lastLineNumber = this.getLastValidLine(model, lineNumber, onEnterSupport);

			if (lastLineNumber >= 1) {
				// No previous line with content found
				let oneLineAboveScopedLineTokens = this.getScopedLineTokens(model, lastLineNumber);
				if (oneLineAboveScopedLineTokens.languageId === scopedLineTokens.languageId) {
					// The line above ends with text belonging to the same mode
					oneLineAboveText = oneLineAboveScopedLineTokens.getLineContent();
				}
			}
		}

		let enterResult: EnterAction = null;

		try {
			enterResult = onEnterSupport.onEnter(oneLineAboveText, beforeEnterText, afterEnterText);
		} catch (e) {
			onUnexpectedError(e);
		}

		if (!enterResult) {
			enterResult = { indentAction: IndentAction.None, appendText: '' };
		} else {
			// Here we add `\t` to appendText first because enterAction is leveraging appendText and removeText to change indentation.
			if (!enterResult.appendText) {
				if (
					(enterResult.indentAction === IndentAction.Indent) ||
					(enterResult.indentAction === IndentAction.IndentOutdent)
				) {
					enterResult.appendText = '\t';
				} else {
					enterResult.appendText = '';
				}
			}
		}

		return {
			enterAction: enterResult,
			indentation: indentation,
			ignoreCurrentLine: ignoreCurrentLine
		};
	}

	private getIndentationAtPosition(model: ITokenizedModel, lineNumber: number, column: number): string {
		let lineText = model.getLineContent(lineNumber);
		let indentation = strings.getLeadingWhitespace(lineText);
		if (indentation.length > column - 1) {
			indentation = indentation.substring(0, column - 1);
		}

		return indentation;
	}

	private getLastValidLine(model: ITokenizedModel, lineNumber: number, onEnterSupport: OnEnterSupport): number {
		if (lineNumber > 1) {
			let lastLineNumber = lineNumber - 1;

			for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
				let lineText = model.getLineContent(lastLineNumber);
				if (!onEnterSupport.shouldIgnore(lineText) && onEnterSupport.containNonWhitespace(lineText)) {
					break;
				}
			}

			if (lastLineNumber >= 1) {
				return lastLineNumber;
			}
		}

		return -1;
	}

	private getLineContent(model: ITokenizedModel, lineNumber: number): string {
		let scopedLineTokens = this.getScopedLineTokens(model, lineNumber);
		let column = model.getLineMaxColumn(lineNumber);
		let scopedLineText = scopedLineTokens.getLineContent();
		let lineText = scopedLineText.substr(0, column - 1 - scopedLineTokens.firstCharOffset);
		return lineText;
	}

	private getScopedLineTokens(model: ITokenizedModel, lineNumber: number) {
		let lineTokens = model.getLineTokens(lineNumber, false);
		let column = model.getLineMaxColumn(lineNumber);
		let scopedLineTokens = createScopedLineTokens(lineTokens, column - 1);
		return scopedLineTokens;
	}

	public getGoodIndentActionForLine(model: ITokenizedModel, lineNumber: number) {
		let onEnterSupport = this._getOnEnterSupport(model.getLanguageIdentifier().id);
		if (!onEnterSupport) {
			return null;
		}

		/**
		 * In order to get correct indentation for current line
		 * we need to loop backwards the content from current line until
		 * 1. a line contains non whitespace characters,
		 * 2. and the line doesn't match `unIndentedLinePattern` pattern
		 */
		let lastLineNumber = this.getLastValidLine(model, lineNumber, onEnterSupport);

		if (lastLineNumber < 1) {
			// No previous line with content found
			return null;
		}

		// it's Okay that lineNumber > model.getLineCount(), a good example is guessing the indentation of next potential line
		// when the cursor is at the end of file.
		if (lineNumber <= model.getLineCount()) {
			let currentLineScopedLineTokens = this.getScopedLineTokens(model, lineNumber);
			let lastLineScopedLineTokens = this.getScopedLineTokens(model, lastLineNumber);

			if (currentLineScopedLineTokens.languageId !== lastLineScopedLineTokens.languageId) {
				// The language mode of last valid line is not the same as current line.
				return null;
			}
		}

		let lineText = model.getLineContent(lastLineNumber);
		let oneLineAboveText: string;
		if (lastLineNumber > 1) {
			oneLineAboveText = model.getLineContent(lastLineNumber - 1);
		}

		let indentation = strings.getLeadingWhitespace(lineText);
		let onEnterAction = onEnterSupport.onEnter(oneLineAboveText, lineText, '');

		return {
			indentation: indentation,
			action: onEnterAction ? onEnterAction.indentAction : null
		};
	}

	// end onEnter

	public getBracketsSupport(languageId: LanguageId): RichEditBrackets {
		let value = this._getRichEditSupport(languageId);
		if (!value) {
			return null;
		}
		return value.brackets || null;
	}
}

export const LanguageConfigurationRegistry = new LanguageConfigurationRegistryImpl();
