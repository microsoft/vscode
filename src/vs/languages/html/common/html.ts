/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import winjs = require('vs/base/common/winjs.base');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import htmlWorker = require('vs/languages/html/common/htmlWorker');
import { AbstractMode, createWordRegExp, ModeWorkerManager } from 'vs/editor/common/modes/abstractMode';
import { AbstractState } from 'vs/editor/common/modes/abstractState';
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import * as htmlTokenTypes from 'vs/languages/html/common/htmlTokenTypes';
import {EMPTY_ELEMENTS} from 'vs/languages/html/common/htmlEmptyTagsShared';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {TokenizationSupport, IEnteringNestedModeData, ILeavingNestedModeData, ITokenizationCustomization} from 'vs/editor/common/modes/supports/tokenizationSupport';
// import {DeclarationSupport} from 'vs/editor/common/modes/supports/declarationSupport';
import {ReferenceSupport} from 'vs/editor/common/modes/supports/referenceSupport';
import {ParameterHintsSupport} from 'vs/editor/common/modes/supports/parameterHintsSupport';
import {SuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IThreadService} from 'vs/platform/thread/common/thread';

export { htmlTokenTypes }; // export to be used by Razor. We are the main module, so Razor should get ot from use.
export { EMPTY_ELEMENTS }; // export to be used by Razor. We are the main module, so Razor should get ot from use.

export enum States {
	Content,
	OpeningStartTag,
	OpeningEndTag,
	WithinDoctype,
	WithinTag,
	WithinComment,
	WithinEmbeddedContent,
	AttributeName,
	AttributeValue
}

// list of elements that embed other content
var tagsEmbeddingContent:string[] = ['script', 'style'];



export class State extends AbstractState {
	public kind:States;
	public lastTagName:string;
	public lastAttributeName:string;
	public embeddedContentType:string;
	public attributeValueQuote:string;
	public attributeValue:string;

	constructor(mode:Modes.IMode, kind:States, lastTagName:string, lastAttributeName:string, embeddedContentType:string, attributeValueQuote:string, attributeValue:string) {
		super(mode);
		this.kind = kind;
		this.lastTagName = lastTagName;
		this.lastAttributeName = lastAttributeName;
		this.embeddedContentType = embeddedContentType;
		this.attributeValueQuote = attributeValueQuote;
		this.attributeValue = attributeValue;
	}

	static escapeTagName(s:string):string {
		return htmlTokenTypes.getTag(s.replace(/[:_.]/g, '-'));
	}

	public makeClone():State {
		return new State(this.getMode(), this.kind, this.lastTagName, this.lastAttributeName, this.embeddedContentType, this.attributeValueQuote, this.attributeValue);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof State) {
			return (
				super.equals(other) &&
				this.kind === other.kind &&
				this.lastTagName === other.lastTagName &&
				this.lastAttributeName === other.lastAttributeName &&
				this.embeddedContentType === other.embeddedContentType &&
				this.attributeValueQuote === other.attributeValueQuote &&
				this.attributeValue === other.attributeValue
			);
		}
		return false;
	}

	private nextName(stream:Modes.IStream):string {
		return stream.advanceIfRegExp(/^[_:\w][_:\w-.\d]*/).toLowerCase();
	}

	public tokenize(stream:Modes.IStream) : Modes.ITokenizationResult {

		switch(this.kind){
			case States.WithinComment:
				if (stream.advanceUntilString2('-->', false)) {
					return { type: htmlTokenTypes.COMMENT};

				} else if(stream.advanceIfString2('-->')) {
					this.kind = States.Content;
					return { type: htmlTokenTypes.DELIM_COMMENT, dontMergeWithPrev: true };
				}
				break;

			case States.WithinDoctype:
				if (stream.advanceUntilString2('>', false)) {
					return { type: htmlTokenTypes.DOCTYPE};
				} else if(stream.advanceIfString2('>')) {
					this.kind = States.Content;
					return { type: htmlTokenTypes.DELIM_DOCTYPE, dontMergeWithPrev: true };
				}
			break;

			case States.Content:
				if (stream.advanceIfCharCode2('<'.charCodeAt(0))) {
					if (!stream.eos() && stream.peek() === '!') {
						if (stream.advanceIfString2('!--')) {
							this.kind = States.WithinComment;
							return { type: htmlTokenTypes.DELIM_COMMENT, dontMergeWithPrev: true };
						}
						if (stream.advanceIfStringCaseInsensitive2('!DOCTYPE')) {
							this.kind = States.WithinDoctype;
							return { type: htmlTokenTypes.DELIM_DOCTYPE, dontMergeWithPrev: true };
						}
					}
					if (stream.advanceIfCharCode2('/'.charCodeAt(0))) {
						this.kind = States.OpeningEndTag;
						return { type: htmlTokenTypes.DELIM_END, dontMergeWithPrev: true };
					}
					this.kind = States.OpeningStartTag;
					return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
				}
				break;

			case States.OpeningEndTag:
				var tagName = this.nextName(stream);
				if (tagName.length > 0){
					return {
						type: State.escapeTagName(tagName),
					};

				} else if (stream.advanceIfString2('>')) {
					this.kind = States.Content;
					return { type: htmlTokenTypes.DELIM_END, dontMergeWithPrev: true };

				} else {
					stream.advanceUntilString2('>', false);
					return { type: '' };
				}

			case States.OpeningStartTag:
				this.lastTagName = this.nextName(stream);
				if (this.lastTagName.length > 0) {
					this.lastAttributeName = null;
					if ('script' === this.lastTagName || 'style' === this.lastTagName) {
						this.lastAttributeName = null;
						this.embeddedContentType = null;
					}
					this.kind = States.WithinTag;
					return {
						type: State.escapeTagName(this.lastTagName),
					};
				}
				break;

			case States.WithinTag:
				if (stream.skipWhitespace2() || stream.eos()) {
					return { type: '' };
				} else {
					var name:string = this.nextName(stream);
					if (name.length > 0) {
						this.lastAttributeName = name;
						this.kind = States.AttributeName;
						return { type: htmlTokenTypes.ATTRIB_NAME };

					} else if (stream.advanceIfString2('/>')) {
							this.kind = States.Content;
							return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
					} if (stream.advanceIfCharCode2('>'.charCodeAt(0))) {
						if (tagsEmbeddingContent.indexOf(this.lastTagName) !== -1) {
							this.kind = States.WithinEmbeddedContent;
							return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
						} else {
							this.kind = States.Content;
							return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
						}
					} else {
						stream.next2();
						return { type: '' };
					}
				}

			case States.AttributeName:
				if (stream.skipWhitespace2() || stream.eos()){
					return { type: '' };
				}

				if (stream.advanceIfCharCode2('='.charCodeAt(0))) {
					this.kind = States.AttributeValue;
					return { type: htmlTokenTypes.DELIM_ASSIGN };
				} else {
					this.kind = States.WithinTag;
					return this.tokenize(stream); // no advance yet - jump to WithinTag
				}

			case States.AttributeValue:
				if (stream.eos()) {
					return { type: '' };
				}
				if(stream.skipWhitespace2()) {
					if (this.attributeValueQuote === '"' || this.attributeValueQuote === '\'') {
						// We are inside the quotes of an attribute value
						return { type: htmlTokenTypes.ATTRIB_VALUE };
					}
					return { type: '' };
				}
				// We are in a attribute value
				if (this.attributeValueQuote === '"' || this.attributeValueQuote === '\'') {

					if (this.attributeValue === this.attributeValueQuote && ('script' === this.lastTagName || 'style' === this.lastTagName) && 'type' === this.lastAttributeName) {
						this.attributeValue = stream.advanceUntilString(this.attributeValueQuote, true);
						if (this.attributeValue.length > 0) {
							this.embeddedContentType = this.unquote(this.attributeValue);
							this.kind = States.WithinTag;
							this.attributeValue = '';
							this.attributeValueQuote = '';
							return { type: htmlTokenTypes.ATTRIB_VALUE };
						}
					} else {
						if (stream.advanceIfCharCode2(this.attributeValueQuote.charCodeAt(0))) {
							this.kind = States.WithinTag;
							this.attributeValue = '';
							this.attributeValueQuote = '';
						} else {
							var part = stream.next();
							this.attributeValue += part;
						}
						return { type: htmlTokenTypes.ATTRIB_VALUE };
					}
				} else {
					var ch = stream.peek();
					if (ch === '\'' || ch === '"') {
						this.attributeValueQuote = ch;
						this.attributeValue = ch;
						stream.next2();
						return { type: htmlTokenTypes.ATTRIB_VALUE };
					} else {
						this.kind = States.WithinTag;
						return this.tokenize(stream); // no advance yet - jump to WithinTag
					}
				}
		}

		stream.next2();
		this.kind = States.Content;
		return { type: '' };
	}

	private unquote(value:string):string {
		var start = 0;
		var end = value.length;
		if ('"' === value[0]) {
			start++;
		}
		if ('"' === value[end - 1]) {
			end--;
		}
		return value.substring(start, end);
	}
}

export class HTMLMode<W extends htmlWorker.HTMLWorker> extends AbstractMode implements ITokenizationCustomization {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;
	public linkSupport:Modes.ILinkSupport;
	public extraInfoSupport:Modes.IExtraInfoSupport;
	public occurrencesSupport:Modes.IOccurrencesSupport;
	public referenceSupport: Modes.IReferenceSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public formattingSupport: Modes.IFormattingSupport;
	public parameterHintsSupport: Modes.IParameterHintsSupport;
	public suggestSupport: Modes.ISuggestSupport;
	public configSupport: Modes.IConfigurationSupport;

	private modeService:IModeService;
	private threadService:IThreadService;
	private _modeWorkerManager: ModeWorkerManager<W>;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService modeService: IModeService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor.id);
		this._modeWorkerManager = this._createModeWorkerManager(descriptor, instantiationService);

		this.modeService = modeService;
		this.threadService = threadService;

		this.tokenizationSupport = new TokenizationSupport(this, this, true, true);
		this.linkSupport = this;
		this.configSupport = this;
		this.formattingSupport = this;
		this.extraInfoSupport = this;
		this.occurrencesSupport = this;
		this.referenceSupport = new ReferenceSupport(this.getId(), {
			tokens: ['invalid'],
			findReferences: (resource, position, includeDeclaration) => this.findReferences(resource, position, includeDeclaration)});
		this.logicalSelectionSupport = this;

		this.parameterHintsSupport = new ParameterHintsSupport(this.getId(), {
			triggerCharacters: ['(', ','],
			excludeTokens: ['*'],
			getParameterHints: (resource, position) => this.getParameterHints(resource, position)});
		// TODO@Alex TODO@Joh: there is something off about declaration support of embedded JS in HTML
		// this.declarationSupport = new DeclarationSupport(this, {
		// 		tokens: ['invalid'],
		// 		findDeclaration: (resource, position) => this.findDeclaration(resource, position)});

		this.suggestSupport = new SuggestSupport(this.getId(), {
			triggerCharacters: ['.', ':', '<', '"', '=', '/'],
			excludeTokens: ['comment'],
			suggest: (resource, position) => this.suggest(resource, position)});

		this.richEditSupport = this._createRichEditSupport();
	}

	public asyncCtor(): winjs.Promise {
		return winjs.Promise.join([
			this.modeService.getOrCreateMode('text/css'),
			this.modeService.getOrCreateMode('text/javascript'),
		]);
	}

	protected _createModeWorkerManager(descriptor:Modes.IModeDescriptor, instantiationService: IInstantiationService): ModeWorkerManager<W> {
		return new ModeWorkerManager<W>(descriptor, 'vs/languages/html/common/htmlWorker', 'HTMLWorker', null, instantiationService);
	}

	private _worker<T>(runner:(worker:W)=>winjs.TPromise<T>): winjs.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	protected _createRichEditSupport(): Modes.IRichEditSupport {
		return new RichEditSupport(this.getId(), null, {

			wordPattern: createWordRegExp('#-?%'),

			comments: {
				blockComment: ['<!--', '-->']
			},

			brackets: [
				['<!--', '-->'],
				['<', '>'],
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
					{ open: '"', close: '"' },
					{ open: '\'', close: '\'' }
				]
			},

			onEnterRules: [
				{
					beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					afterText: /^<\/(\w[\w\d]*)\s*>$/i,
					action: { indentAction: Modes.IndentAction.IndentOutdent }
				},
				{
					beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					action: { indentAction: Modes.IndentAction.Indent }
				}
			],
		});
	}

	// TokenizationSupport

	public getInitialState():Modes.IState {
		return new State(this, States.Content, '', '', '', '', '');
	}

	public enterNestedMode(state:Modes.IState):boolean {
		return state instanceof State && (<State>state).kind === States.WithinEmbeddedContent;
	}

	public getNestedMode(state:Modes.IState): IEnteringNestedModeData {
		var result:Modes.IMode = null;
		var htmlState:State = <State>state;
		var missingModePromise: winjs.Promise = null;

		if (htmlState.embeddedContentType !== null) {
			if (this.modeService.isRegisteredMode(htmlState.embeddedContentType)) {
				result = this.modeService.getMode(htmlState.embeddedContentType);
				if (!result) {
					missingModePromise = this.modeService.getOrCreateMode(htmlState.embeddedContentType);
				}
			}
		} else {
			var mimeType:string = null;
			if ('script' === htmlState.lastTagName) {
				mimeType = 'text/javascript';
			} else if ('style' === htmlState.lastTagName) {
				mimeType = 'text/css';
			} else {
				mimeType = 'text/plain';
			}
			result = this.modeService.getMode(mimeType);
		}
		if (result === null) {
			result = this.modeService.getMode('text/plain');
		}
		return {
			mode: result,
			missingModePromise: missingModePromise
		};
	}

	public getLeavingNestedModeData(line:string, state:Modes.IState):ILeavingNestedModeData {
		var tagName = (<State>state).lastTagName;
		var regexp = new RegExp('<\\/' + tagName + '\\s*>', 'i');
		var match:any = regexp.exec(line);
		if (match !== null) {
			return {
				nestedModeBuffer: line.substring(0, match.index),
				bufferAfterNestedMode: line.substring(match.index),
				stateAfterNestedMode: new State(this, States.Content, '', '', '', '', '')
			};
		}
		return null;
	}

	public configure(options:any): winjs.TPromise<void> {
		if (this.threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(HTMLMode, HTMLMode.prototype._configureWorkers);
	private _configureWorkers(options:any): winjs.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	static $computeLinks = OneWorkerAttr(HTMLMode, HTMLMode.prototype.computeLinks);
	public computeLinks(resource:URI):winjs.TPromise<Modes.ILink[]> {
		return this._worker((w) => w.computeLinks(resource));
	}

	static $formatRange = OneWorkerAttr(HTMLMode, HTMLMode.prototype.formatRange);
	public formatRange(resource:URI, range:EditorCommon.IRange, options:Modes.IFormattingOptions):winjs.TPromise<EditorCommon.ISingleEditOperation[]> {
		return this._worker((w) => w.format(resource, range, options));
	}

	static $computeInfo = OneWorkerAttr(HTMLMode, HTMLMode.prototype.computeInfo);
	public computeInfo(resource:URI, position:EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {
		return this._worker((w) => w.computeInfo(resource, position));
	}

	static $findReferences = OneWorkerAttr(HTMLMode, HTMLMode.prototype.findReferences);
	public findReferences(resource:URI, position:EditorCommon.IPosition, includeDeclaration:boolean): winjs.TPromise<Modes.IReference[]> {
		return this._worker((w) => w.findReferences(resource, position, includeDeclaration));
	}

	static $getRangesToPosition = OneWorkerAttr(HTMLMode, HTMLMode.prototype.getRangesToPosition);
	public getRangesToPosition(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ILogicalSelectionEntry[]> {
		return this._worker((w) => w.getRangesToPosition(resource, position));
	}

	static $findDeclaration = OneWorkerAttr(HTMLMode, HTMLMode.prototype.findDeclaration);
	public findDeclaration(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference> {
		return this._worker((w) => w.findDeclaration(resource, position));
	}

	static $findOccurrences = OneWorkerAttr(HTMLMode, HTMLMode.prototype.findOccurrences);
	public findOccurrences(resource:URI, position:EditorCommon.IPosition, strict:boolean = false): winjs.TPromise<Modes.IOccurence[]> {
		return this._worker((w) => w.findOccurrences(resource, position, strict));
	}

	static $suggest = OneWorkerAttr(HTMLMode, HTMLMode.prototype.suggest);
	public suggest(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ISuggestResult[]> {
		return this._worker((w) => w.suggest(resource, position));
	}

	static $findColorDeclarations = OneWorkerAttr(HTMLMode, HTMLMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:URI):winjs.TPromise<{range:EditorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}

	static $getParameterHints = OneWorkerAttr(HTMLMode, HTMLMode.prototype.getParameterHints);
	public getParameterHints(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.IParameterHints> {
		return this._worker((w) => w.getParameterHints(resource, position));
	}
}
