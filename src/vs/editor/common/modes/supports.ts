/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Strings = require('vs/base/common/strings');
import {IModelService} from 'vs/editor/common/services/modelService';
import {LineStream} from 'vs/editor/common/modes/lineStream';
import {NullMode, NullState, nullTokenize} from 'vs/editor/common/modes/nullMode';
import {Brackets} from 'vs/editor/common/modes/autoIndentation';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import Modes = require('vs/editor/common/modes');
import EditorCommon = require('vs/editor/common/editorCommon');
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {Arrays} from 'vs/editor/common/core/arrays';
import URI from 'vs/base/common/uri';
import {IDisposable} from 'vs/base/common/lifecycle';

export class Token implements Modes.IToken {
	public startIndex:number;
	public type:string;
	public bracket:Modes.Bracket;

	constructor(startIndex:number, type:string, bracket:Modes.Bracket) {
		this.startIndex = startIndex;
		this.type = type;
		this.bracket = bracket;
	}

	public toString(): string {
		return '(' + this.startIndex + ', ' + this.type + ', ' + this.bracket + ')';
	}
}

export function handleEvent<T>(context:Modes.ILineContext, offset:number, runner:(mode:Modes.IMode, newContext:Modes.ILineContext, offset:number)=>T):T {
	var modeTransitions = context.modeTransitions;
	if (modeTransitions.length === 1) {
		return runner(modeTransitions[0].mode, context, offset);
	}

	var modeIndex = Arrays.findIndexInSegmentsArray(modeTransitions, offset);
	var nestedMode = modeTransitions[modeIndex].mode;
	var modeStartIndex = modeTransitions[modeIndex].startIndex;

	var firstTokenInModeIndex = context.findIndexOfOffset(modeStartIndex);
	var nextCharacterAfterModeIndex = -1;
	var nextTokenAfterMode = -1;
	if (modeIndex + 1 < modeTransitions.length) {
		nextTokenAfterMode = context.findIndexOfOffset(modeTransitions[modeIndex + 1].startIndex);
		nextCharacterAfterModeIndex = context.getTokenStartIndex(nextTokenAfterMode);
	} else {
		nextTokenAfterMode = context.getTokenCount();
		nextCharacterAfterModeIndex = context.getLineContent().length;
	}

	var firstTokenCharacterOffset = context.getTokenStartIndex(firstTokenInModeIndex);
	var newCtx = new FilteredLineContext(context, nestedMode, firstTokenInModeIndex, nextTokenAfterMode, firstTokenCharacterOffset, nextCharacterAfterModeIndex);
	return runner(nestedMode, newCtx, offset - firstTokenCharacterOffset);
}

/**
 * Returns {{true}} if the line token at the specified
 * offset matches one of the provided types. Matching
 * happens on a substring start from the end, unless
 * anywhereInToken is set to true in which case matches
 * happen on a substring at any position.
 */
export function isLineToken(context:Modes.ILineContext, offset:number, types:string[], anywhereInToken:boolean = false):boolean {

	if (!Array.isArray(types) || types.length === 0) {
		return false;
	}

	if (context.getLineContent().length <= offset) {
		return false;
	}

	var tokenIdx = context.findIndexOfOffset(offset);
	var type = context.getTokenType(tokenIdx);

	for (var i = 0, len = types.length; i < len; i++) {
		if (anywhereInToken) {
			if (type.indexOf(types[i]) >= 0) {
				return true;
			}
		}
		else {
			if (Strings.endsWith(type, types[i])) {
				return true;
			}
		}
	}

	return false;
}

export class FilteredLineContext implements Modes.ILineContext {

	public modeTransitions: Modes.IModeTransition[];

	private _actual:Modes.ILineContext;
	private _firstTokenInModeIndex:number;
	private _nextTokenAfterMode:number;
	private _firstTokenCharacterOffset:number;
	private _nextCharacterAfterModeIndex:number;

	constructor(actual:Modes.ILineContext, mode:Modes.IMode,
			firstTokenInModeIndex:number, nextTokenAfterMode:number,
			firstTokenCharacterOffset:number, nextCharacterAfterModeIndex:number) {

		this.modeTransitions = [{
			startIndex: 0,
			mode: mode
		}];
		this._actual = actual;
		this._firstTokenInModeIndex = firstTokenInModeIndex;
		this._nextTokenAfterMode = nextTokenAfterMode;
		this._firstTokenCharacterOffset = firstTokenCharacterOffset;
		this._nextCharacterAfterModeIndex = nextCharacterAfterModeIndex;
	}

	public getLineContent(): string {
		var actualLineContent = this._actual.getLineContent();
		return actualLineContent.substring(this._firstTokenCharacterOffset, this._nextCharacterAfterModeIndex);
	}

	public getTokenCount(): number {
		return this._nextTokenAfterMode - this._firstTokenInModeIndex;
	}

	public findIndexOfOffset(offset:number): number {
		return this._actual.findIndexOfOffset(offset + this._firstTokenCharacterOffset) - this._firstTokenInModeIndex;
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return this._actual.getTokenStartIndex(tokenIndex + this._firstTokenInModeIndex) - this._firstTokenCharacterOffset;
	}

	public getTokenEndIndex(tokenIndex:number): number {
		return this._actual.getTokenEndIndex(tokenIndex + this._firstTokenInModeIndex) - this._firstTokenCharacterOffset;
	}

	public getTokenType(tokenIndex:number): string {
		return this._actual.getTokenType(tokenIndex + this._firstTokenInModeIndex);
	}

	public getTokenBracket(tokenIndex:number): Modes.Bracket {
		return this._actual.getTokenBracket(tokenIndex + this._firstTokenInModeIndex);
	}

	public getTokenText(tokenIndex:number): string {
		return this._actual.getTokenText(tokenIndex + this._firstTokenInModeIndex);
	}
}


export class AbstractSupport {

	private _mode:Modes.IMode;

	constructor(mode:Modes.IMode) {
		this._mode = mode;
	}

	public get mode() {
		return this._mode;
	}
}

//---  Tokenazation support implementation

export interface ILeavingNestedModeData {
	/**
	 * The part of the line that will be tokenized by the nested mode
	 */
	nestedModeBuffer: string;

	/**
	 * The part of the line that will be tokenized by the parent mode when it continues after the nested mode
	 */
	bufferAfterNestedMode: string;

	/**
	 * The state that will be used for continuing tokenization by the parent mode after the nested mode
	 */
	stateAfterNestedMode: Modes.IState;
}

export interface IEnteringNestedModeData {
	mode:Modes.IMode;
	missingModePromise:TPromise<void>;
}

export interface ITokenizationCustomization {

	getInitialState():Modes.IState;

	enterNestedMode?: (state:Modes.IState) => boolean;

	getNestedMode?: (state:Modes.IState) => IEnteringNestedModeData;

	getNestedModeInitialState?: (myState:Modes.IState) => { state:Modes.IState; missingModePromise:TPromise<void>; };

	/**
	 * Return null if the line does not leave the nested mode
	 */
	getLeavingNestedModeData?: (line:string, state:Modes.IState) => ILeavingNestedModeData;

	/**
	 * Callback for when leaving a nested mode and returning to the outer mode.
	 * @param myStateAfterNestedMode The outer mode's state that will begin to tokenize
	 * @param lastNestedModeState The nested mode's last state
	 */
	onReturningFromNestedMode?: (myStateAfterNestedMode:Modes.IState, lastNestedModeState:Modes.IState)=> void;
}

function isFunction(something) {
	return typeof something === 'function';
}

export class TokenizationSupport extends AbstractSupport implements Modes.ITokenizationSupport, IDisposable {

	static MAX_EMBEDDED_LEVELS = 5;

	private customization:ITokenizationCustomization;
	private defaults: {
		enterNestedMode: boolean;
		getNestedMode: boolean;
		getNestedModeInitialState: boolean;
		getLeavingNestedModeData: boolean;
		onReturningFromNestedMode: boolean;
	};

	public shouldGenerateEmbeddedModels:boolean;
	public supportsNestedModes:boolean;

	private _embeddedModesListeners: { [modeId:string]: IDisposable; };

	constructor(mode:Modes.IMode, customization:ITokenizationCustomization, supportsNestedModes:boolean, shouldGenerateEmbeddedModels:boolean) {
		super(mode);
		this.customization = customization;
		this.supportsNestedModes = supportsNestedModes;
		this._embeddedModesListeners = {};
		if (this.supportsNestedModes) {
			if (!this.mode.registerSupport) {
				throw new Error('Cannot be a mode with nested modes unless I can emit a tokenizationSupport changed event!');
			}
		}
		this.shouldGenerateEmbeddedModels = shouldGenerateEmbeddedModels;
		this.defaults = {
			enterNestedMode: !isFunction(customization.enterNestedMode),
			getNestedMode: !isFunction(customization.getNestedMode),
			getNestedModeInitialState: !isFunction(customization.getNestedModeInitialState),
			getLeavingNestedModeData: !isFunction(customization.getLeavingNestedModeData),
			onReturningFromNestedMode: !isFunction(customization.onReturningFromNestedMode)
		};
	}

	public dispose() : void {
		for (var listener in this._embeddedModesListeners) {
			this._embeddedModesListeners[listener].dispose();
			delete this._embeddedModesListeners[listener];
		}
	}

	public getInitialState(): Modes.IState {
		return this.customization.getInitialState();
	}

	public tokenize(line:string, state:Modes.IState, deltaOffset:number = 0, stopAtOffset:number = deltaOffset + line.length):Modes.ILineTokens {
		if (state.getMode() !== this.mode) {
			return this._nestedTokenize(line, state, deltaOffset, stopAtOffset, [], []);
		} else {
			return this._myTokenize(line, state, deltaOffset, stopAtOffset, [], []);
		}
	}

	/**
	 * Precondition is: nestedModeState.getMode() !== this
	 * This means we are in a nested mode when parsing starts on this line.
	 */
	private _nestedTokenize(buffer:string, nestedModeState:Modes.IState, deltaOffset:number, stopAtOffset:number, prependTokens:Modes.IToken[], prependModeTransitions:Modes.IModeTransition[]):Modes.ILineTokens {
		var myStateBeforeNestedMode = nestedModeState.getStateData();
		var leavingNestedModeData = this.getLeavingNestedModeData(buffer, myStateBeforeNestedMode);

		// Be sure to give every embedded mode the
		// opportunity to leave nested mode.
		// i.e. Don't go straight to the most nested mode
		var stepOnceNestedState = nestedModeState;
		while (stepOnceNestedState.getStateData() && stepOnceNestedState.getStateData().getMode() !== this.mode) {
			stepOnceNestedState = stepOnceNestedState.getStateData();
		}
		var nestedMode = stepOnceNestedState.getMode();

		if (!leavingNestedModeData) {
			// tokenization will not leave nested mode
			var result:Modes.ILineTokens;
			if (nestedMode.tokenizationSupport) {
				result = nestedMode.tokenizationSupport.tokenize(buffer, nestedModeState, deltaOffset, stopAtOffset);
			} else {
				// The nested mode doesn't have tokenization support,
				// unfortunatelly this means we have to fake it
				result = nullTokenize(nestedMode, buffer, nestedModeState, deltaOffset);
			}
			result.tokens = prependTokens.concat(result.tokens);
			result.modeTransitions = prependModeTransitions.concat(result.modeTransitions);
			return result;
		}

		var nestedModeBuffer = leavingNestedModeData.nestedModeBuffer;
		if (nestedModeBuffer.length > 0) {
			// Tokenize with the nested mode
			var nestedModeLineTokens:Modes.ILineTokens;
			if (nestedMode.tokenizationSupport) {
				nestedModeLineTokens = nestedMode.tokenizationSupport.tokenize(nestedModeBuffer, nestedModeState, deltaOffset, stopAtOffset);
			} else {
				// The nested mode doesn't have tokenization support,
				// unfortunatelly this means we have to fake it
				nestedModeLineTokens = nullTokenize(nestedMode, nestedModeBuffer, nestedModeState, deltaOffset);
			}

			// Save last state of nested mode
			nestedModeState = nestedModeLineTokens.endState;

			// Prepend nested mode's result to our result
			prependTokens = prependTokens.concat(nestedModeLineTokens.tokens);
			prependModeTransitions = prependModeTransitions.concat(nestedModeLineTokens.modeTransitions);
		}

		var bufferAfterNestedMode = leavingNestedModeData.bufferAfterNestedMode;
		var myStateAfterNestedMode = leavingNestedModeData.stateAfterNestedMode;
		myStateAfterNestedMode.setStateData(myStateBeforeNestedMode.getStateData());
		this.onReturningFromNestedMode(myStateAfterNestedMode, nestedModeState);

		return this._myTokenize(bufferAfterNestedMode, myStateAfterNestedMode, deltaOffset + nestedModeBuffer.length, stopAtOffset, prependTokens, prependModeTransitions);
	}

	/**
	 * Precondition is: state.getMode() === this
	 * This means we are in the current mode when parsing starts on this line.
	 */
	private _myTokenize(buffer:string, myState:Modes.IState, deltaOffset:number, stopAtOffset:number, prependTokens:Modes.IToken[], prependModeTransitions:Modes.IModeTransition[]):Modes.ILineTokens {
		var lineStream = new LineStream(buffer);
		var tokenResult:Modes.ITokenizationResult, beforeTokenizeStreamPos:number;
		var previousType:string = null;
		var retokenize:TPromise<void> = null;

		myState = myState.clone();
		if (prependModeTransitions.length <= 0 || prependModeTransitions[prependModeTransitions.length-1].mode !== this.mode) {
			// Avoid transitioning to the same mode (this can happen in case of empty embedded modes)
			prependModeTransitions.push({
				startIndex: deltaOffset,
				mode: this.mode
			});
		}

		var maxPos = Math.min(stopAtOffset - deltaOffset, buffer.length);
		var noneBracket = Modes.Bracket.None;
		while (lineStream.pos() < maxPos) {
			beforeTokenizeStreamPos = lineStream.pos();

			do {
				tokenResult = myState.tokenize(lineStream);
				if (tokenResult === null || tokenResult === undefined ||
					((tokenResult.type === undefined || tokenResult.type === null) &&
					(tokenResult.nextState === undefined || tokenResult.nextState === null))) {
					throw new Error('Tokenizer must return a valid state');
				}

				if (tokenResult.nextState) {
					tokenResult.nextState.setStateData(myState.getStateData());
					myState = tokenResult.nextState;
				}
				if (lineStream.pos() <= beforeTokenizeStreamPos) {
					throw new Error('Stream did not advance while tokenizing. Mode id is ' + this.mode.getId() + ' (stuck at token type: "' + tokenResult.type + '", prepend tokens: "' + (prependTokens.map(t => t.type).join(',')) + '").');
				}
			} while (!tokenResult.type && tokenResult.type !== '');

			if (previousType !== tokenResult.type || tokenResult.bracket || previousType === null) {
				prependTokens.push(new Token(beforeTokenizeStreamPos + deltaOffset, tokenResult.type, tokenResult.bracket || noneBracket));
			}

			previousType = tokenResult.type;

			if (this.supportsNestedModes && this.enterNestedMode(myState)) {
				var currentEmbeddedLevels = this._getEmbeddedLevel(myState);
				if (currentEmbeddedLevels < TokenizationSupport.MAX_EMBEDDED_LEVELS) {
					var nestedModeState = this.getNestedModeInitialState(myState);

					// Re-emit tokenizationSupport change events from all modes that I ever embedded
					var embeddedMode = nestedModeState.state.getMode();
					if (typeof embeddedMode.addSupportChangedListener === 'function' && !this._embeddedModesListeners.hasOwnProperty(embeddedMode.getId())) {
						var emitting = false;
						this._embeddedModesListeners[embeddedMode.getId()] = embeddedMode.addSupportChangedListener((e) => {
							if (emitting) {
								return;
							}
							if (e.tokenizationSupport) {
								emitting = true;
								this.mode.registerSupport('tokenizationSupport', (mode) => {
									return mode.tokenizationSupport;
								});
								emitting = false;
							}
						});
					}


					if (!lineStream.eos()) {
						// There is content from the embedded mode
						var restOfBuffer = buffer.substr(lineStream.pos());
						var result = this._nestedTokenize(restOfBuffer, nestedModeState.state, deltaOffset + lineStream.pos(), stopAtOffset, prependTokens, prependModeTransitions);
						result.retokenize = result.retokenize || nestedModeState.missingModePromise;
						return result;
					} else {
						// Transition to the nested mode state
						myState = nestedModeState.state;
						retokenize = nestedModeState.missingModePromise;
					}
				}
			}
		}

		return {
			tokens: prependTokens,
			actualStopOffset: lineStream.pos() + deltaOffset,
			modeTransitions: prependModeTransitions,
			endState: myState,
			retokenize: retokenize
		};
	}

	private _getEmbeddedLevel(state:Modes.IState): number {
		var result = -1;
		while(state) {
			result++;
			state = state.getStateData();
		}
		return result;
	}

	private enterNestedMode(state:Modes.IState): boolean {
		if (this.defaults.enterNestedMode) {
			return false;
		}
		return this.customization.enterNestedMode(state);

	}

	private getNestedMode(state:Modes.IState): IEnteringNestedModeData {
		if (this.defaults.getNestedMode) {
			return null;
		}
		return this.customization.getNestedMode(state);
	}

	private static _validatedNestedMode(input:IEnteringNestedModeData): IEnteringNestedModeData {
		var mode: Modes.IMode = new NullMode(),
			missingModePromise: TPromise<void> = null;

		if (input && input.mode) {
			mode = input.mode;
		}
		if (input && input.missingModePromise) {
			missingModePromise = input.missingModePromise;
		}

		return {
			mode: mode,
			missingModePromise: missingModePromise
		};
	}

	private getNestedModeInitialState(state:Modes.IState): { state:Modes.IState; missingModePromise:TPromise<void>; } {
		if (this.defaults.getNestedModeInitialState) {
			var nestedMode = TokenizationSupport._validatedNestedMode(this.getNestedMode(state));
			var missingModePromise = nestedMode.missingModePromise;
			var nestedModeState: Modes.IState;

			if (nestedMode.mode.tokenizationSupport) {
				nestedModeState = nestedMode.mode.tokenizationSupport.getInitialState();
			} else {
				nestedModeState = new NullState(nestedMode.mode, null);
			}

			nestedModeState.setStateData(state);

			return {
				state: nestedModeState,
				missingModePromise: missingModePromise
			};
		}
		return this.customization.getNestedModeInitialState(state);
	}

	private getLeavingNestedModeData(line:string, state:Modes.IState): ILeavingNestedModeData {
		if (this.defaults.getLeavingNestedModeData) {
			return null;
		}
		return this.customization.getLeavingNestedModeData(line, state);
	}

	private onReturningFromNestedMode(myStateAfterNestedMode:Modes.IState, lastNestedModeState:Modes.IState): void {
		if (this.defaults.onReturningFromNestedMode) {
			return null;
		}
		return this.customization.onReturningFromNestedMode(myStateAfterNestedMode, lastNestedModeState);
	}
}

export interface IBracketElectricCharacterContribution {
	brackets: Modes.IBracketPair[];
	regexBrackets?: Modes.IRegexBracketPair[];
	docComment?: Modes.IDocComment;
	caseInsensitive?: boolean;
	embeddedElectricCharacters?: string[];
}
export class BracketElectricCharacterSupport extends AbstractSupport implements Modes.IElectricCharacterSupport {

	private contribution: IBracketElectricCharacterContribution;
	private brackets: Brackets;

	constructor(mode:Modes.IMode, contribution: IBracketElectricCharacterContribution) {
		super(mode);
		this.contribution = contribution;
		this.brackets = new Brackets(contribution.brackets, contribution.regexBrackets,
			contribution.docComment, contribution.caseInsensitive);
	}

	public getElectricCharacters(): string[]{
		if (Array.isArray(this.contribution.embeddedElectricCharacters)) {
			return this.contribution.embeddedElectricCharacters.concat(this.brackets.getElectricCharacters());
		}
		return this.brackets.getElectricCharacters();
	}

	public onElectricCharacter(context:Modes.ILineContext, offset:number): Modes.IElectricAction {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {
				return this.brackets.onElectricCharacter(context, offset);
			} else if (nestedMode.electricCharacterSupport) {
				return nestedMode.electricCharacterSupport.onElectricCharacter(context, offset);
			} else {
				return null;
			}
		});
	}

	public onEnter(context: Modes.ILineContext, offset: number): Modes.IEnterAction {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {
				return this.brackets.onEnter(context, offset);
			} else if (nestedMode.electricCharacterSupport) {
				return nestedMode.electricCharacterSupport.onEnter(context, offset);
			} else {
				return null;
			}
		});
	}
}



export interface IDeclarationContribution {
	tokens?: string[];
	findDeclaration: (resource: URI, position: EditorCommon.IPosition) => TPromise<Modes.IReference>;
}
export class DeclarationSupport extends AbstractSupport implements Modes.IDeclarationSupport {

	private contribution: IDeclarationContribution;

	/**
	 * Provide the token type postfixes for the tokens where a declaration can be found in the 'tokens' argument.
	 */
	constructor(mode: Modes.IMode, contribution: IDeclarationContribution) {
		super(mode);
		this.contribution = contribution;
	}

	public canFindDeclaration(context: Modes.ILineContext, offset:number):boolean {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {
				return (!Array.isArray(this.contribution.tokens) ||
					this.contribution.tokens.length < 1 ||
					isLineToken(context, offset, this.contribution.tokens));
			} else if (nestedMode.declarationSupport) {
				return nestedMode.declarationSupport.canFindDeclaration(context, offset);
			} else {
				return false;
			}
		});
	}

	public findDeclaration(resource: URI, position: EditorCommon.IPosition): TPromise<Modes.IReference>{
		return this.contribution.findDeclaration(resource, position);
	}
}

export interface ITypeDeclarationContribution {
	tokens: string[];
	findTypeDeclaration: (resource: URI, position: EditorCommon.IPosition) => TPromise<Modes.IReference>;
}
export class TypeDeclarationSupport extends AbstractSupport implements Modes.ITypeDeclarationSupport {

	private contribution: ITypeDeclarationContribution;

	/**
	 * Provide the token type postfixes for the tokens where a declaration can be found in the 'tokens' argument.
	 */
	constructor(mode: Modes.IMode, contribution: ITypeDeclarationContribution) {
		super(mode);
		this.contribution = contribution;
	}

	public canFindTypeDeclaration(context: Modes.ILineContext, offset:number):boolean {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {
				return (!Array.isArray(this.contribution.tokens) ||
					this.contribution.tokens.length < 1 ||
					isLineToken(context, offset, this.contribution.tokens));
			} else if (nestedMode.typeDeclarationSupport) {
				return nestedMode.typeDeclarationSupport.canFindTypeDeclaration(context, offset);
			} else {
				return false;
			}
		});
	}

	public findTypeDeclaration(resource: URI, position: EditorCommon.IPosition): TPromise<Modes.IReference> {
		return this.contribution.findTypeDeclaration(resource, position);
	}
}

export interface IReferenceContribution {
	tokens: string[];
	findReferences: (resource: URI, position: EditorCommon.IPosition, includeDeclaration: boolean) => TPromise<Modes.IReference[]>;
}

export class ReferenceSupport extends AbstractSupport implements Modes.IReferenceSupport {

	private contribution: IReferenceContribution;

	/**
	 * Provide the token type postfixes for the tokens where a reference can be found in the 'tokens' argument.
	 */
	constructor(mode: Modes.IMode, contribution: IReferenceContribution) {
		super(mode);
		this.contribution = contribution;
	}

	public canFindReferences(context: Modes.ILineContext, offset:number):boolean {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {
				return (!Array.isArray(this.contribution.tokens) ||
					this.contribution.tokens.length < 1 ||
					isLineToken(context, offset, this.contribution.tokens));
			} else if (nestedMode.referenceSupport) {
				return nestedMode.referenceSupport.canFindReferences(context, offset);
			} else {
				return false;
			}
		});
	}

	public findReferences(resource: URI, position: EditorCommon.IPosition, includeDeclaration: boolean): TPromise<Modes.IReference[]> {
		return this.contribution.findReferences(resource, position, includeDeclaration);
	}
}

export class ParameterHintsSupport extends AbstractSupport implements Modes.IParameterHintsSupport {

	private contribution: Modes.IParameterHintsContribution;

	constructor(mode: Modes.IMode, contribution: Modes.IParameterHintsContribution) {
		super(mode);
		this.contribution = contribution;
	}

	public getParameterHintsTriggerCharacters(): string[]
	{
		return this.contribution.triggerCharacters;
	}

	public shouldTriggerParameterHints(context: Modes.ILineContext, offset: number): boolean
	{
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {
				if (!Array.isArray(this.contribution.excludeTokens)) {
					return true;
				}
				if (this.contribution.excludeTokens.length === 1 && this.contribution.excludeTokens[0] === '*') {
					return false;
				}
				return !isLineToken(context, offset-1, this.contribution.excludeTokens);
			} else if (nestedMode.parameterHintsSupport) {
				return nestedMode.parameterHintsSupport.shouldTriggerParameterHints(context, offset);
			} else {
				return false;
			}
		});
	}
	public getParameterHints(resource: URI, position: EditorCommon.IPosition): TPromise<Modes.IParameterHints> {
		return this.contribution.getParameterHints(resource, position);
	}
}

export interface ISuggestContribution {
	triggerCharacters: string[];
	disableAutoTrigger?: boolean;
	excludeTokens: string[];
	suggest: (resource: URI, position: EditorCommon.IPosition) => TPromise<Modes.ISuggestResult[]>;
	getSuggestionDetails? : (resource:URI, position:EditorCommon.IPosition, suggestion:Modes.ISuggestion) => TPromise<Modes.ISuggestion>;
}

export class SuggestSupport extends AbstractSupport implements Modes.ISuggestSupport {

	private contribution: ISuggestContribution;

	public suggest : (resource:URI, position:EditorCommon.IPosition) => TPromise<Modes.ISuggestResult[]>;
	public getSuggestionDetails : (resource:URI, position:EditorCommon.IPosition, suggestion:Modes.ISuggestion) => TPromise<Modes.ISuggestion>;

	constructor(mode: Modes.IMode, contribution : ISuggestContribution){
		super(mode);
		this.contribution = contribution;
		this.suggest = (resource, position) => contribution.suggest(resource, position);

		if (typeof contribution.getSuggestionDetails === 'function') {
			this.getSuggestionDetails = (resource, position, suggestion) => contribution.getSuggestionDetails(resource, position, suggestion);
		}
	}

	shouldAutotriggerSuggest(context: Modes.ILineContext, offset: number, triggeredByCharacter: string): boolean {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {
				if (this.contribution.disableAutoTrigger) {
					return false;
				}
				if (!Array.isArray(this.contribution.excludeTokens)) {
					return true;
				}
				if (this.contribution.excludeTokens.length === 1 && this.contribution.excludeTokens[0] === '*') {
					return false;
				}
				return  !isLineToken(context, offset-1, this.contribution.excludeTokens, true);
			} else if (nestedMode.suggestSupport) {
				return nestedMode.suggestSupport.shouldAutotriggerSuggest(context, offset, triggeredByCharacter);
			} else {
				return false;
			}
		});
	}

	public getFilter(): Modes.ISuggestionFilter {
		return DefaultFilter;
	}

	public getTriggerCharacters(): string[] {
		return this.contribution.triggerCharacters;
	}

	public shouldShowEmptySuggestionList(): boolean	{
		return true;
	}
}

export interface IComposableSuggestContribution extends ISuggestContribution {
	composeSuggest(resource:URI, position:EditorCommon.IPosition, superSuggestions:Modes.ISuggestResult[]): TPromise<Modes.ISuggestResult[]>;
}

export class ComposableSuggestSupport extends SuggestSupport {

	constructor(mode: Modes.IMode, contribution: IComposableSuggestContribution) {
		super(mode, contribution);

		this.suggest = (resource, position) => {
			return (
				contribution.suggest(resource, position)
					.then(superSuggestions => contribution.composeSuggest(resource, position, superSuggestions))
			);
		};
	}

}

export class CharacterPairSupport extends AbstractSupport implements Modes.ICharacterPairSupport {

	private _autoClosingPairs: Modes.IAutoClosingPairConditional[];
	private _surroundingPairs: Modes.IAutoClosingPair[];

	constructor(mode: Modes.IMode, contribution: Modes.ICharacterPairContribution) {

		super(mode);
		this._autoClosingPairs = contribution.autoClosingPairs;
		this._surroundingPairs = Array.isArray(contribution.surroundingPairs) ? contribution.surroundingPairs : contribution.autoClosingPairs;
	}

	public getAutoClosingPairs(): Modes.IAutoClosingPair[] {
		return this._autoClosingPairs;
	}

	public shouldAutoClosePair(character:string, context:Modes.ILineContext, offset:number): boolean {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this.mode === nestedMode) {

				// Always complete on empty line
				if (context.getTokenCount() === 0) {
					return true;
				}

				var tokenIndex = context.findIndexOfOffset(offset - 1);
				var tokenType = context.getTokenType(tokenIndex);

				for (var i = 0; i < this._autoClosingPairs.length; ++i) {
					if (this._autoClosingPairs[i].open === character) {
						if (this._autoClosingPairs[i].notIn) {
							for (var notInIndex = 0; notInIndex < this._autoClosingPairs[i].notIn.length; ++notInIndex) {
								if (tokenType.indexOf(this._autoClosingPairs[i].notIn[notInIndex]) > -1) {
									return false;
								}
							}
						}
						break;
					}
				}

				return true;
			} else if (nestedMode.characterPairSupport) {
				return nestedMode.characterPairSupport.shouldAutoClosePair(character, context, offset);
			} else {
				return null;
			}
		});
	}

	public getSurroundingPairs(): Modes.IAutoClosingPair[]{
		return this._surroundingPairs;
	}
}

export interface IReplaceSupportHelper {
	valueSetReplace(valueSet: string[], value: string, up: boolean): string;
	valueSetsReplace(valueSets: string[][], value: string, up: boolean): string;
}
class ReplaceSupportHelperImpl implements IReplaceSupportHelper {

	public valueSetsReplace(valueSets:string[][], value:string, up:boolean):string {
		var result:string = null;
		for (let i = 0, len = valueSets.length; result === null && i < len; i++) {
			result = this.valueSetReplace(valueSets[i], value, up);
		}
		return result;
	}

	public valueSetReplace(valueSet:string[], value:string, up:boolean):string {
		var idx = valueSet.indexOf(value);
		if(idx >= 0) {
			idx += up ? +1 : -1;
			if(idx < 0) {
				idx = valueSet.length - 1;
			} else {
				idx %= valueSet.length;
			}
			return valueSet[idx];
		}
		return null;
	}

}

export var ReplaceSupport: IReplaceSupportHelper = new ReplaceSupportHelperImpl();

export interface IInplaceReplaceSupportCustomization {
	textReplace?: (value: string, up: boolean) => string;
	navigateValueSetFallback?: (resource: URI, range: EditorCommon.IRange, up: boolean) => TPromise<Modes.IInplaceReplaceSupportResult>;
}

export class AbstractInplaceReplaceSupport implements Modes.IInplaceReplaceSupport {

	private defaults: {
		textReplace: boolean;
		navigateValueSetFallback: boolean;
	};
	private customization:IInplaceReplaceSupportCustomization;

	constructor(customization: IInplaceReplaceSupportCustomization = null) {
		this.defaults = {
			textReplace: !customization || !isFunction(customization.textReplace),
			navigateValueSetFallback: !customization || !isFunction(customization.navigateValueSetFallback)
		};
		this.customization = customization;
	}

	public navigateValueSet(resource:URI, range:EditorCommon.IRange, up:boolean):TPromise<Modes.IInplaceReplaceSupportResult> {
		var result = this.doNavigateValueSet(resource, range, up, true);
		if (result && result.value && result.range) {
			return TPromise.as(result);
		}
		if (this.defaults.navigateValueSetFallback) {
			return TPromise.as(null);
		}
		return this.customization.navigateValueSetFallback(resource, range, up);
	}

	private doNavigateValueSet(resource:URI, range:EditorCommon.IRange, up:boolean, selection:boolean):Modes.IInplaceReplaceSupportResult {

		var model = this.getModel(resource),
			result:Modes.IInplaceReplaceSupportResult = { range:null, value: null },
			text:string;

		if(selection) {
			// Replace selection
			if(range.startColumn === range.endColumn) {
				range.endColumn += 1;
			}
			text = model.getValueInRange(range);
			result.range = range;
		} else {
			// Replace word
			var position = { lineNumber: range.startLineNumber, column: range.startColumn };
			var	wordPos = model.getWordAtPosition(position);

			if(!wordPos || wordPos.startColumn === -1) {
				return null;
			}
			text = wordPos.word;
			result.range = { startLineNumber : range.startLineNumber, endLineNumber: range.endLineNumber, startColumn: wordPos.startColumn, endColumn: wordPos.endColumn };
		}

		// Try to replace numbers or text
		var numberResult = this.numberReplace(text, up);
		if(numberResult !== null) {
			result.value = numberResult;
		} else {
			var textResult = this.textReplace(text, up);
			if(textResult !== null) {
				result.value = textResult;
			} else if(selection) {
				return this.doNavigateValueSet(resource, range, up, false);
			}
		}
		return result;
	}

	private numberReplace(value:string, up:boolean):string {
		var precision = Math.pow(10, value.length - (value.lastIndexOf('.') + 1)),
			n1 = Number(value),
			n2 = parseFloat(value);

		if(!isNaN(n1) && !isNaN(n2) && n1 === n2) {

			if(n1 === 0 && !up) {
				return null; // don't do negative
//			} else if(n1 === 9 && up) {
//				return null; // don't insert 10 into a number
			} else {
				n1 = Math.floor(n1 * precision);
				n1 += up ? precision : -precision;
				return String(n1 / precision);
			}
		}

		return null;
	}

	private _defaultValueSet: string[][] = [
		['true', 'false'],
		['True', 'False'],
		['Private', 'Public', 'Friend', 'ReadOnly', 'Partial', 'Protected', 'WriteOnly'],
		['public', 'protected', 'private'],
	];

	private textReplace(value:string, up:boolean):string {
		if (this.defaults.textReplace) {
			return ReplaceSupport.valueSetsReplace(this._defaultValueSet, value, up);
		}
		return this.customization.textReplace(value, up)
			|| ReplaceSupport.valueSetsReplace(this._defaultValueSet, value, up);
	}

	protected getModel(resource:URI): EditorCommon.ITokenizedModel {
		throw new Error('Not implemented');
	}
}

export class WorkerInplaceReplaceSupport extends AbstractInplaceReplaceSupport {

	private resourceService: IResourceService;

	constructor(resourceService: IResourceService, customization: IInplaceReplaceSupportCustomization = null) {
		super(customization);
		this.resourceService = resourceService;
	}

	protected getModel(resource:URI): EditorCommon.ITokenizedModel {
		return this.resourceService.get(resource);
	}
}

export class MainInplaceReplaceSupport extends AbstractInplaceReplaceSupport {
	private modelService: IModelService;

	constructor(modelService: IModelService, customization: IInplaceReplaceSupportCustomization = null) {
		super(customization);
		this.modelService = modelService;
	}

	protected getModel(resource:URI): EditorCommon.ITokenizedModel {
		return this.modelService.getModel(resource);
	}
}

export interface ICommentsSupportContribution {
	commentsConfiguration: Modes.ICommentsConfiguration;
}

export class CommentsSupport implements Modes.ICommentsSupport {

	private _contribution: ICommentsSupportContribution;

	constructor(contribution:ICommentsSupportContribution) {
		this._contribution = contribution;
	}

	public getCommentsConfiguration(): Modes.ICommentsConfiguration {
		return this._contribution.commentsConfiguration;
	}

}

export interface ITokenTypeClassificationSupportContribution {
	wordDefinition?: RegExp;
}

export class TokenTypeClassificationSupport implements Modes.ITokenTypeClassificationSupport {

	private _contribution: ITokenTypeClassificationSupportContribution;

	constructor(contribution: ITokenTypeClassificationSupportContribution) {
		this._contribution = contribution;
	}

	public getWordDefinition(): RegExp {
		if (typeof this._contribution.wordDefinition === 'undefined') {
			return NullMode.DEFAULT_WORD_REGEXP;
		}
		return this._contribution.wordDefinition;
	}
}