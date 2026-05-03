/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { StreamingGrammar } from '../../common/streamingGrammar';

const enum State {
	Initial,
	State1,
	State2,
	State3,
}

describe('StreamingGrammar', () => {
	it('should initialize with the correct state', () => {
		const grammar = new StreamingGrammar(State.Initial, {
			[State.Initial]: { 'token1': State.State1 },
			[State.State1]: { 'token2': State.State2 },
		});
		expect(grammar.state).to.equal(State.Initial);
	});

	it('should transition states correctly', () => {
		const grammar = new StreamingGrammar(State.Initial, {
			[State.Initial]: { 'token1': State.State1 },
			[State.State1]: { 'token2': State.State2 },
		});

		grammar.append('token1');
		expect(grammar.state).to.equal(State.State1);
		expect(grammar.tokens).to.deep.equal([
			{ state: State.Initial, token: 'token1', transitionTo: State.State1 }
		]);

		grammar.append('token2');
		expect(grammar.state).to.equal(State.State2);
		expect(grammar.tokens).to.deep.equal([
			{ state: State.Initial, token: 'token1', transitionTo: State.State1 },
			{ state: State.State1, token: 'token2', transitionTo: State.State2 }
		]);
	});

	it('should accumulate text correctly', () => {
		const grammar = new StreamingGrammar(State.Initial, {
			[State.Initial]: { 'token1': State.State1 },
			[State.State1]: { 'token2': State.State2 },
		});

		grammar.append('some text');
		grammar.append(' to');
		grammar.append('ken1');
		expect(grammar.state).to.equal(State.State1);
		expect(grammar.tokens).to.deep.equal([
			{ state: State.Initial, token: 'som' },
			{ state: State.Initial, token: 'e t' },
			{ state: State.Initial, token: 'ext ' },
			{ state: State.Initial, token: 'token1', transitionTo: State.State1 }
		]);
	});

	it('should handle multiple transitions', () => {
		const grammar = new StreamingGrammar(State.Initial, {
			[State.Initial]: { 'token1': State.State1 },
			[State.State1]: { 'token2': State.State2 },
			[State.State2]: { 'token3': State.State3 },
		});

		grammar.append('token1token2token3');
		expect(grammar.state).to.equal(State.State3);
		expect(grammar.tokens).to.deep.equal([
			{ state: State.Initial, token: 'token1', transitionTo: State.State1 },
			{ state: State.State1, token: 'token2', transitionTo: State.State2 },
			{ state: State.State2, token: 'token3', transitionTo: State.State3 }
		]);
	});

	it('should flush remaining text', () => {
		const grammar = new StreamingGrammar(State.Initial, {
			[State.Initial]: { 'token1': State.State1 },
			[State.State1]: { 'token2': State.State2 },
		});

		grammar.append('some text');
		grammar.flush();
		expect(grammar.tokens).to.deep.equal([
			{ state: State.Initial, token: 'som' },
			{ state: State.Initial, token: 'e text' },
		]);
	});

	it('should accumulate tokens correctly', () => {
		const grammar = new StreamingGrammar(State.Initial, {
			[State.Initial]: { 'token1': State.State1 },
			[State.State1]: { 'token2': State.State2 },
		});

		grammar.append('atoken1btoken2c');
		expect(grammar.accumulate(0, 2)).to.equal('atoken1');
		expect(grammar.accumulate(0, 2, State.Initial)).to.equal('a');
	});
});
