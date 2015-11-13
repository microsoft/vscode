/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import supports = require('vs/editor/common/modes/supports');
import objects = require('vs/base/common/objects');
import Network = require('vs/base/common/network');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {OneWorkerAttr} from 'vs/platform/thread/common/threadService';
import cssWorker = require('vs/languages/css/common/cssWorker');
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {AsyncDescriptor2, createAsyncDescriptor2} from 'vs/platform/instantiation/common/descriptors';
import {IMarker} from 'vs/platform/markers/common/markers';
import {OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';

export enum States {
	Selector,
	Rule,
	Value,
	ValuePostUrl,
	ValueInUrlFunction,
	Unit,
	Meta,
	MetaPostUrl,
	MetaInUrlFunction,
}

var identRegEx = /^-?-?([a-zA-Z]|(\\(([0-9a-fA-F]{1,6}\s?)|[^[0-9a-fA-F])))([\w\-]|(\\(([0-9a-fA-F]{1,6}\s?)|[^[0-9a-fA-F])))*/;

export class State extends AbstractState {

	public kind:States;
	public inComment:boolean;
	public quote:string;
	public inMeta:boolean;
	public metaBraceCount: number;

	constructor(mode:Modes.IMode, kind:States, inComment:boolean, quote:string, inMeta:boolean, metaBraceCount: number) {
		super(mode);
		this.kind = kind;
		this.inComment = inComment;
		this.quote = quote;
		this.inMeta = inMeta;
		this.metaBraceCount = metaBraceCount;
	}

	private nextState(next:States, token:Modes.ITokenizationResult):Modes.ITokenizationResult {
		this.kind = next;
		return token;
	}

	public makeClone():State {
		return new State(this.getMode(), this.kind, this.inComment, this.quote, this.inMeta, this.metaBraceCount);
	}

	public equals(other:Modes.IState):boolean {
		return super.equals(other) && objects.equals(this, other);
	}

	private tokenizeInComment(stream:Modes.IStream):Modes.ITokenizationResult {
		if (/\*\/$/.test(stream.advanceUntilString('*/', true))) {
			this.inComment = false;
		}
		return { type:'comment.css' };
	}

	private tokenizeInString(stream:Modes.IStream):Modes.ITokenizationResult {
		var ch:string, afterBackslash = false, quote = this.quote;

		while (!stream.eos()) {
			ch = stream.next();

			if (afterBackslash) {
				// Ignore any character after \
				afterBackslash = false;
			} else if (ch === '\\') {
				// Mark next character for ignoring
				afterBackslash = true;
			} else if (ch === quote) {
				// Matching quote found
				this.quote = null;
				break;
			}
		}

		return { type:'string.css' };
	}

	private consumeIdent(stream:Modes.IStream) {
		stream.goBack(1);
		if (stream.advanceIfRegExp2(identRegEx)) {
			return true;
		}
		stream.advance(1);
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		if (this.inComment) {
			return this.tokenizeInComment(stream);
		}
		if (this.quote !== null) {
			return this.tokenizeInString(stream);
		}
		if (stream.skipWhitespace2()) {
			return { type:'' };
		}
		if (stream.advanceIfString2('/*')) {
			this.inComment = true;
			return this.tokenizeInComment(stream);
		}
		if (stream.advanceIfString2('\'')) {
			this.quote = '\'';
			return this.tokenizeInString(stream);
		}
		if (stream.advanceIfString2('\"')) {
			this.quote = '\"';
			return this.tokenizeInString(stream);
		}

		var ch = stream.next();

		// These states can immediately transition to States.Value or Meta (without consuming ch), that's why they're handled above the switch stmt.
		switch (this.kind) {
			case States.ValuePostUrl:
				if (ch === '(') {
					return this.nextState(States.ValueInUrlFunction, { type:'punctuation.parenthesis.css', bracket: Modes.Bracket.Open });
				}
				this.kind = States.Value;
				break;
			case States.MetaPostUrl:
				if (ch === '(') {
					return this.nextState(States.MetaInUrlFunction, { type:'punctuation.parenthesis.css', bracket: Modes.Bracket.Open });
				}
				this.kind = States.Meta;
				break;
			case States.ValueInUrlFunction:
			case States.MetaInUrlFunction:
				// This state is after 'url(' was encountered in the value
				if (ch !== ')') {
					stream.advanceIfRegExp2(/^[^\)]*/);
					return { type: 'string.css' };
				}
				this.kind = (this.kind === States.ValueInUrlFunction) ? States.Value : States.Meta;
				break;
		}

		switch (this.kind) {
			case States.Selector:
				if (ch === '{') {
					return this.nextState(States.Rule, { type:'punctuation.bracket.css', bracket: Modes.Bracket.Open });
				}
				if (ch === '(' || ch === ')') {
					return { type:'punctuation.parenthesis.css', bracket: ch === '(' ? Modes.Bracket.Open : Modes.Bracket.Close };
				}
				if (ch === '@' && !this.inMeta) {  //@import, @media, @key-word-animation
					stream.advanceIfRegExp2(identRegEx);
					return this.nextState(States.Meta, { type:'keyword.css' });
				}
				if (ch === '}' && this.inMeta) {  //@import, @media, @key-word-animation
					this.inMeta = false;
					return this.nextState(States.Selector, { type:'punctuation.bracket.css', bracket: Modes.Bracket.Close });
				}
				if (/[\*\(\)\[\]\+>=\~\|;]/.test(ch)) {
					return { type:'punctuation.css' };
				}
				if (ch === '#') {
					stream.advanceIfRegExp2(identRegEx);
					return { type:'entity.other.attribute-name.id.css' };
				}
				if (ch === '.') {
					stream.advanceIfRegExp2(identRegEx);
					return { type:'entity.other.attribute-name.class.css' };
				}
				this.consumeIdent(stream);
				return { type:'entity.name.tag.css' };

			case States.Meta:
				if (ch === '{') {
					var nextState = States.Rule;
					if (this.inMeta) {
						nextState = States.Selector;
					}
					return this.nextState(nextState, { type:'punctuation.bracket.css', bracket: Modes.Bracket.Open });
				}
				if (ch === '(' || ch === ')') {
					return { type:'punctuation.parenthesis.css', bracket: ch === '(' ? Modes.Bracket.Open : Modes.Bracket.Close };
				}
				if (ch === ';') {
					if (this.metaBraceCount === 0) {
						this.inMeta = false;
					}
					return this.nextState(States.Selector, { type:'punctuation.css' });
				}
				if ((ch === 'u' || ch === 'U') && stream.advanceIfStringCaseInsensitive2('rl')) {
					stream.advanceIfStringCaseInsensitive2('-prefix'); // support 'url-prefix' (part of @-mox-document)
					return this.nextState(States.MetaPostUrl, { type:'meta.property-value.css' });
				}
				if (/[\*\(\)\[\]\+>=\~\|]/.test(ch)) {
					return { type:'punctuation.css' };
				}
				this.inMeta = true;
				this.consumeIdent(stream);
				return { type:'meta.property-value.css' };

			case States.Rule:
				if (ch === '}') {
					return this.nextState(States.Selector, { type:'punctuation.bracket.css', bracket: Modes.Bracket.Close });
				}
				if (ch === ':') {
					return this.nextState(States.Value, { type:'punctuation.css' });
				}
				if (ch === '(' || ch === ')') {
					return { type:'punctuation.parenthesis.css', bracket: ch === '(' ? Modes.Bracket.Open : Modes.Bracket.Close };
				}
				this.consumeIdent(stream);
				return { type:'support.type.property-name.css' };

			case States.Value:
				if (ch === '}') {
					return this.nextState(States.Selector, { type:'punctuation.bracket.css', bracket: Modes.Bracket.Close });
				}
				if (ch === ';') {
					return this.nextState(States.Rule, { type:'punctuation.css' });
				}
				if ((ch === 'u' || ch === 'U') && stream.advanceIfStringCaseInsensitive2('rl')) {
					return this.nextState(States.ValuePostUrl, { type:'meta.property-value.css' });
				}

				if (ch === '(' || ch === ')') {
					return { type:'punctuation.parenthesis.css', bracket: ch === '(' ? Modes.Bracket.Open : Modes.Bracket.Close };
				}
				if (ch === ',') {
					return { type:'punctuation.css' };
				}
				if (ch === '#') {
					stream.advanceIfRegExp2(/^[\w]*/);
					return { type:'meta.property-value.hex.css' };
				}
				if (/\d/.test(ch) || (/-|\+/.test(ch) && !stream.eos() && /\d/.test(stream.peek()))) {
					stream.advanceIfRegExp2(/^[\d\.]*/);
					return this.nextState(States.Unit, { type:'meta.property-value.numeric.css' });
				}
				if (ch === '!') {
					return { type:'meta.property-value.keyword.css' };  // !
				}
				if ((ch === 'i' || ch === 'I') && stream.advanceIfStringCaseInsensitive2('mportant')) {
					return { type:'meta.property-value.keyword.css' };  // important
				}
				if (this.consumeIdent(stream)) {
					return { type:'meta.property-value.css' };
				}
				break;

			case States.Unit:
				// css units - see: http://www.w3.org/TR/css3-values/#font-relative-lengths
				stream.goBack(1);
				if(stream.advanceIfRegExp2(/^(em|ex|ch|rem|vw|vh|vm|cm|mm|in|px|pt|pc|deg|grad|rad|turn|s|ms|Hz|kHz|%)/)) {
					return { type:'meta.property-value.unit.css' };
				}
				// no unit, back to value state
				this.nextState(States.Value, null);
				return this.tokenize(stream);
		}
		return { type:'' };
	}
}

export class CSSMode extends AbstractMode<cssWorker.CSSWorker> {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public electricCharacterSupport: Modes.IElectricCharacterSupport;
	public characterPairSupport: Modes.ICharacterPairSupport;

	public referenceSupport: Modes.IReferenceSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public extraInfoSupport:Modes.IExtraInfoSupport;
	public outlineSupport: Modes.IOutlineSupport;
	public declarationSupport: Modes.IDeclarationSupport;
	public suggestSupport: Modes.ISuggestSupport;
	public quickFixSupport: Modes.IQuickFixSupport;
	public onEnterSupport: Modes.IOnEnterSupport;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor, instantiationService, threadService);

		this.tokenizationSupport = new supports.TokenizationSupport(this, {
			getInitialState: () => new State(this, States.Selector, false, null, false, 0)
		}, false, false);
		this.electricCharacterSupport = new supports.BracketElectricCharacterSupport(this, { brackets: [
			{ tokenType:'punctuation.bracket.css', open: '{', close: '}', isElectric: true }
		] });

		this.extraInfoSupport = this;
		this.referenceSupport = new supports.ReferenceSupport(this, {
			tokens: ['support.type.property-name.css', 'meta.property-value.css', 'entity.name.tag.css'],
			findReferences: (resource, position, /*unused*/includeDeclaration) => this.findReferences(resource, position)});
		this.logicalSelectionSupport = this;
		this.outlineSupport = this;
		this.declarationSupport = new supports.DeclarationSupport(this, {
			tokens: ['meta.property-value.css'],
			findDeclaration: (resource, position) => this.findDeclaration(resource, position)});

		this.characterPairSupport = new supports.CharacterPairSupport(this, {
			autoClosingPairs:
				[	{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"', notIn: ['string'] },
					{ open: '\'', close: '\'', notIn: ['string'] }
				]});

		this.suggestSupport = new supports.SuggestSupport(this, {
			triggerCharacters: [' ', ':'],
			excludeTokens: ['comment.css', 'string.css'],
			suggest: (resource, position) => this.suggest(resource, position)});

		this.onEnterSupport = new OnEnterSupport(this.getId(), {
			brackets: [
				{ open: '(', close: ')' },
				{ open: '{', close: '}' },
				{ open: '[', close: ']' }
			]
		});

		this.quickFixSupport = this;
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], cssWorker.CSSWorker> {
		return createAsyncDescriptor2('vs/languages/css/common/cssWorker', 'CSSWorker');
	}

	static $findDeclaration = OneWorkerAttr(CSSMode, CSSMode.prototype.findDeclaration);
	public findDeclaration(resource:Network.URL, position:EditorCommon.IPosition):WinJS.TPromise<Modes.IReference> {
		return this._worker((w) => w.findDeclaration(resource, position));
	}

	static $computeInfo = OneWorkerAttr(CSSMode, CSSMode.prototype.computeInfo);
	public computeInfo(resource:Network.URL, position:EditorCommon.IPosition): WinJS.TPromise<Modes.IComputeExtraInfoResult> {
		return this._worker((w) => w.computeInfo(resource, position));
	}

	static $findReferences = OneWorkerAttr(CSSMode, CSSMode.prototype.findReferences);
	public findReferences(resource:Network.URL, position:EditorCommon.IPosition):WinJS.TPromise<Modes.IReference[]> {
		return this._worker((w) => w.findReferences(resource, position));
	}

	static $getRangesToPosition = OneWorkerAttr(CSSMode, CSSMode.prototype.getRangesToPosition);
	public getRangesToPosition(resource:Network.URL, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ILogicalSelectionEntry[]> {
		return this._worker((w) => w.getRangesToPosition(resource, position));
	}

	static $getOutline = OneWorkerAttr(CSSMode, CSSMode.prototype.getOutline);
	public getOutline(resource:Network.URL):WinJS.TPromise<Modes.IOutlineEntry[]> {
		return this._worker((w) => w.getOutline(resource));
	}

	public getCommentsConfiguration():Modes.ICommentsConfiguration {
		return { blockCommentStartToken: '/*', blockCommentEndToken: '*/' };
	}

	// TODO@Martin: This definition does not work with umlauts for example
	public getWordDefinition():RegExp {
		return /(#?-?\d*\.\d\w*%?)|((::|[@#.!:])?[\w-?]+%?)|::|[@#.!:]/g;
	}

	static $findColorDeclarations = OneWorkerAttr(CSSMode, CSSMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:Network.URL):WinJS.TPromise<{range:EditorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}

	static getQuickFixes = OneWorkerAttr(CSSMode, CSSMode.prototype.getQuickFixes);
	public getQuickFixes(resource: Network.URL, marker: IMarker | EditorCommon.IRange): WinJS.TPromise<Modes.IQuickFix[]>{
		return this._worker((w) => w.getQuickFixes(resource, marker));
	}

	static runQuickFixAction = OneWorkerAttr(CSSMode, CSSMode.prototype.runQuickFixAction);
	public runQuickFixAction(resource:Network.URL, range:EditorCommon.IRange, id: any):WinJS.TPromise<Modes.IQuickFixResult>{
		return this._worker((w) => w.runQuickFixAction(resource, range, id));
	}
}
