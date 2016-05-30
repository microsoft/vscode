/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import objects = require('vs/base/common/objects');
import URI from 'vs/base/common/uri';
import editorCommon = require('vs/editor/common/editorCommon');
import modes = require('vs/editor/common/modes');
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
import {wireCancellationToken} from 'vs/base/common/async';

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

	constructor(mode:modes.IMode, kind:States, inComment:boolean, quote:string, inMeta:boolean, metaBraceCount: number) {
		super(mode);
		this.kind = kind;
		this.inComment = inComment;
		this.quote = quote;
		this.inMeta = inMeta;
		this.metaBraceCount = metaBraceCount;
	}

	private nextState(next:States, token:modes.ITokenizationResult):modes.ITokenizationResult {
		this.kind = next;
		return token;
	}

	public makeClone():State {
		return new State(this.getMode(), this.kind, this.inComment, this.quote, this.inMeta, this.metaBraceCount);
	}

	public equals(other:modes.IState):boolean {
		return super.equals(other) && objects.equals(this, other);
	}

	private tokenizeInComment(stream:modes.IStream):modes.ITokenizationResult {
		if (/\*\/$/.test(stream.advanceUntilString('*/', true))) {
			this.inComment = false;
		}
		return { type:'comment.css' };
	}

	private tokenizeInString(stream:modes.IStream):modes.ITokenizationResult {
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

	private consumeIdent(stream:modes.IStream) {
		stream.goBack(1);
		if (stream.advanceIfRegExp2(identRegEx)) {
			return true;
		}
		stream.advance(1);
		return false;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
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

	public tokenizationSupport: modes.ITokenizationSupport;
	public richEditSupport: modes.IRichEditSupport;
	public inplaceReplaceSupport:modes.IInplaceReplaceSupport;
	public configSupport:modes.IConfigurationSupport;

	private _modeWorkerManager: ModeWorkerManager<cssWorker.CSSWorker>;
	private _threadService:IThreadService;

	constructor(
		descriptor:modes.IModeDescriptor,
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

			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '"', close: '"', notIn: ['string'] },
				{ open: '\'', close: '\'', notIn: ['string'] }
			]
		});

		this.inplaceReplaceSupport = this;
		this.configSupport = this;

		modes.DocumentHighlightProviderRegistry.register(this.getId(), {
			provideDocumentHighlights: (model, position, token): Thenable<modes.DocumentHighlight[]> => {
				return wireCancellationToken(token, this._provideDocumentHighlights(model.uri, position));
			}
		}, true);

		modes.HoverProviderRegistry.register(this.getId(), {
			provideHover: (model, position, token): Thenable<modes.Hover> => {
				return wireCancellationToken(token, this._provideHover(model.uri, position));
			}
		}, true);

		modes.ReferenceProviderRegistry.register(this.getId(), {
			provideReferences: (model, position, context, token): Thenable<modes.Location[]> => {
				return wireCancellationToken(token, this._provideReferences(model.uri, position));
			}
		}, true);

		modes.DocumentSymbolProviderRegistry.register(this.getId(), {
			provideDocumentSymbols: (model, token): Thenable<modes.SymbolInformation[]> => {
				return wireCancellationToken(token, this._provideDocumentSymbols(model.uri));
			}
		}, true);

		modes.DefinitionProviderRegistry.register(this.getId(), {
			provideDefinition: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._provideDefinition(model.uri, position));
			}
		}, true);

		modes.SuggestRegistry.register(this.getId(), {
			triggerCharacters: [' ', ':'],
			shouldAutotriggerSuggest: true,
			provideCompletionItems: (model, position, token): Thenable<modes.ISuggestResult[]> => {
				return wireCancellationToken(token, this._provideCompletionItems(model.uri, position));
			}
		}, true);

		modes.CodeActionProviderRegistry.register(this.getId(), {
			provideCodeActions: (model, range, token): Thenable<modes.IQuickFix[]> => {
				return wireCancellationToken(token, this._provideCodeActions(model.uri, range));
			}
		}, true);
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
	public navigateValueSet(resource:URI, position:editorCommon.IRange, up:boolean):WinJS.TPromise<modes.IInplaceReplaceSupportResult> {
		return this._worker((w) => w.navigateValueSet(resource, position, up));
	}

	static $_pickAWorkerToValidate = OneWorkerAttr(CSSMode, CSSMode.prototype._pickAWorkerToValidate, ThreadAffinity.Group1);
	private _pickAWorkerToValidate(): WinJS.TPromise<void> {
		return this._worker((w) => w.enableValidator());
	}

	static $_provideDocumentHighlights = OneWorkerAttr(CSSMode, CSSMode.prototype._provideDocumentHighlights);
	private _provideDocumentHighlights(resource:URI, position:editorCommon.IPosition): WinJS.TPromise<modes.DocumentHighlight[]> {
		return this._worker((w) => w.provideDocumentHighlights(resource, position));
	}

	static $_provideCompletionItems = OneWorkerAttr(CSSMode, CSSMode.prototype._provideCompletionItems);
	private _provideCompletionItems(resource:URI, position:editorCommon.IPosition):WinJS.TPromise<modes.ISuggestResult[]> {
		return this._worker((w) => w.provideCompletionItems(resource, position));
	}

	static $_provideDefinition = OneWorkerAttr(CSSMode, CSSMode.prototype._provideDefinition);
	private _provideDefinition(resource:URI, position:editorCommon.IPosition):WinJS.TPromise<modes.Definition> {
		return this._worker((w) => w.provideDefinition(resource, position));
	}

	static $_provideHover = OneWorkerAttr(CSSMode, CSSMode.prototype._provideHover);
	private _provideHover(resource:URI, position:editorCommon.IPosition): WinJS.TPromise<modes.Hover> {
		return this._worker((w) => w.provideHover(resource, position));
	}

	static $_provideReferences = OneWorkerAttr(CSSMode, CSSMode.prototype._provideReferences);
	private _provideReferences(resource:URI, position:editorCommon.IPosition):WinJS.TPromise<modes.Location[]> {
		return this._worker((w) => w.provideReferences(resource, position));
	}

	static $_provideDocumentSymbols = OneWorkerAttr(CSSMode, CSSMode.prototype._provideDocumentSymbols);
	private _provideDocumentSymbols(resource:URI):WinJS.TPromise<modes.SymbolInformation[]> {
		return this._worker((w) => w.provideDocumentSymbols(resource));
	}

	static $findColorDeclarations = OneWorkerAttr(CSSMode, CSSMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:URI):WinJS.TPromise<{range:editorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}

	static _provideCodeActions = OneWorkerAttr(CSSMode, CSSMode.prototype._provideCodeActions);
	private _provideCodeActions(resource: URI, marker: IMarker | editorCommon.IRange): WinJS.TPromise<modes.IQuickFix[]>{
		return this._worker((w) => w.provideCodeActions(resource, marker));
	}
}