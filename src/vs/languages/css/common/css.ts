/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import objects = require('vs/base/common/objects');
import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import cssWorker = require('vs/languages/css/common/cssWorker');
import cssTokenTypes = require('vs/languages/css/common/cssTokenTypes');
import {AbstractMode, ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {IMarker} from 'vs/platform/markers/common/markers';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {DeclarationSupport} from 'vs/editor/common/modes/supports/declarationSupport';
import {ReferenceSupport} from 'vs/editor/common/modes/supports/referenceSupport';
import {SuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';

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

export { cssTokenTypes };

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
					return this.nextState(States.ValueInUrlFunction, { type: 'punctuation.parenthesis.css' });
				}
				this.kind = States.Value;
				break;
			case States.MetaPostUrl:
				if (ch === '(') {
					return this.nextState(States.MetaInUrlFunction, { type: 'punctuation.parenthesis.css' });
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
					return this.nextState(States.Rule, { type: 'punctuation.bracket.css' });
				}
				if (ch === '(' || ch === ')') {
					return { type: 'punctuation.parenthesis.css' };
				}
				if (ch === '@' && !this.inMeta) {  //@import, @media, @key-word-animation
					stream.advanceIfRegExp2(identRegEx);
					return this.nextState(States.Meta, { type: cssTokenTypes.TOKEN_AT_KEYWORD + '.css' });
				}
				if (ch === '}' && this.inMeta) {  //@import, @media, @key-word-animation
					this.inMeta = false;
					return this.nextState(States.Selector, { type: 'punctuation.bracket.css' });
				}
				if (/[\*\(\)\[\]\+>=\~\|;]/.test(ch)) {
					return { type: 'punctuation.css' };
				}
				if (ch === '#') {
					stream.advanceIfRegExp2(identRegEx);
					return { type: cssTokenTypes.TOKEN_SELECTOR + '.id.css' };
				}
				if (ch === '.') {
					stream.advanceIfRegExp2(identRegEx);
					return { type: cssTokenTypes.TOKEN_SELECTOR + '.class.css' };
				}
				this.consumeIdent(stream);
				return { type: cssTokenTypes.TOKEN_SELECTOR_TAG + '.css' };

			case States.Meta:
				if (ch === '{') {
					var nextState = States.Rule;
					if (this.inMeta) {
						nextState = States.Selector;
					}
					return this.nextState(nextState, { type: 'punctuation.bracket.css' });
				}
				if (ch === '(' || ch === ')') {
					return { type: 'punctuation.parenthesis.css' };
				}
				if (ch === ';') {
					if (this.metaBraceCount === 0) {
						this.inMeta = false;
					}
					return this.nextState(States.Selector, { type: 'punctuation.css' });
				}
				if ((ch === 'u' || ch === 'U') && stream.advanceIfStringCaseInsensitive2('rl')) {
					stream.advanceIfStringCaseInsensitive2('-prefix'); // support 'url-prefix' (part of @-mox-document)
					return this.nextState(States.MetaPostUrl, { type: cssTokenTypes.TOKEN_VALUE + '.css' });
				}
				if (/[\*\(\)\[\]\+>=\~\|]/.test(ch)) {
					return { type: 'punctuation.css' };
				}
				this.inMeta = true;
				this.consumeIdent(stream);
				return { type: cssTokenTypes.TOKEN_VALUE + '.css' };

			case States.Rule:
				if (ch === '}') {
					return this.nextState(States.Selector, { type: 'punctuation.bracket.css' });
				}
				if (ch === ':') {
					return this.nextState(States.Value, { type: 'punctuation.css' });
				}
				if (ch === '(' || ch === ')') {
					return { type: 'punctuation.parenthesis.css' };
				}
				this.consumeIdent(stream);
				return { type: cssTokenTypes.TOKEN_PROPERTY + '.css' };

			case States.Value:
				if (ch === '}') {
					return this.nextState(States.Selector, { type: 'punctuation.bracket.css' });
				}
				if (ch === ';') {
					return this.nextState(States.Rule, { type: 'punctuation.css' });
				}
				if ((ch === 'u' || ch === 'U') && stream.advanceIfStringCaseInsensitive2('rl')) {
					return this.nextState(States.ValuePostUrl, { type: cssTokenTypes.TOKEN_VALUE + '.css' });
				}

				if (ch === '(' || ch === ')') {
					return { type: 'punctuation.parenthesis.css' };
				}
				if (ch === ',') {
					return { type: 'punctuation.css' };
				}
				if (ch === '#') {
					stream.advanceIfRegExp2(/^[\w]*/);
					return { type: cssTokenTypes.TOKEN_VALUE + '.hex.css' };
				}
				if (/\d/.test(ch) || (/-|\+/.test(ch) && !stream.eos() && /\d/.test(stream.peek()))) {
					stream.advanceIfRegExp2(/^[\d\.]*/);
					return this.nextState(States.Unit, { type: cssTokenTypes.TOKEN_VALUE + '.numeric.css' });
				}
				if (ch === '!') {
					return { type: cssTokenTypes.TOKEN_VALUE + '.keyword.css' };  // !
				}
				if ((ch === 'i' || ch === 'I') && stream.advanceIfStringCaseInsensitive2('mportant')) {
					return { type: cssTokenTypes.TOKEN_VALUE + '.keyword.css' };  // important
				}
				if (this.consumeIdent(stream)) {
					return { type: cssTokenTypes.TOKEN_VALUE + '.css' };
				}
				break;

			case States.Unit:
				// css units - see: http://www.w3.org/TR/css3-values/#font-relative-lengths
				stream.goBack(1);
				if(stream.advanceIfRegExp2(/^(em|ex|ch|rem|vw|vh|vm|cm|mm|in|px|pt|pc|deg|grad|rad|turn|s|ms|Hz|kHz|%)/)) {
					return { type: cssTokenTypes.TOKEN_VALUE + '.unit.css' };
				}
				// no unit, back to value state
				this.nextState(States.Value, null);
				return this.tokenize(stream);
		}
		return { type:'' };
	}
}

export class CSSMode extends AbstractMode {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;
	public inplaceReplaceSupport:Modes.IInplaceReplaceSupport;
	public configSupport:Modes.IConfigurationSupport;
	public referenceSupport: Modes.IReferenceSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public extraInfoSupport:Modes.IExtraInfoSupport;
	public occurrencesSupport:Modes.IOccurrencesSupport;
	public outlineSupport: Modes.IOutlineSupport;
	public declarationSupport: Modes.IDeclarationSupport;
	public suggestSupport: Modes.ISuggestSupport;
	public quickFixSupport: Modes.IQuickFixSupport;

	private _modeWorkerManager: ModeWorkerManager<cssWorker.CSSWorker>;
	private _threadService:IThreadService;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor.id);
		this._modeWorkerManager = new ModeWorkerManager<cssWorker.CSSWorker>(descriptor, 'vs/languages/css/common/cssWorker', 'CSSWorker', null, instantiationService);
		this._threadService = threadService;

		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new State(this, States.Selector, false, null, false, 0)
		}, false, false);

		this.richEditSupport = new RichEditSupport(this.getId(), null, {
			// TODO@Martin: This definition does not work with umlauts for example
			wordPattern: /(#?-?\d*\.\d\w*%?)|((::|[@#.!:])?[\w-?]+%?)|::|[@#.!:]/g,

			comments: {
				blockComment: ['/*', '*/']
			},

			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"', notIn: ['string'] },
					{ open: '\'', close: '\'', notIn: ['string'] }
				]
			}
		});

		this.inplaceReplaceSupport = this;
		this.configSupport = this;
		this.occurrencesSupport = this;
		this.extraInfoSupport = this;
		this.referenceSupport = new ReferenceSupport(this.getId(), {
			tokens: [cssTokenTypes.TOKEN_PROPERTY + '.css', cssTokenTypes.TOKEN_VALUE + '.css', cssTokenTypes.TOKEN_SELECTOR_TAG + '.css'],
			findReferences: (resource, position, /*unused*/includeDeclaration) => this.findReferences(resource, position)});
		this.logicalSelectionSupport = this;
		this.outlineSupport = this;
		this.declarationSupport = new DeclarationSupport(this.getId(), {
			tokens: [cssTokenTypes.TOKEN_VALUE + '.css'],
			findDeclaration: (resource, position) => this.findDeclaration(resource, position)});

		this.suggestSupport = new SuggestSupport(this.getId(), {
			triggerCharacters: [' ', ':'],
			excludeTokens: ['comment.css', 'string.css'],
			suggest: (resource, position) => this.suggest(resource, position)});


		this.quickFixSupport = this;
	}

	public creationDone(): void {
		if (this._threadService.isInMainThread) {
			// Pick a worker to do validation
			this._pickAWorkerToValidate();
		}
	}

	private _worker<T>(runner:(worker:cssWorker.CSSWorker)=>WinJS.TPromise<T>): WinJS.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	public configure(options:any): WinJS.TPromise<void> {
		if (this._threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(CSSMode, CSSMode.prototype._configureWorkers);
	private _configureWorkers(options:any): WinJS.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	static $navigateValueSet = OneWorkerAttr(CSSMode, CSSMode.prototype.navigateValueSet);
	public navigateValueSet(resource:URI, position:EditorCommon.IRange, up:boolean):WinJS.TPromise<Modes.IInplaceReplaceSupportResult> {
		return this._worker((w) => w.navigateValueSet(resource, position, up));
	}

	static $_pickAWorkerToValidate = OneWorkerAttr(CSSMode, CSSMode.prototype._pickAWorkerToValidate, ThreadAffinity.Group1);
	private _pickAWorkerToValidate(): WinJS.TPromise<void> {
		return this._worker((w) => w.enableValidator());
	}

	static $findOccurrences = OneWorkerAttr(CSSMode, CSSMode.prototype.findOccurrences);
	public findOccurrences(resource:URI, position:EditorCommon.IPosition, strict:boolean = false): WinJS.TPromise<Modes.IOccurence[]> {
		return this._worker((w) => w.findOccurrences(resource, position, strict));
	}

	static $suggest = OneWorkerAttr(CSSMode, CSSMode.prototype.suggest);
	public suggest(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ISuggestResult[]> {
		return this._worker((w) => w.suggest(resource, position));
	}

	static $findDeclaration = OneWorkerAttr(CSSMode, CSSMode.prototype.findDeclaration);
	public findDeclaration(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.IReference> {
		return this._worker((w) => w.findDeclaration(resource, position));
	}

	static $computeInfo = OneWorkerAttr(CSSMode, CSSMode.prototype.computeInfo);
	public computeInfo(resource:URI, position:EditorCommon.IPosition): WinJS.TPromise<Modes.IComputeExtraInfoResult> {
		return this._worker((w) => w.computeInfo(resource, position));
	}

	static $findReferences = OneWorkerAttr(CSSMode, CSSMode.prototype.findReferences);
	public findReferences(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.IReference[]> {
		return this._worker((w) => w.findReferences(resource, position));
	}

	static $getRangesToPosition = OneWorkerAttr(CSSMode, CSSMode.prototype.getRangesToPosition);
	public getRangesToPosition(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ILogicalSelectionEntry[]> {
		return this._worker((w) => w.getRangesToPosition(resource, position));
	}

	static $getOutline = OneWorkerAttr(CSSMode, CSSMode.prototype.getOutline);
	public getOutline(resource:URI):WinJS.TPromise<Modes.IOutlineEntry[]> {
		return this._worker((w) => w.getOutline(resource));
	}

	static $findColorDeclarations = OneWorkerAttr(CSSMode, CSSMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:URI):WinJS.TPromise<{range:EditorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}

	static getQuickFixes = OneWorkerAttr(CSSMode, CSSMode.prototype.getQuickFixes);
	public getQuickFixes(resource: URI, marker: IMarker | EditorCommon.IRange): WinJS.TPromise<Modes.IQuickFix[]>{
		return this._worker((w) => w.getQuickFixes(resource, marker));
	}

	static runQuickFixAction = OneWorkerAttr(CSSMode, CSSMode.prototype.runQuickFixAction);
	public runQuickFixAction(resource:URI, range:EditorCommon.IRange, id: any):WinJS.TPromise<Modes.IQuickFixResult>{
		return this._worker((w) => w.runQuickFixAction(resource, range, id));
	}
}
