/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as modes from 'vs/editor/common/modes';
import {USUAL_WORD_SEPARATORS} from 'vs/editor/common/config/defaultConfig';

export class NullState implements modes.IState {

	private mode: modes.IMode;
	private stateData: modes.IState;

	constructor(mode: modes.IMode, stateData: modes.IState) {
		this.mode = mode;
		this.stateData = stateData;
	}

	public clone(): modes.IState {
		var stateDataClone:modes.IState = (this.stateData ? this.stateData.clone() : null);
		return new NullState(this.mode, stateDataClone);
	}

	public equals(other:modes.IState): boolean {
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

	public getMode(): modes.IMode {
		return this.mode;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type:'' };
	}

	public getStateData(): modes.IState {
		return this.stateData;
	}

	public setStateData(stateData:modes.IState):void {
		this.stateData = stateData;
	}
}

export class NullMode implements modes.IMode {

	/**
	 * Create a word definition regular expression based on default word separators.
	 * Optionally provide allowed separators that should be included in words.
	 *
	 * The default would look like this:
	 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	 */
	public static createWordRegExp(allowInWords:string = ''): RegExp {
		var usualSeparators = USUAL_WORD_SEPARATORS;
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

	public richEditSupport: modes.IRichEditSupport;

	constructor() {
		this.richEditSupport = {
			wordDefinition: NullMode.DEFAULT_WORD_REGEXP
		};
	}

	public getId():string {
		return NullMode.ID;
	}

	public toSimplifiedMode(): modes.IMode {
		return this;
	}
}

export function nullTokenize(mode: modes.IMode, buffer:string, state: modes.IState, deltaOffset:number = 0, stopAtOffset?:number): modes.ILineTokens {
	var tokens:modes.IToken[] = [
		{
			startIndex: deltaOffset,
			type: ''
		}
	];

	var modeTransitions:modes.IModeTransition[] = [
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
