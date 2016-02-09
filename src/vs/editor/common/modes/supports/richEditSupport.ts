/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Modes from 'vs/editor/common/modes';
import {OnEnterSupport, IOnEnterSupportOptions, IIndentationRules, IOnEnterRegExpRules} from 'vs/editor/common/modes/supports/onEnter';
import {CharacterPairSupport} from 'vs/editor/common/modes/supports/characterPair';
import {BracketElectricCharacterSupport, IBracketElectricCharacterContribution} from 'vs/editor/common/modes/supports/electricCharacter';
import {TokenTypeClassificationSupport} from 'vs/editor/common/modes/supports/tokenTypeClassification';
import {CommentsSupport, ICommentsSupportContribution} from 'vs/editor/common/modes/supports/comments';
import {ICharacterPairContribution} from 'vs/editor/common/modes/supports/characterPair';

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

export class RichEditSupport implements Modes.IRichEditSupport {

	public electricCharacter: Modes.IRichEditElectricCharacter;
	public comments: Modes.IRichEditComments;
	public characterPair: Modes.IRichEditCharacterPair;
	public tokenTypeClassification: Modes.IRichEditTokenTypeClassification;
	public onEnter: Modes.IRichEditOnEnter;

	constructor(modeId:string, conf:IRichEditConfiguration) {

		this._handleOnEnter(modeId, conf);

		this._handleComments(modeId, conf);

		if (conf.__characterPairSupport) {
			this.characterPair = new CharacterPairSupport(modeId, conf.__characterPairSupport);
		}

		if (conf.__electricCharacterSupport) {
			this.electricCharacter = new BracketElectricCharacterSupport(modeId, conf.__electricCharacterSupport);
		}

		this.tokenTypeClassification = new TokenTypeClassificationSupport({
			wordDefinition: conf.wordPattern
		});
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
		let {comments} = conf;

		// comment configuration
		if (comments) {
			let contrib: ICommentsSupportContribution = { commentsConfiguration: {} };
			if (comments.lineComment) {
				contrib.commentsConfiguration.lineCommentTokens = [comments.lineComment];
			}
			if (comments.blockComment) {
				let [blockStart, blockEnd] = comments.blockComment;
				contrib.commentsConfiguration.blockCommentStartToken = blockStart;
				contrib.commentsConfiguration.blockCommentEndToken = blockEnd;
			}
			this.comments = new CommentsSupport(contrib);
		}
	}

}
