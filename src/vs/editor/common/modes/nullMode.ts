/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import EditorCommon = require('vs/editor/common/editorCommon');

export class NullState implements Modes.IState {

	private mode: Modes.IMode;
	private stateData: Modes.IState;

	constructor(mode: Modes.IMode, stateData: Modes.IState) {
		this.mode = mode;
		this.stateData = stateData;
	}

	public clone(): Modes.IState {
		var stateDataClone:Modes.IState = (this.stateData ? this.stateData.clone() : null);
		return new NullState(this.mode, stateDataClone);
	}

	public equals(other:Modes.IState): boolean {
		if (this.mode !== other.getMode()) {
			return false;
		}
		var otherStateData = other.getStateData();
		if (!this.stateData && !otherStateData) {
			return true;
		}
		if (this.stateData && otherStateData) {
			return this.stateData.equals(otherStateData);
		}
		return false;
	}

	public getMode(): Modes.IMode {
		return this.mode;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type:'' };
	}

	public getStateData(): Modes.IState {
		return this.stateData;
	}

	public setStateData(stateData:Modes.IState):void {
		this.stateData = stateData;
	}
}

export class NullMode implements Modes.IMode {

	/**
	 * Create a word definition regular expression based on default word separators.
	 * Optionally provide allowed separators that should be included in words.
	 *
	 * The default would look like this:
	 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	 */
	public static createWordRegExp(allowInWords:string = ''): RegExp {
		var usualSeparators = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';
		var source = '(-?\\d*\\.\\d\\w*)|([^';
		for (var i = 0; i < usualSeparators.length; i++) {
			if (allowInWords.indexOf(usualSeparators[i]) >= 0) {
				continue;
			}
			source += '\\' + usualSeparators[i];
		}
		source += '\\s]+)';
		return new RegExp(source, 'g');
	}

	// catches numbers (including floating numbers) in the first group, and alphanum in the second
	static DEFAULT_WORD_REGEXP = NullMode.createWordRegExp();

	public static ID = 'vs.editor.modes.nullMode';

	public tokenTypeClassificationSupport: Modes.ITokenTypeClassificationSupport;

	constructor() {
		this.tokenTypeClassificationSupport = this;
	}

	public getId():string {
		return NullMode.ID;
	}

	public getWordDefinition():RegExp {
		return NullMode.DEFAULT_WORD_REGEXP;
	}
}

export function nullTokenize(mode: Modes.IMode, buffer:string, state: Modes.IState, deltaOffset:number = 0, stopAtOffset?:number): Modes.ILineTokens {
	var tokens:Modes.IToken[] = [
		{
			startIndex: deltaOffset,
			type: '',
			bracket: Modes.Bracket.None
		}
	];

	var modeTransitions:Modes.IModeTransition[] = [
		{
			startIndex: deltaOffset,
			mode: mode
		}
	];

	return {
		tokens: tokens,
		actualStopOffset: deltaOffset + buffer.length,
		endState: state,
		modeTransitions: modeTransitions
	};
}
