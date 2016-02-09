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

	constructor(startIndex:number, type:string) {
		this.startIndex = startIndex;
		this.type = type;
	}

	public toString(): string {
		return '(' + this.startIndex + ', ' + this.type + ')';
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





function isFunction(something) {
	return typeof something === 'function';
}



// TODO@Alex -> refactor to use `brackets` from language configuration
export function getBracketFor(tokenType:string, tokenText:string, mode:Modes.IMode): Modes.Bracket {
	if (tokenText === '{' || tokenText === '(' || tokenText === '[') {
		return Modes.Bracket.Open;
	}
	if (tokenText === '}' || tokenText === ')' || tokenText === ']') {
		return Modes.Bracket.Close;
	}
	return Modes.Bracket.None;
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
