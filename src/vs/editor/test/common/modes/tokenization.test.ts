/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as modes from 'vs/editor/common/modes';
import {AbstractState, ITokenizationResult} from 'vs/editor/common/modes/abstractState';
import {handleEvent} from 'vs/editor/common/modes/supports';
import {IModeLocator, ILeavingNestedModeData, TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {createMockLineContext} from 'vs/editor/test/common/modesTestUtils';
import {MockMode} from 'vs/editor/test/common/mocks/mockMode';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {Token} from 'vs/editor/common/core/token';
import {LineStream} from 'vs/editor/common/modes/lineStream';

export interface IModeSwitchingDescriptor {
	[character:string]:{
		endCharacter: string;
		mode: modes.IMode;
	};
}

export class StateMemorizingLastWord extends AbstractState {

	public lastWord:string;
	private descriptor:IModeSwitchingDescriptor;

	constructor(modeId:string, descriptor:IModeSwitchingDescriptor, lastWord:string) {
		super(modeId);
		this.lastWord = lastWord;
		this.descriptor = descriptor;
	}

	public makeClone() : AbstractState {
		return new StateMemorizingLastWord(this.getModeId(), this.descriptor, this.lastWord);
	}

	public tokenize(stream:LineStream):ITokenizationResult {
		let contents = stream.advanceToEOS();
		stream.goBack(contents.length);

		let m = contents.match(/^([\t \u00a0]+)/);
		if (m) {
			stream.advance(m[0].length);
			return { type: '' };
		}

		m = contents.match(/^([\[\]\{\}\(\)])/);
		let word: string;
		if (m) {
			stream.advance(m[0].length);
			word = m[1];

		} else {
			m = contents.match(/([a-zA-Z]+)/);
			stream.advance(m[0].length);
			word = m[1];
		}

		return {
			type: this.getModeId() + '.' + word,
			nextState: new StateMemorizingLastWord(this.getModeId(), this.descriptor, word)
		};
	}
}

export class SwitchingMode extends MockMode {

	private _switchingModeDescriptor:IModeSwitchingDescriptor;

	constructor(id:string, descriptor:IModeSwitchingDescriptor) {
		super(id);
		this._switchingModeDescriptor = descriptor;
		modes.TokenizationRegistry.register(this.getId(), new TokenizationSupport(null, this.getId(), this, true));
	}

	public getInitialState():AbstractState {
		return new StateMemorizingLastWord(this.getId(), this._switchingModeDescriptor, null);
	}

	public enterNestedMode(state:modes.IState):boolean {
		var s = <StateMemorizingLastWord>state;
		if (this._switchingModeDescriptor.hasOwnProperty(s.lastWord)) {
			return true;
		}
	}

	public getNestedMode(state:modes.IState, locator:IModeLocator): modes.IMode {
		var s = <StateMemorizingLastWord>state;
		return this._switchingModeDescriptor[s.lastWord].mode;
	}

	public getLeavingNestedModeData(line:string, state:modes.IState): ILeavingNestedModeData {
		var s = <StateMemorizingLastWord>state;
		var endChar = this._switchingModeDescriptor[s.lastWord].endCharacter;
		var endCharPosition = line.indexOf(endChar);
		if (endCharPosition >= 0) {
			return {
				nestedModeBuffer: line.substring(0, endCharPosition),
				bufferAfterNestedMode: line.substring(endCharPosition),
				stateAfterNestedMode: new StateMemorizingLastWord(this.getId(), this._switchingModeDescriptor, null)
			};
		}
		return null;
	}
}

interface ITestToken {
	startIndex:number;
	type:string;
}
function assertTokens(actual:Token[], expected:ITestToken[], message?:string) {
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
function assertModeTransitions(actual:ModeTransition[], expected:ITestModeTransition[], message?:string) {
	var massagedActual:ITestModeTransition[] = [];
	for (var i = 0; i < actual.length; i++) {
		massagedActual.push({
			startIndex: actual[i].startIndex,
			id: actual[i].modeId
		});
	}
	assert.deepEqual(massagedActual, expected, message);
};

let switchingMode = (function() {
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
})();

function switchingModeTokenize(line:string, state:modes.IState = null) {
	let tokenizationSupport = modes.TokenizationRegistry.get(switchingMode.getId());
	if (state) {
		return tokenizationSupport.tokenize(line, state);
	} else {
		return tokenizationSupport.tokenize(line, tokenizationSupport.getInitialState());
	}
}

suite('Editor Modes - Tokenization', () => {

	test('Syntax engine merges sequential untyped tokens', () => {
		class State extends AbstractState {

			constructor(modeId:string) {
				super(modeId);
			}

			public makeClone() : AbstractState {
				return new State(this.getModeId());
			}

			public tokenize(stream:LineStream):ITokenizationResult {
				let chr = stream.peek();
				stream.advance(1);
				return { type: chr === '.' ? '' : 'text' };
			}
		}

		let tokenizationSupport = new TokenizationSupport(null, 'test', {
			getInitialState: () => new State('test')
		}, false);

		var lineTokens = tokenizationSupport.tokenize('.abc..def...gh', tokenizationSupport.getInitialState());
		assertTokens(lineTokens.tokens, [
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
		assert.equal((<StateMemorizingLastWord>lineTokens.endState).getModeId(), 'B');
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'A' }
		]);
	});

	test('One embedded over multiple lines 1', () => {
		var lineTokens = switchingModeTokenize('abc (def');
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

		lineTokens = switchingModeTokenize('ghi jkl', lineTokens.endState);
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'B.ghi' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'B.jkl' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'B' }
		]);

		lineTokens = switchingModeTokenize('mno)pqr', lineTokens.endState);
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
		var lineTokens = switchingModeTokenize('abc (def');
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

		handleEvent(createMockLineContext('abc (def', lineTokens), 0, (modeId:string, context:modes.ILineContext, offset:number) => {
			assert.deepEqual(modeId, 'A');
			assert.equal(context.getTokenCount(), 3);
			assert.equal(context.getTokenStartOffset(0), 0);
			assert.equal(context.getTokenType(0), 'A.abc');
			assert.equal(context.getTokenStartOffset(1), 3);
			assert.equal(context.getTokenType(1), '');
			assert.equal(context.getTokenStartOffset(2), 4);
			assert.equal(context.getTokenType(2), 'A.(');
			assert.deepEqual(offset, 0);
			assert.equal(context.getLineContent(), 'abc (');
		});

		handleEvent(createMockLineContext('abc (def', lineTokens), 6, (modeId:string, context:modes.ILineContext, offset:number) => {
			assert.deepEqual(modeId, 'B');
			assert.equal(context.getTokenCount(), 1);
			assert.equal(context.getTokenStartOffset(0), 0);
			assert.equal(context.getTokenType(0), 'B.def');
			assert.deepEqual(offset, 1);
			assert.equal(context.getLineContent(), 'def');
		});

		lineTokens = switchingModeTokenize('ghi jkl', lineTokens.endState);
		assertTokens(lineTokens.tokens, [
			{ startIndex:0, type: 'B.ghi' },
			{ startIndex:3, type: '' },
			{ startIndex:4, type: 'B.jkl' }
		]);
		assertModeTransitions(lineTokens.modeTransitions, [
			{ startIndex: 0, id: 'B' }
		]);

		lineTokens = switchingModeTokenize(')pqr', lineTokens.endState);
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

