/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ICommentsConfiguration, IRichEditBrackets, IRichEditCharacterPair, IAutoClosingPair,
	IAutoClosingPairConditional, IRichEditOnEnter, IRichEditSupport, CharacterPair,
	IMode, IRichEditElectricCharacter, IEnterAction, IndentAction} from 'vs/editor/common/modes';
import {NullMode} from 'vs/editor/common/modes/nullMode';
import {CharacterPairSupport} from 'vs/editor/common/modes/supports/characterPair';
import {BracketElectricCharacterSupport, IBracketElectricCharacterContribution} from 'vs/editor/common/modes/supports/electricCharacter';
import {IIndentationRules, IOnEnterRegExpRules, IOnEnterSupportOptions, OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';
import {RichEditBrackets} from 'vs/editor/common/modes/supports/richEditBrackets';
import Event, {Emitter} from 'vs/base/common/event';
import {ITokenizedModel} from 'vs/editor/common/editorCommon';
import {onUnexpectedError} from 'vs/base/common/errors';
import {Position} from 'vs/editor/common/core/position';
import * as strings from 'vs/base/common/strings';
import {IDisposable} from 'vs/base/common/lifecycle';

export interface CommentRule {
	lineComment?: string;
	blockComment?: CharacterPair;
}

export interface IRichLanguageConfiguration {
	comments?: CommentRule;
	brackets?: CharacterPair[];
	wordPattern?: RegExp;
	indentationRules?: IIndentationRules;
	onEnterRules?: IOnEnterRegExpRules[];
	autoClosingPairs?: IAutoClosingPairConditional[];
	surroundingPairs?: IAutoClosingPair[];
	__electricCharacterSupport?: IBracketElectricCharacterContribution;
}

export class RichEditSupport implements IRichEditSupport {

	private _conf: IRichLanguageConfiguration;

	public electricCharacter: BracketElectricCharacterSupport;
	public comments: ICommentsConfiguration;
	public characterPair: IRichEditCharacterPair;
	public wordDefinition: RegExp;
	public onEnter: IRichEditOnEnter;
	public brackets: IRichEditBrackets;

	constructor(modeId:string, previous:IRichEditSupport, rawConf:IRichLanguageConfiguration) {

		let prev:IRichLanguageConfiguration = null;
		if (previous instanceof RichEditSupport) {
			prev = previous._conf;
		}

		this._conf = RichEditSupport._mergeConf(prev, rawConf);

		if (this._conf.brackets) {
			this.brackets = new RichEditBrackets(modeId, this._conf.brackets);
		}

		this._handleOnEnter(modeId, this._conf);

		this._handleComments(modeId, this._conf);

		if (this._conf.autoClosingPairs) {
			this.characterPair = new CharacterPairSupport(LanguageConfigurationRegistry, modeId, this._conf);
		}

		if (this._conf.__electricCharacterSupport || this._conf.brackets) {
			this.electricCharacter = new BracketElectricCharacterSupport(LanguageConfigurationRegistry, modeId, this.brackets, this._conf.__electricCharacterSupport);
		}

		this.wordDefinition = this._conf.wordPattern || NullMode.DEFAULT_WORD_REGEXP;
	}

	private static _mergeConf(prev:IRichLanguageConfiguration, current:IRichLanguageConfiguration): IRichLanguageConfiguration {
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

	private _handleOnEnter(modeId:string, conf:IRichLanguageConfiguration): void {
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

	private _handleComments(modeId:string, conf:IRichLanguageConfiguration): void {
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

	public register(languageId:string, configuration:IRichLanguageConfiguration): IDisposable {
		let previous = this._entries[languageId] || null;
		this._entries[languageId] = new RichEditSupport(languageId, previous, configuration);
		this._onDidChange.fire(void 0);
		return {
			dispose: () => {}
		};
	}

	private _getRichEditSupport(mode:IMode): IRichEditSupport {
		return this._entries[mode.getId()];
	}

	public getElectricCharacterSupport(mode:IMode): IRichEditElectricCharacter {
		let value = this._getRichEditSupport(mode);
		if (!value) {
			return null;
		}
		return value.electricCharacter || null;
	}

	public getComments(mode:IMode): ICommentsConfiguration {
		let value = this._getRichEditSupport(mode);
		if (!value) {
			return null;
		}
		return value.comments || null;
	}

	public getCharacterPairSupport(mode:IMode): IRichEditCharacterPair {
		let value = this._getRichEditSupport(mode);
		if (!value) {
			return null;
		}
		return value.characterPair || null;
	}

	public getWordDefinition(mode:IMode): RegExp {
		let value = this._getRichEditSupport(mode);
		if (!value) {
			return null;
		}
		return value.wordDefinition || null;
	}

	public getOnEnterSupport(mode:IMode): IRichEditOnEnter {
		let value = this._getRichEditSupport(mode);
		if (!value) {
			return null;
		}
		return value.onEnter || null;
	}

	public getRawEnterActionAtPosition(model:ITokenizedModel, lineNumber:number, column:number): IEnterAction {
		let result:IEnterAction;

		let onEnterSupport = this.getOnEnterSupport(model.getMode());

		if (onEnterSupport) {
			try {
				result = onEnterSupport.onEnter(model, new Position(lineNumber, column));
			} catch (e) {
				onUnexpectedError(e);
			}
		}

		return result;
	}

	public getEnterActionAtPosition(model:ITokenizedModel, lineNumber:number, column:number): { enterAction: IEnterAction; indentation: string; } {
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

	public getBracketsSupport(mode:IMode): IRichEditBrackets {
		let value = this._getRichEditSupport(mode);
		if (!value) {
			return null;
		}
		return value.brackets || null;
	}
}

export const LanguageConfigurationRegistry = new LanguageConfigurationRegistryImpl();
