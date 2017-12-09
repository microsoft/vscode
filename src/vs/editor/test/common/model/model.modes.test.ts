/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IDisposable } from 'vs/base/common/lifecycle';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Model } from 'vs/editor/common/model/model';
import * as modes from 'vs/editor/common/modes';
import { NULL_STATE } from 'vs/editor/common/modes/nullMode';
import { TokenizationResult2 } from 'vs/editor/common/core/token';

// --------- utils

suite('Editor Model - Model Modes 1', () => {

	let calledFor: string[] = [];

	function checkAndClear(arr: string[]) {
		assert.deepEqual(calledFor, arr);
		calledFor = [];
	}

	const tokenizationSupport: modes.ITokenizationSupport = {
		getInitialState: () => NULL_STATE,
		tokenize: undefined,
		tokenize2: (line: string, state: modes.IState): TokenizationResult2 => {
			calledFor.push(line.charAt(0));
			return new TokenizationResult2(null, state);
		}
	};

	let thisModel: Model = null;
	let languageRegistration: IDisposable = null;

	setup(() => {
		const TEXT =
			'1\r\n' +
			'2\n' +
			'3\n' +
			'4\r\n' +
			'5';
		const LANGUAGE_ID = 'modelModeTest1';
		calledFor = [];
		languageRegistration = modes.TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
		thisModel = Model.createFromString(TEXT, undefined, new modes.LanguageIdentifier(LANGUAGE_ID, 0));
	});

	teardown(() => {
		thisModel.dispose();
		thisModel = null;
		languageRegistration.dispose();
		languageRegistration = null;
		calledFor = [];
	});

	test('model calls syntax highlighter 1', () => {
		thisModel.forceTokenization(1);
		checkAndClear(['1']);
	});

	test('model calls syntax highlighter 2', () => {
		thisModel.forceTokenization(2);
		checkAndClear(['1', '2']);

		thisModel.forceTokenization(2);
		checkAndClear([]);
	});

	test('model caches states', () => {
		thisModel.forceTokenization(1);
		checkAndClear(['1']);

		thisModel.forceTokenization(2);
		checkAndClear(['2']);

		thisModel.forceTokenization(3);
		checkAndClear(['3']);

		thisModel.forceTokenization(4);
		checkAndClear(['4']);

		thisModel.forceTokenization(5);
		checkAndClear(['5']);

		thisModel.forceTokenization(5);
		checkAndClear([]);
	});

	test('model invalidates states for one line insert', () => {
		thisModel.forceTokenization(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '-')]);
		thisModel.forceTokenization(5);
		checkAndClear(['-']);

		thisModel.forceTokenization(5);
		checkAndClear([]);
	});

	test('model invalidates states for many lines insert', () => {
		thisModel.forceTokenization(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '0\n-\n+')]);
		assert.equal(thisModel.getLineCount(), 7);
		thisModel.forceTokenization(7);
		checkAndClear(['0', '-', '+']);

		thisModel.forceTokenization(7);
		checkAndClear([]);
	});

	test('model invalidates states for one new line', () => {
		thisModel.forceTokenization(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '\n')]);
		thisModel.applyEdits([EditOperation.insert(new Position(2, 1), 'a')]);
		thisModel.forceTokenization(6);
		checkAndClear(['1', 'a']);
	});

	test('model invalidates states for one line delete', () => {
		thisModel.forceTokenization(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '-')]);
		thisModel.forceTokenization(5);
		checkAndClear(['1']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		thisModel.forceTokenization(5);
		checkAndClear(['-']);

		thisModel.forceTokenization(5);
		checkAndClear([]);
	});

	test('model invalidates states for many lines delete', () => {
		thisModel.forceTokenization(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 1))]);
		thisModel.forceTokenization(3);
		checkAndClear(['3']);

		thisModel.forceTokenization(3);
		checkAndClear([]);
	});
});

suite('Editor Model - Model Modes 2', () => {

	class ModelState2 implements modes.IState {
		prevLineContent: string;

		constructor(prevLineContent: string) {
			this.prevLineContent = prevLineContent;
		}

		clone(): modes.IState {
			return new ModelState2(this.prevLineContent);
		}

		equals(other: modes.IState): boolean {
			return (other instanceof ModelState2) && other.prevLineContent === this.prevLineContent;
		}
	}

	const tokenizationSupport: modes.ITokenizationSupport = {
		getInitialState: () => new ModelState2(''),
		tokenize: undefined,
		tokenize2: (line: string, state: modes.IState): TokenizationResult2 => {
			(<ModelState2>state).prevLineContent = line;
			return new TokenizationResult2(null, state);
		}
	};

	function invalidEqual(model: Model, expected: number[]): void {
		let actual: number[] = [];
		for (let i = 0, len = model.getLineCount(); i < len; i++) {
			if (model._lines[i].isInvalid()) {
				actual.push(i);
			}
		}
		assert.deepEqual(actual, expected);
	}

	function stateEqual(state: modes.IState, content: string): void {
		assert.equal((<ModelState2>state).prevLineContent, content);
	}

	function statesEqual(model: Model, states: string[]): void {
		var i, len = states.length - 1;
		for (i = 0; i < len; i++) {
			stateEqual(model._lines[i].getState(), states[i]);
		}
		stateEqual((<any>model)._lastState, states[len]);
	}

	let thisModel: Model = null;
	let languageRegistration: IDisposable = null;

	setup(() => {
		const TEXT =
			'Line1' + '\r\n' +
			'Line2' + '\n' +
			'Line3' + '\n' +
			'Line4' + '\r\n' +
			'Line5';
		const LANGUAGE_ID = 'modelModeTest2';
		languageRegistration = modes.TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
		thisModel = Model.createFromString(TEXT, undefined, new modes.LanguageIdentifier(LANGUAGE_ID, 0));
	});

	teardown(() => {
		thisModel.dispose();
		thisModel = null;
		languageRegistration.dispose();
		languageRegistration = null;
	});

	test('getTokensForInvalidLines one text insert', () => {
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.insert(new Position(1, 6), '-')]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1-', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines two text insert', () => {
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([
			EditOperation.insert(new Position(1, 6), '-'),
			EditOperation.insert(new Position(3, 6), '-')
		]);

		invalidEqual(thisModel, [0, 2]);
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1-', 'Line2', 'Line3-', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one multi-line text insert, one small text insert', () => {
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.insert(new Position(1, 6), '\nNew line\nAnother new line')]);
		thisModel.applyEdits([EditOperation.insert(new Position(5, 6), '-')]);
		invalidEqual(thisModel, [0, 4]);
		thisModel.forceTokenization(7);
		statesEqual(thisModel, ['', 'Line1', 'New line', 'Another new line', 'Line2', 'Line3-', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one delete text', () => {
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 5))]);
		invalidEqual(thisModel, [0]);
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', '1', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one line delete text', () => {
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 1))]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.forceTokenization(4);
		statesEqual(thisModel, ['', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines multiple lines delete text', () => {
		thisModel.forceTokenization(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 3))]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line3', 'Line4', 'Line5']);
		thisModel.forceTokenization(3);
		statesEqual(thisModel, ['', 'ne3', 'Line4', 'Line5']);
	});
});
