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
		thisModel.getLineTokens(1);
		checkAndClear(['1']);
	});

	test('model calls syntax highlighter 2', () => {
		thisModel.getLineTokens(2);
		checkAndClear(['1', '2']);

		thisModel.getLineTokens(2);
		checkAndClear([]);
	});

	test('model caches states', () => {
		thisModel.getLineTokens(1);
		checkAndClear(['1']);

		thisModel.getLineTokens(2);
		checkAndClear(['2']);

		thisModel.getLineTokens(3);
		checkAndClear(['3']);

		thisModel.getLineTokens(4);
		checkAndClear(['4']);

		thisModel.getLineTokens(5);
		checkAndClear(['5']);

		thisModel.getLineTokens(5);
		checkAndClear([]);
	});

	test('model invalidates states for one line insert', () => {
		thisModel.getLineTokens(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '-')]);
		thisModel.getLineTokens(5);
		checkAndClear(['-']);

		thisModel.getLineTokens(5);
		checkAndClear([]);
	});

	test('model invalidates states for many lines insert', () => {
		thisModel.getLineTokens(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '0\n-\n+')]);
		assert.equal(thisModel.getLineCount(), 7);
		thisModel.getLineTokens(7);
		checkAndClear(['0', '-', '+']);

		thisModel.getLineTokens(7);
		checkAndClear([]);
	});

	test('model invalidates states for one new line', () => {
		thisModel.getLineTokens(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '\n')]);
		thisModel.applyEdits([EditOperation.insert(new Position(2, 1), 'a')]);
		thisModel.getLineTokens(6);
		checkAndClear(['1', 'a']);
	});

	test('model invalidates states for one line delete', () => {
		thisModel.getLineTokens(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '-')]);
		thisModel.getLineTokens(5);
		checkAndClear(['1']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		thisModel.getLineTokens(5);
		checkAndClear(['-']);

		thisModel.getLineTokens(5);
		checkAndClear([]);
	});

	test('model invalidates states for many lines delete', () => {
		thisModel.getLineTokens(5);
		checkAndClear(['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 1))]);
		thisModel.getLineTokens(3);
		checkAndClear(['3']);

		thisModel.getLineTokens(3);
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
			if (model._lines[i].isInvalid) {
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
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.insert(new Position(1, 6), '-')]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1-', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines two text insert', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([
			EditOperation.insert(new Position(1, 6), '-'),
			EditOperation.insert(new Position(3, 6), '-')
		]);

		invalidEqual(thisModel, [0, 2]);
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1-', 'Line2', 'Line3-', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one multi-line text insert, one small text insert', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.insert(new Position(1, 6), '\nNew line\nAnother new line')]);
		thisModel.applyEdits([EditOperation.insert(new Position(5, 6), '-')]);
		invalidEqual(thisModel, [0, 4]);
		thisModel.getLineTokens(7);
		statesEqual(thisModel, ['', 'Line1', 'New line', 'Another new line', 'Line2', 'Line3-', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one delete text', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 5))]);
		invalidEqual(thisModel, [0]);
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', '1', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one line delete text', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 1))]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.getLineTokens(4);
		statesEqual(thisModel, ['', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines multiple lines delete text', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 3))]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line3', 'Line4', 'Line5']);
		thisModel.getLineTokens(3);
		statesEqual(thisModel, ['', 'ne3', 'Line4', 'Line5']);
	});
});


suite('Editor Model - Token Iterator', () => {

	const tokenizationSupport: modes.ITokenizationSupport = {
		getInitialState: (): modes.IState => NULL_STATE,
		tokenize: undefined,
		tokenize2: (line: string, state: modes.IState): TokenizationResult2 => {
			if (line.length % 3 !== 0) {
				throw new Error('Unexpected line length in ' + line);
			}
			let tokensCount = line.length / 3;
			let tokens = new Uint32Array(tokensCount << 1);
			for (let i = 0; i < tokensCount; i++) {
				tokens[(i << 1)] = 3 * i;
				tokens[(i << 1) + 1] = (
					i << modes.MetadataConsts.FOREGROUND_OFFSET
				) >>> 0;
			}
			return new TokenizationResult2(tokens, state);
		}
	};

	let thisModel: Model = null;
	let languageRegistration: IDisposable = null;

	setup(() => {
		const TEXT =
			'foobarfoobar' + '\r\n' +
			'foobarfoobar' + '\r\n' +
			'foobarfoobar' + '\r\n';
		const LANGUAGE_ID = 'modelModeTestTokenIterator';
		languageRegistration = modes.TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
		thisModel = Model.createFromString(TEXT, undefined, new modes.LanguageIdentifier(LANGUAGE_ID, 0));
	});

	teardown(() => {
		thisModel.dispose();
		thisModel = null;
		languageRegistration.dispose();
		languageRegistration = null;
	});

	test('all tokens with ranges', () => {
		var calls = 0;
		var ranges = [
			[1, 4, 4, 7, 7, 10, 10, 13],
			[1, 4, 4, 7, 7, 10, 10, 13],
			[1, 4, 4, 7, 7, 10, 10, 13],
		];
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			var a = [], line = 0;
			while (iter.hasNext()) {
				calls++;
				if (a.length === 0) {
					a = ranges.shift();
					line += 1;
				}
				var next = iter.next();
				assert.equal(next.lineNumber, line);
				assert.equal(next.startColumn, a.shift());
				assert.equal(next.endColumn, a.shift());
			}
		});
		assert.equal(calls, 12, 'calls');
	});

	test('all tokens from beginning with next', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			while (iter.hasNext()) {
				iter.next();
				n++;
			}
		});
		assert.equal(n, 12);
	});

	test('all tokens from beginning with prev', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			while (iter.hasPrev()) {
				iter.prev();
				n++;
			}
		});
		assert.equal(n, 1);
	});

	test('all tokens from end with prev', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while (iter.hasPrev()) {
				iter.prev();
				n++;
			}
		});
		assert.equal(n, 12);
	});

	test('all tokens from end with next', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while (iter.hasNext()) {
				iter.next();
				n++;
			}
		});
		assert.equal(n, 1);
	});

	test('prev and next are assert.equal at start', () => {
		var calls = 0;
		thisModel.tokenIterator(new Position(1, 2), (iter) => {
			calls++;
			var next = iter.next();
			var prev = iter.prev();
			assert.deepEqual(next, prev);
		});
		assert.equal(calls, 1, 'calls');
	});

	test('position variance within token', () => {
		var calls = 0;

		thisModel.tokenIterator(new Position(1, 4), (iter) => {
			calls++;
			var next = iter.next();
			assert.equal(next.lineNumber, 1);
			assert.equal(next.startColumn, 4);
			assert.equal(next.endColumn, 7);
		});

		thisModel.tokenIterator(new Position(1, 5), (iter) => {
			calls++;
			var next = iter.next();
			assert.equal(next.lineNumber, 1);
			assert.equal(next.startColumn, 4);
			assert.equal(next.endColumn, 7);
		});

		thisModel.tokenIterator(new Position(1, 6), (iter) => {
			calls++;
			var next = iter.next();
			assert.equal(next.lineNumber, 1);
			assert.equal(next.startColumn, 4);
			assert.equal(next.endColumn, 7);
		});

		assert.equal(calls, 3, 'calls');
	});

	test('iterator allows next/prev', () => {
		var n = 0;
		var up = [], down = [];
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			while (iter.hasNext()) {
				var next = iter.next();
				up.push(next);
				n++;
			}
			while (iter.hasPrev()) {
				var prev = iter.prev();
				down.push(prev);
				n++;
			}
		});
		assert.equal(n, 24);
		assert.equal(up.length, 12);
		assert.equal(down.length, 12);
		while (up.length) {
			assert.deepEqual(up.pop(), down.shift());
		}
	});

	test('iterator allows prev/next', () => {
		var n = 0;
		var up = [], down = [];
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while (iter.hasPrev()) {
				var prev = iter.prev();
				down.push(prev);
				n++;
			}
			while (iter.hasNext()) {
				var next = iter.next();
				up.push(next);
				n++;
			}
		});
		assert.equal(n, 24);
		assert.equal(up.length, 12);
		assert.equal(down.length, 12);
		while (up.length) {
			assert.deepEqual(up.pop(), down.shift());
		}
	});


	test('iterator can not be used outside of callback', () => {
		var illegalIterReference;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			illegalIterReference = iter;
		});


		try {
			illegalIterReference.hasNext();
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.next();
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.hasPrev();
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.prev();
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}
	});
});
