/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import modesExtensions = require('vs/editor/common/modes/modesRegistry');
import supports = require('vs/editor/common/modes/supports');
import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import Platform = require('vs/platform/platform');
import { AsyncDescriptor2, createAsyncDescriptor2 } from 'vs/platform/instantiation/common/descriptors';
import winjs = require('vs/base/common/winjs.base');
import network = require('vs/base/common/network');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import htmlWorker = require('vs/languages/html/common/htmlWorker');
import { AbstractMode, createWordRegExp } from 'vs/editor/common/modes/abstractMode';
import { AbstractState } from 'vs/editor/common/modes/abstractState';
import {OneWorkerAttr} from 'vs/platform/thread/common/threadService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService } from 'vs/platform/thread/common/thread';
import * as htmlTokenTypes from 'vs/languages/html/common/htmlTokenTypes';
import {EMPTY_ELEMENTS} from 'vs/languages/html/common/htmlEmptyTagsShared';

export { htmlTokenTypes }; // export to be used by Razor. We are the main module, so Razor should get ot from use.

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
		return htmlTokenTypes.getTag(s.replace(/[:_]/g, '-'));
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
					return { type: htmlTokenTypes.DELIM_COMMENT, bracket: Modes.Bracket.Close };
				}
				break;

			case States.WithinDoctype:
				if (stream.advanceUntilString2('>', false)) {
					return { type: htmlTokenTypes.DOCTYPE};
				} else if(stream.advanceIfString2('>')) {
					this.kind = States.Content;
					return { type: htmlTokenTypes.DELIM_DOCTYPE, bracket: Modes.Bracket.Close };
				}
			break;

			case States.Content:
				if (stream.advanceIfCharCode2('<'.charCodeAt(0))) {
					if (!stream.eos() && stream.peek() === '!') {
						if (stream.advanceIfString2('!--')) {
							this.kind = States.WithinComment;
							return { type: htmlTokenTypes.DELIM_COMMENT, bracket: Modes.Bracket.Open };
						}
						if (stream.advanceIfStringCaseInsensitive2('!DOCTYPE')) {
							this.kind = States.WithinDoctype;
							return { type: htmlTokenTypes.DELIM_DOCTYPE, bracket: Modes.Bracket.Open };
						}
					}
					if (stream.advanceIfCharCode2('/'.charCodeAt(0))) {
						this.kind = States.OpeningEndTag;
						return { type: htmlTokenTypes.DELIM_END, bracket: Modes.Bracket.Open };
					}
					this.kind = States.OpeningStartTag;
					return { type: htmlTokenTypes.DELIM_START, bracket: Modes.Bracket.Open };
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
					return { type: htmlTokenTypes.DELIM_END, bracket: Modes.Bracket.Close };

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
							return { type: htmlTokenTypes.DELIM_START, bracket: Modes.Bracket.Close };
					} if (stream.advanceIfCharCode2('>'.charCodeAt(0))) {
						if (tagsEmbeddingContent.indexOf(this.lastTagName) !== -1) {
							this.kind = States.WithinEmbeddedContent;
							return { type: htmlTokenTypes.DELIM_START, bracket: Modes.Bracket.Close };
						} else {
							this.kind = States.Content;
							return { type: htmlTokenTypes.DELIM_START, bracket: Modes.Bracket.Close };
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

export class HTMLMode<W extends htmlWorker.HTMLWorker> extends AbstractMode<W> implements supports.ITokenizationCustomization {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public electricCharacterSupport: Modes.IElectricCharacterSupport;
	public characterPairSupport: Modes.ICharacterPairSupport;

	public extraInfoSupport:Modes.IExtraInfoSupport;
	public occurrencesSupport:Modes.IOccurrencesSupport;
	public referenceSupport: Modes.IReferenceSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public formattingSupport: Modes.IFormattingSupport;
	public parameterHintsSupport: Modes.IParameterHintsSupport;
	public suggestSupport: Modes.ISuggestSupport;
	public onEnterSupport: Modes.IOnEnterSupport;

	private modeService:IModeService;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IModeService modeService: IModeService
	) {
		super(descriptor, instantiationService, threadService);

		this.modeService = modeService;

		this.tokenizationSupport = new supports.TokenizationSupport(this, this, true, true);
		this.electricCharacterSupport = new supports.BracketElectricCharacterSupport(this,
			{
				brackets: [],
				regexBrackets:[
					{	tokenType: htmlTokenTypes.getTag('$1'),
						open: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join("|")}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
						closeComplete: '</$1>',
						close: /<\/(\w[\w\d]*)\s*>$/i }],
				caseInsensitive:true,
				embeddedElectricCharacters: ['*', '}', ']', ')']
			});

		this.formattingSupport = this;
		this.extraInfoSupport = this;
		this.occurrencesSupport = this;
		this.referenceSupport = new supports.ReferenceSupport(this, {
			tokens: ['invalid'],
			findReferences: (resource, position, includeDeclaration) => this.findReferences(resource, position, includeDeclaration)});
		this.logicalSelectionSupport = this;

		this.parameterHintsSupport = new supports.ParameterHintsSupport(this, {
			triggerCharacters: ['(', ','],
			excludeTokens: ['*'],
			getParameterHints: (resource, position) => this.getParameterHints(resource, position)});
		// TODO@Alex TODO@Joh: there is something off about declaration support of embedded JS in HTML
		// this.declarationSupport = new supports.DeclarationSupport(this, {
		// 		tokens: ['invalid'],
		// 		findDeclaration: (resource, position) => this.findDeclaration(resource, position)});

		this.suggestSupport = new supports.SuggestSupport(this, {
			triggerCharacters: ['.', ':', '<', '"', '=', '/'],
			excludeTokens: ['comment'],
			suggest: (resource, position) => this.suggest(resource, position)});

		this.onEnterSupport = new OnEnterSupport(this.getId(), {
			brackets: [
				{ open: '<!--', close: '-->' }
			]
		});
	}

	public asyncCtor(): winjs.Promise {
		return winjs.Promise.join([
			this.modeService.getOrCreateMode('text/javascript'),
			this.modeService.getOrCreateMode('text/css')
		]).then((embeddableModes) => {
			var autoClosingPairs = this._getAutoClosingPairs(embeddableModes);

			this.characterPairSupport = new supports.CharacterPairSupport(this, {
				autoClosingPairs: autoClosingPairs.slice(0),
				surroundingPairs: [
						{ open: '"', close: '"' },
						{ open: '\'', close: '\'' }
					]});
		});
	}

	private _getAutoClosingPairs(embeddableModes: Modes.IMode[]): Modes.IAutoClosingPair[]{
		var map:{[key:string]:string;} = {
			'"': '"',
			'\'': '\''
		};

		embeddableModes.forEach((embeddableMode) => this._collectAutoClosingPairs(map, embeddableMode));

		var result:Modes.IAutoClosingPair[] = [],
			key: string;

		for (key in map) {
			result.push({
				open: key,
				close: map[key]
			});
		};

		return result;
	}

	private _collectAutoClosingPairs(result:{[key:string]:string;}, mode:Modes.IMode): void {
		if (mode && mode.characterPairSupport) {
			var acp = mode.characterPairSupport.getAutoClosingPairs();
			if (acp !== null) {
				for(var i = 0; i < acp.length; i++) {
					result[acp[i].open] = acp[i].close;
				}
			}
		}
	}

	// TokenizationSupport

	public getInitialState():Modes.IState {
		return new State(this, States.Content, '', '', '', '', '');
	}

	public enterNestedMode(state:Modes.IState):boolean {
		return state instanceof State && (<State>state).kind === States.WithinEmbeddedContent;
	}

	public getNestedMode(state:Modes.IState): supports.IEnteringNestedModeData {
		var result:Modes.IMode = null;
		var htmlState:State = <State>state;
		var missingModePromise: winjs.Promise = null;

		if (htmlState.embeddedContentType !== null) {
			if (modesRegistry.isRegisteredMode(htmlState.embeddedContentType)) {
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

	public getLeavingNestedModeData(line:string, state:Modes.IState):supports.ILeavingNestedModeData {
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

	public static WORD_DEFINITION = createWordRegExp('#-?%');
	public getWordDefinition():RegExp {
		return HTMLMode.WORD_DEFINITION;
	}

	public getCommentsConfiguration():Modes.ICommentsConfiguration {
		return { blockCommentStartToken: '<!--', blockCommentEndToken: '-->' };
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], htmlWorker.HTMLWorker> {
		return createAsyncDescriptor2('vs/languages/html/common/htmlWorker', 'HTMLWorker');
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

var modesRegistry = <modesExtensions.IEditorModesRegistry>Platform.Registry.as(modesExtensions.Extensions.EditorModes);
