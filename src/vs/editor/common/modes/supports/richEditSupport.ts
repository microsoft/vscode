/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ICommentsConfiguration, IRichEditBrackets, IRichEditCharacterPair, IRichEditOnEnter, IRichEditSupport} from 'vs/editor/common/modes';
import {NullMode} from 'vs/editor/common/modes/nullMode';
import {CharacterPairSupport} from 'vs/editor/common/modes/supports/characterPair';
import {ICharacterPairContribution} from 'vs/editor/common/modes/supports/characterPair';
import {BracketElectricCharacterSupport, IBracketElectricCharacterContribution} from 'vs/editor/common/modes/supports/electricCharacter';
import {IIndentationRules, IOnEnterRegExpRules, IOnEnterSupportOptions, OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';

export type CharacterPair = [string, string];

export interface CommentRule {
	lineComment?: string;
	blockComment?: CharacterPair;
}

export interface IRichEditConfiguration {
	comments?: CommentRule;
	brackets?: CharacterPair[];
	wordPattern?: RegExp;
	indentationRules?: IIndentationRules;
	onEnterRules?: IOnEnterRegExpRules[];
	__electricCharacterSupport?: IBracketElectricCharacterContribution;
	__characterPairSupport?: ICharacterPairContribution;
}

export class RichEditSupport implements IRichEditSupport {

	private _conf: IRichEditConfiguration;

	public electricCharacter: BracketElectricCharacterSupport;
	public comments: ICommentsConfiguration;
	public characterPair: IRichEditCharacterPair;
	public wordDefinition: RegExp;
	public onEnter: IRichEditOnEnter;
	public brackets: IRichEditBrackets;

	constructor(modeId:string, previous:IRichEditSupport, rawConf:IRichEditConfiguration) {

		let prev:IRichEditConfiguration = null;
		if (previous instanceof RichEditSupport) {
			prev = previous._conf;
		}

		this._conf = RichEditSupport._mergeConf(prev, rawConf);

		this._handleOnEnter(modeId, this._conf);

		this._handleComments(modeId, this._conf);

		if (this._conf.__characterPairSupport) {
			this.characterPair = new CharacterPairSupport(modeId, this._conf.__characterPairSupport);
		}

		if (this._conf.__electricCharacterSupport) {
			this.electricCharacter = new BracketElectricCharacterSupport(modeId, this._conf.__electricCharacterSupport);
			this.brackets = this.electricCharacter.getRichEditBrackets();
		}

		this.wordDefinition = this._conf.wordPattern || NullMode.DEFAULT_WORD_REGEXP;
	}

	private static _mergeConf(prev:IRichEditConfiguration, current:IRichEditConfiguration): IRichEditConfiguration {
		return {
			comments: (prev ? current.comments || prev.comments : current.comments),
			brackets: (prev ? current.brackets || prev.brackets : current.brackets),
			wordPattern: (prev ? current.wordPattern || prev.wordPattern : current.wordPattern),
			indentationRules: (prev ? current.indentationRules || prev.indentationRules : current.indentationRules),
			onEnterRules: (prev ? current.onEnterRules || prev.onEnterRules : current.onEnterRules),
			__electricCharacterSupport: (prev ? current.__electricCharacterSupport || prev.__electricCharacterSupport : current.__electricCharacterSupport),
			__characterPairSupport: (prev ? current.__characterPairSupport || prev.__characterPairSupport : current.__characterPairSupport),
		};
	}

	private _handleOnEnter(modeId:string, conf:IRichEditConfiguration): void {
		// on enter
		let onEnter: IOnEnterSupportOptions = {};
		let empty = true;
		let {brackets, indentationRules, onEnterRules} = conf;

		if (brackets) {
			empty = false;
			onEnter.brackets = brackets.map(pair => {
				let [open, close] = pair;
				return { open, close };
			});
		}
		if (indentationRules) {
			empty = false;
			onEnter.indentationRules = indentationRules;
		}
		if (onEnterRules) {
			empty = false;
			onEnter.regExpRules = <any>onEnterRules;
		}

		if (!empty) {
			this.onEnter = new OnEnterSupport(modeId, onEnter);
		}
	}

	private _handleComments(modeId:string, conf:IRichEditConfiguration): void {
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
