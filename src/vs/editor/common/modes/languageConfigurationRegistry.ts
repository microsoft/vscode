/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ICommentsConfiguration, IRichEditBrackets, IRichEditCharacterPair, IAutoClosingPair,
	IAutoClosingPairConditional, IRichEditOnEnter, CharacterPair,
	IRichEditElectricCharacter, EnterAction, IndentAction} from 'vs/editor/common/modes';
import {CharacterPairSupport} from 'vs/editor/common/modes/supports/characterPair';
import {BracketElectricCharacterSupport, IBracketElectricCharacterContribution} from 'vs/editor/common/modes/supports/electricCharacter';
import {IndentationRule, OnEnterRule, IOnEnterSupportOptions, OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';
import {RichEditBrackets} from 'vs/editor/common/modes/supports/richEditBrackets';
import Event, {Emitter} from 'vs/base/common/event';
import {ITokenizedModel} from 'vs/editor/common/editorCommon';
import {onUnexpectedError} from 'vs/base/common/errors';
import {Position} from 'vs/editor/common/core/position';
import * as strings from 'vs/base/common/strings';
import {IDisposable} from 'vs/base/common/lifecycle';
import {DEFAULT_WORD_REGEXP} from 'vs/editor/common/model/wordHelper';

/**
 * Describes how comments for a language work.
 */
export interface CommentRule {
	/**
	 * The line comment token, like `// this is a comment`
	 */
	lineComment?: string;
	/**
	 * The block comment character pair, like `/* block comment *&#47;`
	 */
	blockComment?: CharacterPair;
}

/**
 * The language configuration interface defines the contract between extensions and
 * various editor features, like automatic bracket insertion, automatic indentation etc.
 */
export interface LanguageConfiguration {
	/**
	 * The language's comment settings.
	 */
	comments?: CommentRule;
	/**
	 * The language's brackets.
	 * This configuration implicitly affects pressing Enter around these brackets.
	 */
	brackets?: CharacterPair[];
	/**
	 * The language's word definition.
	 * If the language supports Unicode identifiers (e.g. JavaScript), it is preferable
	 * to provide a word definition that uses exclusion of known separators.
	 * e.g.: A regex that matches anything except known separators (and dot is allowed to occur in a floating point number):
	 *   /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	 */
	wordPattern?: RegExp;
	/**
	 * The language's indentation settings.
	 */
	indentationRules?: IndentationRule;
	/**
		 * The language's rules to be evaluated when pressing Enter.
		 */
	onEnterRules?: OnEnterRule[];
	/**
	 * The language's auto closing pairs. The 'close' character is automatically inserted with the
	 * 'open' character is typed. If not set, the configured brackets will be used.
	 */
	autoClosingPairs?: IAutoClosingPairConditional[];
	/**
	 * The language's surrounding pairs. When the 'open' character is typed on a selection, the
	 * selected string is surrounded by the open and close characters. If not set, the autoclosing pairs
	 * settings will be used.
	 */
	surroundingPairs?: IAutoClosingPair[];
	/**
	 * **Deprecated** Do not use.
	 *
	 * @deprecated Will be replaced by a better API soon.
	 */
	__electricCharacterSupport?: IBracketElectricCharacterContribution;
}

export class RichEditSupport {

	private _conf: LanguageConfiguration;

	public electricCharacter: BracketElectricCharacterSupport;
	public comments: ICommentsConfiguration;
	public characterPair: IRichEditCharacterPair;
	public wordDefinition: RegExp;
	public onEnter: IRichEditOnEnter;
	public brackets: IRichEditBrackets;

	constructor(modeId:string, previous:RichEditSupport, rawConf:LanguageConfiguration) {

		let prev:LanguageConfiguration = null;
		if (previous) {
			prev = previous._conf;
		}

		this._conf = RichEditSupport._mergeConf(prev, rawConf);

		if (this._conf.brackets) {
			this.brackets = new RichEditBrackets(modeId, this._conf.brackets);
		}

		this._handleOnEnter(modeId, this._conf);

		this._handleComments(modeId, this._conf);

		this.characterPair = new CharacterPairSupport(LanguageConfigurationRegistry, modeId, this._conf);

		if (this._conf.__electricCharacterSupport || this._conf.brackets) {
			this.electricCharacter = new BracketElectricCharacterSupport(LanguageConfigurationRegistry, modeId, this.brackets, this._conf.__electricCharacterSupport);
		}

		this.wordDefinition = this._conf.wordPattern || DEFAULT_WORD_REGEXP;
	}

	private static _mergeConf(prev:LanguageConfiguration, current:LanguageConfiguration): LanguageConfiguration {
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

	private _handleOnEnter(modeId:string, conf:LanguageConfiguration): void {
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
			this.onEnter = new OnEnterSupport(LanguageConfigurationRegistry, modeId, onEnter);
		}
	}

	private _handleComments(modeId:string, conf:LanguageConfiguration): void {
		let commentRule = conf.comments;

		// comment configuration
		if (commentRule) {
			this.comments = {};

			if (commentRule.lineComment) {
				this.comments.lineCommentToken = commentRule.lineComment;
			}
			if (commentRule.blockComment) {
				let [blockStart, blockEnd] = commentRule.blockComment;
				this.comments.blockCommentStartToken = blockStart;
				this.comments.blockCommentEndToken = blockEnd;
			}
		}
	}

}

export class LanguageConfigurationRegistryImpl {

	private _entries: {[languageId:string]:RichEditSupport;};

	private _onDidChange: Emitter<void> = new Emitter<void>();
	public onDidChange: Event<void> = this._onDidChange.event;

	constructor() {
		this._entries = Object.create(null);
	}

	public register(languageId:string, configuration:LanguageConfiguration): IDisposable {
		let previous = this._entries[languageId] || null;
		this._entries[languageId] = new RichEditSupport(languageId, previous, configuration);
		this._onDidChange.fire(void 0);
		return {
			dispose: () => {}
		};
	}

	private _getRichEditSupport(modeId:string): RichEditSupport {
		return this._entries[modeId];
	}

	public getElectricCharacterSupport(modeId:string): IRichEditElectricCharacter {
		let value = this._getRichEditSupport(modeId);
		if (!value) {
			return null;
		}
		return value.electricCharacter || null;
	}

	public getComments(modeId:string): ICommentsConfiguration {
		let value = this._getRichEditSupport(modeId);
		if (!value) {
			return null;
		}
		return value.comments || null;
	}

	public getCharacterPairSupport(modeId:string): IRichEditCharacterPair {
		let value = this._getRichEditSupport(modeId);
		if (!value) {
			return null;
		}
		return value.characterPair || null;
	}

	public getWordDefinition(modeId:string): RegExp {
		let value = this._getRichEditSupport(modeId);
		if (!value) {
			return null;
		}
		return value.wordDefinition || null;
	}

	public getOnEnterSupport(modeId:string): IRichEditOnEnter {
		let value = this._getRichEditSupport(modeId);
		if (!value) {
			return null;
		}
		return value.onEnter || null;
	}

	public getRawEnterActionAtPosition(model:ITokenizedModel, lineNumber:number, column:number): EnterAction {
		let result:EnterAction;

		let onEnterSupport = this.getOnEnterSupport(model.getMode().getId());

		if (onEnterSupport) {
			try {
				result = onEnterSupport.onEnter(model, new Position(lineNumber, column));
			} catch (e) {
				onUnexpectedError(e);
			}
		}

		return result;
	}

	public getEnterActionAtPosition(model:ITokenizedModel, lineNumber:number, column:number): { enterAction: EnterAction; indentation: string; } {
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
			if(!enterAction.appendText) {
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

	public getBracketsSupport(modeId:string): IRichEditBrackets {
		let value = this._getRichEditSupport(modeId);
		if (!value) {
			return null;
		}
		return value.brackets || null;
	}
}

export const LanguageConfigurationRegistry = new LanguageConfigurationRegistryImpl();
