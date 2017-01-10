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
import { IndentAction, EnterAction, IAutoClosingPair, LanguageConfiguration } from 'vs/editor/common/modes/languageConfiguration';
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
		let lineTokens = model.getLineTokens(lineNumber, false);
		let scopedLineTokens = createScopedLineTokens(lineTokens, column - 1);
		let onEnterSupport = this._getOnEnterSupport(scopedLineTokens.languageId);
		if (!onEnterSupport) {
			return null;
		}

		let scopedLineText = scopedLineTokens.getLineContent();
		let beforeEnterText = scopedLineText.substr(0, column - 1 - scopedLineTokens.firstCharOffset);
		let afterEnterText = scopedLineText.substr(column - 1 - scopedLineTokens.firstCharOffset);

		let oneLineAboveText = '';
		if (lineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
			// This is not the first line and the entire line belongs to this mode
			let oneLineAboveLineTokens = model.getLineTokens(lineNumber - 1, false);
			let oneLineAboveMaxColumn = model.getLineMaxColumn(lineNumber - 1);
			let oneLineAboveScopedLineTokens = createScopedLineTokens(oneLineAboveLineTokens, oneLineAboveMaxColumn - 1);
			if (oneLineAboveScopedLineTokens.languageId === scopedLineTokens.languageId) {
				// The line above ends with text belonging to the same mode
				oneLineAboveText = oneLineAboveScopedLineTokens.getLineContent();
			}
		}

		let result: EnterAction = null;
		try {
			result = onEnterSupport.onEnter(oneLineAboveText, beforeEnterText, afterEnterText);
		} catch (e) {
			onUnexpectedError(e);
		}
		return result;
	}

	public getEnterActionAtPosition(model: ITokenizedModel, lineNumber: number, column: number): { enterAction: EnterAction; indentation: string; } {
		let lineText = model.getLineContent(lineNumber);
		let indentation = strings.getLeadingWhitespace(lineText);
		if (indentation.length > column - 1) {
			indentation = indentation.substring(0, column - 1);
		}

		let enterAction = this.getRawEnterActionAtPosition(model, lineNumber, column);
		if (!enterAction) {
			enterAction = {
				indentAction: IndentAction.None,
				appendText: '',
			};
		} else {
			if (!enterAction.appendText) {
				if (
					(enterAction.indentAction === IndentAction.Indent) ||
					(enterAction.indentAction === IndentAction.IndentOutdent)
				) {
					enterAction.appendText = '\t';
				} else {
					enterAction.appendText = '';
				}
			}
		}

		if (enterAction.removeText) {
			indentation = indentation.substring(0, indentation.length - 1);
		}

		return {
			enterAction: enterAction,
			indentation: indentation
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
