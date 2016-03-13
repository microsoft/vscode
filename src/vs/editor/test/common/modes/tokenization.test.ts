/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {IDisposable, empty as EmptyDisposable} from 'vs/base/common/lifecycle';
import {IModeSupportChangedEvent} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {handleEvent} from 'vs/editor/common/modes/supports';
import {IEnteringNestedModeData, ILeavingNestedModeData, TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {createMockLineContext} from 'vs/editor/test/common/modesTestUtils';
import {MockMode} from 'vs/editor/test/common/mocks/mockMode';

export class State extends AbstractState {

	constructor(mode:modes.IMode) {
		super(mode);
	}

	public makeClone() : AbstractState {
		return new State(this.getMode());
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		return { type: stream.next() === '.' ? '' : 'text' };
	}
}

export class Mode extends MockMode {

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor() {
		super();
		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new State(this)
		}, false, false);
	}
}




function checkTokens(actual, expected) {
	assert.equal(actual.length, expected.length);
	for (var i = 0; i < expected.length; i++) {
		for (var key in expected[i]) {
			assert.deepEqual(actual[i][key], expected[i][key]);
		}
	}
}



export interface IModeSwitchingDescriptor {
	[character:string]:{
		endCharacter: string;
		mode: modes.IMode;
	};
}

export class StateMemorizingLastWord extends AbstractState {

	public lastWord:string;
	private descriptor:IModeSwitchingDescriptor;

	constructor(mode:modes.IMode, descriptor:IModeSwitchingDescriptor, lastWord:string) {
		super(mode);
		this.lastWord = lastWord;
		this.descriptor = descriptor;
	}

	public makeClone() : AbstractState {
		return new StateMemorizingLastWord(this.getMode(), this.descriptor, this.lastWord);
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		stream.setTokenRules('[]{}()==--', '\t \u00a0');
		if (stream.skipWhitespace() !== '') {
			return {
				type: ''
			};
		}
		var word = stream.nextToken();
		return {
			type: this.getMode().getId() + '.' + word,
			nextState: new StateMemorizingLastWord(this.getMode(), this.descriptor, word)
		};
	}
}

export class SwitchingMode extends MockMode {

	private _switchingModeDescriptor:IModeSwitchingDescriptor;

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor(id:string, descriptor:IModeSwitchingDescriptor) {
		super(id);
		this._switchingModeDescriptor = descriptor;
		this.tokenizationSupport = new TokenizationSupport(this, this, true, false);
	}

	public addSupportChangedListener(callback: (e: IModeSupportChangedEvent) => void): IDisposable {
		return EmptyDisposable;
	}

	/**
	 * Register a support by name. Only optional.
	 */
	public registerSupport<T>(support:string, callback:(mode:modes.IMode)=>T): IDisposable {
		return EmptyDisposable;
	}

	public getInitialState():modes.IState {
		return new StateMemorizingLastWord(this, this._switchingModeDescriptor, null);
	}

	public enterNestedMode(state:modes.IState):boolean {
		var s = <StateMemorizingLastWord>state;
		if (this._switchingModeDescriptor.hasOwnProperty(s.lastWord)) {
			return true;
		}
	}

	public getNestedMode(state:modes.IState): IEnteringNestedModeData {
		var s = <StateMemorizingLastWord>state;
		return {
			mode: this._switchingModeDescriptor[s.lastWord].mode,
			missingModePromise: null
		};
	}

	public getLeavingNestedModeData(line:string, state:modes.IState): ILeavingNestedModeData {
		var s = <StateMemorizingLastWord>state;
		var endChar = this._switchingModeDescriptor[s.lastWord].endCharacter;
		var endCharPosition = line.indexOf(endChar);
		if (endCharPosition >= 0) {
			return {
				nestedModeBuffer: line.substring(0, endCharPosition),
				bufferAfterNestedMode: line.substring(endCharPosition),
				stateAfterNestedMode: new StateMemorizingLastWord(this, this._switchingModeDescriptor, null)
			};
		}
		return null;
	}
}

interface ITestToken {
	startIndex:number;
	type:string;
}
function assertTokens(actual:modes.IToken[], expected:ITestToken[], message?:string) {
	assert.equal(actual.length, expected.length, 'Lengths mismatch');
	for (var i = 0; i < expected.length; i++) {
		assert.equal(actual[i].startIndex, expected[i].startIndex, 'startIndex mismatch');
		assert.equal(actual[i].type, expected[i].type, 'type mismatch');
	}
};

interface ITestModeTransition {
	startIndex:number;
	id:string;
}
function assertModeTransitions(actual:modes.IModeTransition[], expected:ITestModeTransition[], message?:string) {
	var massagedActual:ITestModeTransition[] = [];
	for (var i = 0; i < actual.length; i++) {
		massagedActual.push({
			startIndex: actual[i].startIndex,
			id: actual[i].mode.getId()
		});
	}
	assert.deepEqual(massagedActual, expected, message);
};

function createMode():SwitchingMode {
	var modeB = new SwitchingMode('B', {});
	var modeC = new SwitchingMode('C', {});
	var modeD = new SwitchingMode('D', {
		'(': {
			endCharacter: ')',
			mode: modeB
		}
	});
	var modeA = new SwitchingMode('A', {
		'(': {
			endCharacter: ')',
			mode: modeB
		},
		'[': {
			endCharacter: ']',
			mode: modeC
		},
		'{': {
			endCharacter: '}',
			mode: modeD
		}
	});
	return modeA;
}

function switchingModeTokenize(line:string, mode:modes.IMode = null, state:modes.IState = null) {
	if (state && mode) {
		return mode.tokenizationSupport.tokenize(line, state);
	} else {
		mode = createMode();
		return mode.tokenizationSupport.tokenize(line, mode.tokenizationSupport.getInitialState());
	}
}

suite('Editor Modes - Tokenization', () => {

	test('Syntax engine merges sequential untyped tokens', () => {
		var mode = new Mode();
		var lineTokens = mode.tokenizationSupport.tokenize('.abc..def...gh', mode.tokenizationSupport.getInitialState());
		checkTokens(lineTokens.tokens, [
			{ startIndex: 0, type: '' },
			{ startIndex: 1, type: 'text' },
			{ startIndex: 4, type: '' },
			{ startIndex: 6, type: 'text' },
			{ startIndex: 9, type: '' },
			{ startIndex: 12, type: 'text' }
		]);
	});

	test('Warmup', () => {
		var lineTokens = switchingModeTokenize('abc def ghi');
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'A.def' },
			{ startIndex:7, type: '' },
			{ startIndex:8, type: 'A.ghi' }
		]);
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).lastWord, 'ghi');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex:0, id: 'A' }
		]);
	});

	test('One embedded', () => {
		var lineTokens = switchingModeTokenize('abc (def) ghi');
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'A.(' },
			{ startIndex:5, type: 'B.def' },
			{ startIndex:8, type: 'A.)' },
			{ startIndex:9, type: '' },
			{ startIndex:10, type: 'A.ghi' }
		]);
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).lastWord, 'ghi');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' },
			{ startIndex: 5, id: 'B' },
			{ startIndex: 8, id: 'A' }
		]);
	});

	test('Empty one embedded', () => {
		var lineTokens = switchingModeTokenize('abc () ghi');
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'A.(' },
			{ startIndex:5, type: 'A.)' },
			{ startIndex:6, type: '' },
			{ startIndex:7, type: 'A.ghi' }
		]);
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).lastWord, 'ghi');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' }
		]);
	});

	test('Finish in embedded', () => {
		var lineTokens = switchingModeTokenize('abc (');
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'A.(' }
		]);
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).getMode().getId(), 'B');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' }
		]);
	});

	test('One embedded over multiple lines 1', () => {
		var mode = createMode();
		var lineTokens = switchingModeTokenize('abc (def', mode, mode.getInitialState());
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'A.(' },
			{ startIndex:5, type: 'B.def' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' },
			{ startIndex: 5, id: 'B' }
		]);

		lineTokens = switchingModeTokenize('ghi jkl', mode, lineTokens.endState);
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'B.ghi' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'B.jkl' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'B' }
		]);

		lineTokens = switchingModeTokenize('mno)pqr', mode, lineTokens.endState);
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'B.mno' },
			{ startIndex:3, type: 'A.)' },
			{ startIndex:4, type: 'A.pqr' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'B' },
			{ startIndex: 3, id: 'A' }
		]);
	});

	test('One embedded over multiple lines 2 with handleEvent', () => {
		var mode = createMode();
		var lineTokens = switchingModeTokenize('abc (def', mode, mode.getInitialState());
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'A.(' },
			{ startIndex:5, type: 'B.def' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' },
			{ startIndex: 5, id: 'B' }
		]);

		handleEvent(createMockLineContext('abc (def', lineTokens), 0, (mode:modes.IMode, context:modes.ILineContext, offset:number) => {
			assert.deepEqual(mode.getId(), 'A');
			assert.equal(context.getTokenCount(), 3);
			assert.equal(context.getTokenStartIndex(0), 0);
			assert.equal(context.getTokenType(0), 'A.abc');
			assert.equal(context.getTokenStartIndex(1), 3);
			assert.equal(context.getTokenType(1), '');
			assert.equal(context.getTokenStartIndex(2), 4);
			assert.equal(context.getTokenType(2), 'A.(');
			assert.deepEqual(offset, 0);
			assert.equal(context.getLineContent(), 'abc (');
		});

		handleEvent(createMockLineContext('abc (def', lineTokens), 6, (mode:modes.IMode, context:modes.ILineContext, offset:number) => {
			assert.deepEqual(mode.getId(), 'B');
			assert.equal(context.getTokenCount(), 1);
			assert.equal(context.getTokenStartIndex(0), 0);
			assert.equal(context.getTokenType(0), 'B.def');
			assert.deepEqual(offset, 1);
			assert.equal(context.getLineContent(), 'def');
		});

		lineTokens = switchingModeTokenize('ghi jkl', mode, lineTokens.endState);
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'B.ghi' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'B.jkl' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'B' }
		]);

		lineTokens = switchingModeTokenize(')pqr', mode, lineTokens.endState);
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.)' },
			{ startIndex:1, type: 'A.pqr' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' }
		]);
	});

	test('Two embedded in breadth', () => {
		var lineTokens = switchingModeTokenize('abc (def) [ghi] jkl');
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'A.(' },
			{ startIndex:5, type: 'B.def' },
			{ startIndex:8, type: 'A.)' },
			{ startIndex:9, type: '' },
			{ startIndex:10, type: 'A.[' },
			{ startIndex:11, type: 'C.ghi' },
			{ startIndex:14, type: 'A.]' },
			{ startIndex:15, type: '' },
			{ startIndex:16, type: 'A.jkl' }
		]);
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).lastWord, 'jkl');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' },
			{ startIndex: 5, id: 'B' },
			{ startIndex: 8, id: 'A' },
			{ startIndex: 11, id: 'C' },
			{ startIndex: 14, id: 'A' }
		]);
	});

	test('Two embedded in breadth tightly', () => {
		var lineTokens = switchingModeTokenize('abc(def)[ghi]jkl');
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: 'A.(' },
			{ startIndex:4, type: 'B.def' },
			{ startIndex:7, type: 'A.)' },
			{ startIndex:8, type: 'A.[' },
			{ startIndex:9, type: 'C.ghi' },
			{ startIndex:12, type: 'A.]' },
			{ startIndex:13, type: 'A.jkl' }
		]);
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).lastWord, 'jkl');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' },
			{ startIndex: 4, id: 'B' },
			{ startIndex: 7, id: 'A' },
			{ startIndex: 9, id: 'C' },
			{ startIndex: 12, id: 'A' }
		]);
	});

	test('Two embedded in depth tightly', () => {
		var lineTokens = switchingModeTokenize('abc{de(efg)hi}jkl');
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'A.abc' },
			{ startIndex:3, type: 'A.{' },
			{ startIndex:4, type: 'D.de' },
			{ startIndex:6, type: 'D.(' },
			{ startIndex:7, type: 'B.efg' },
			{ startIndex:10, type: 'D.)' },
			{ startIndex:11, type: 'D.hi' },
			{ startIndex:13, type: 'A.}' },
			{ startIndex:14, type: 'A.jkl' }
		]);
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).lastWord, 'jkl');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' },
			{ startIndex: 4, id: 'D' },
			{ startIndex: 7, id: 'B' },
			{ startIndex: 10, id: 'D' },
			{ startIndex: 13, id: 'A' }
		]);
	});
});

