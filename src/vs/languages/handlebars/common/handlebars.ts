/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import htmlMode = require('vs/languages/html/common/html');
import handlebarsTokenTypes = require('vs/languages/handlebars/common/handlebarsTokenTypes');
import htmlWorker = require('vs/languages/html/common/htmlWorker');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModeService} from 'vs/editor/common/services/modeService';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {ILeavingNestedModeData} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {IThreadService} from 'vs/platform/thread/common/thread';

export enum States {
	HTML,
	Expression,
	UnescapedExpression
}

export class HandlebarsState extends htmlMode.State {

	constructor(mode:Modes.IMode,
		public kind:htmlMode.States,
		public handlebarsKind:States,
		public lastTagName:string,
		public lastAttributeName:string,
		public embeddedContentType:string,
		public attributeValueQuote:string,
		public attributeValue:string) {

		super(mode, kind, lastTagName, lastAttributeName, embeddedContentType, attributeValueQuote, attributeValue);
	}

	public makeClone(): HandlebarsState {
		return new HandlebarsState(this.getMode(), this.kind, this.handlebarsKind, this.lastTagName, this.lastAttributeName, this.embeddedContentType, this.attributeValueQuote, this.attributeValue);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof HandlebarsState) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream) : Modes.ITokenizationResult {
		switch(this.handlebarsKind) {
			case States.HTML:
				if (stream.advanceIfString('{{{').length > 0) {
					this.handlebarsKind = States.UnescapedExpression;
					return { type: handlebarsTokenTypes.EMBED_UNESCAPED };
				}
				else if (stream.advanceIfString('{{').length > 0) {
					this.handlebarsKind = States.Expression;
					return { type: handlebarsTokenTypes.EMBED };
				}
			break;

			case States.Expression:
			case States.UnescapedExpression:
				if (this.handlebarsKind === States.Expression && stream.advanceIfString('}}').length > 0) {
					this.handlebarsKind = States.HTML;
					return { type: handlebarsTokenTypes.EMBED };
				}
				else if (this.handlebarsKind === States.UnescapedExpression &&stream.advanceIfString('}}}').length > 0) {
					this.handlebarsKind = States.HTML;
					return { type: handlebarsTokenTypes.EMBED_UNESCAPED };
				}
				else if(stream.skipWhitespace().length > 0) {
					return { type: ''};
				}

				if(stream.peek() === '#') {
					stream.advanceWhile(/^[^\s}]/);
					return { type: handlebarsTokenTypes.KEYWORD };
				}

				if(stream.peek() === '/') {
					stream.advanceWhile(/^[^\s}]/);
					return { type: handlebarsTokenTypes.KEYWORD };
				}

				if(stream.advanceIfString('else')) {
					var next = stream.peek();
					if(next === ' ' || next === '\t' || next === '}') {
						return { type: handlebarsTokenTypes.KEYWORD };
					}
					else {
						stream.goBack(4);
					}
				}

				if(stream.advanceWhile(/^[^\s}]/).length > 0) {
					return { type: handlebarsTokenTypes.VARIABLE };
				}
			break;
		}
		return super.tokenize(stream);
	}
}

export class HandlebarsMode extends htmlMode.HTMLMode<htmlWorker.HTMLWorker> {

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService modeService: IModeService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor, instantiationService, modeService, threadService);

		this.formattingSupport = null;
	}

	protected _createRichEditSupport(): Modes.IRichEditSupport {
		return new RichEditSupport(this.getId(), null, {

			wordPattern: createWordRegExp('#-?%'),

			comments: {
				blockComment: ['<!--', '-->']
			},

			brackets: [
				['<!--', '-->'],
				['{{', '}}']
			],

			__electricCharacterSupport: {
				caseInsensitive: true,
				embeddedElectricCharacters: ['*', '}', ']', ')']
			},

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"' },
					{ open: '\'', close: '\'' }
				],
				surroundingPairs: [
					{ open: '<', close: '>' },
					{ open: '"', close: '"' },
					{ open: '\'', close: '\'' }
				]
			},

			onEnterRules: [
				{
					beforeText: new RegExp(`<(?!(?:${htmlMode.EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					afterText: /^<\/(\w[\w\d]*)\s*>$/i,
					action: { indentAction: Modes.IndentAction.IndentOutdent }
				},
				{
					beforeText: new RegExp(`<(?!(?:${htmlMode.EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					action: { indentAction: Modes.IndentAction.Indent }
				}
			],
		});
	}

	public getInitialState() : Modes.IState {
		return new HandlebarsState(this, htmlMode.States.Content, States.HTML, '', '', '', '', '');
	}

	public getLeavingNestedModeData(line:string, state:Modes.IState):ILeavingNestedModeData {
		var leavingNestedModeData = super.getLeavingNestedModeData(line, state);
		if (leavingNestedModeData) {
			leavingNestedModeData.stateAfterNestedMode = new HandlebarsState(this, htmlMode.States.Content, States.HTML, '', '', '', '', '');
		}
		return leavingNestedModeData;
	}
}
