/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Model} from 'vs/editor/common/model/model';
import {AbstractState, ITokenizationResult} from 'vs/editor/common/modes/abstractState';
import * as modes from 'vs/editor/common/modes';
import {TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {LineStream} from 'vs/editor/common/modes/lineStream';

// --------- utils

var LINE1 = '1';
var LINE2 = '2';
var LINE3 = '3';
var LINE4 = '4';
var LINE5 = '5';


suite('Editor Model - Model Modes 1', () => {

	const LANGUAGE_ID = 'modelModeTest1';

	let calledState = {
		calledFor: <string[]>[]
	};
	let thisModel: Model;

	class ModelState1 extends AbstractState {
		public makeClone():ModelState1 {
			return this;
		}
		public equals(other: modes.IState): boolean {
			return this === other;
		}
		public tokenize(stream:LineStream): ITokenizationResult {
			calledState.calledFor.push(stream.next());
			stream.advanceToEOS();
			return { type: '' };
		}
	}

	function checkAndClear(calledState: { calledFor: string[] }, arr:string[]) {
		assert.deepEqual(calledState.calledFor, arr);
		calledState.calledFor = [];
	}

	modes.TokenizationRegistry.register(LANGUAGE_ID, new TokenizationSupport(null, LANGUAGE_ID, {
		getInitialState: () => new ModelState1(LANGUAGE_ID)
	}, false));

	setup(() => {
		calledState.calledFor = [];
		var text =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;
		thisModel = Model.createFromString(text, undefined, LANGUAGE_ID);
	});

	teardown(() => {
		thisModel.dispose();
	});
	test('model calls syntax highlighter 1', () => {
		thisModel.getLineTokens(1);
		checkAndClear(calledState, ['1']);
	});

	test('model calls syntax highlighter 2', () => {
		thisModel.getLineTokens(2);
		checkAndClear(calledState, ['1', '2']);

		thisModel.getLineTokens(2);
		checkAndClear(calledState, []);
	});

	test('model caches states', () => {
		thisModel.getLineTokens(1);
		checkAndClear(calledState, ['1']);

		thisModel.getLineTokens(2);
		checkAndClear(calledState, ['2']);

		thisModel.getLineTokens(3);
		checkAndClear(calledState, ['3']);

		thisModel.getLineTokens(4);
		checkAndClear(calledState, ['4']);

		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['5']);

		thisModel.getLineTokens(5);
		checkAndClear(calledState, []);
	});

	test('model invalidates states for one line insert', () => {
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '-')]);
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['-']);

		thisModel.getLineTokens(5);
		checkAndClear(calledState, []);
	});

	test('model invalidates states for many lines insert', () => {
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '0\n-\n+')]);
		assert.equal(thisModel.getLineCount(), 7);
		thisModel.getLineTokens(7);
		checkAndClear(calledState, ['0', '-', '+']);

		thisModel.getLineTokens(7);
		checkAndClear(calledState, []);
	});

	test('model invalidates states for one new line', () => {
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '\n')]);
		thisModel.applyEdits([EditOperation.insert(new Position(2, 1), 'a')]);
		thisModel.getLineTokens(6);
		checkAndClear(calledState, ['1', 'a']);
	});

	test('model invalidates states for one line delete', () => {
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '-')]);
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['1']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['-']);

		thisModel.getLineTokens(5);
		checkAndClear(calledState, []);
	});

	test('model invalidates states for many lines delete', () => {
		thisModel.getLineTokens(5);
		checkAndClear(calledState, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 1))]);
		thisModel.getLineTokens(3);
		checkAndClear(calledState, ['3']);

		thisModel.getLineTokens(3);
		checkAndClear(calledState, []);
	});
});



suite('Editor Model - Model Modes 2', () => {

	const LANGUAGE_ID = 'modelModeTest2';

	class ModelState2 extends AbstractState {

		private prevLineContent:string;

		constructor(modeId:string, prevLineContent:string) {
			super(modeId);
			this.prevLineContent = prevLineContent;
		}

		public makeClone():ModelState2 {
			return new ModelState2(this.getModeId(), this.prevLineContent);
		}

		public equals(other: modes.IState):boolean {
			return (other instanceof ModelState2) && (this.prevLineContent === (<ModelState2>other).prevLineContent);
		}

		public tokenize(stream:LineStream):ITokenizationResult {
			var line= '';
			while (!stream.eos()) {
				line+= stream.next();
			}
			this.prevLineContent= line;
			return { type: '' };
		}
	}
	modes.TokenizationRegistry.register(LANGUAGE_ID, new TokenizationSupport(null, LANGUAGE_ID, {
		getInitialState: () => new ModelState2(LANGUAGE_ID, '')
	}, false));

	function invalidEqual(model, indexArray) {
		var i, len, asHash = {};
		for (i = 0, len = indexArray.length; i < len; i++) {
			asHash[indexArray[i]] = true;
		}
		for (i = 0, len = model.getLineCount(); i < len; i++) {
			assert.equal(model._lines[i].isInvalid, asHash.hasOwnProperty(i));
		}
	}

	function stateEqual(state, content) {
		assert.equal(state.prevLineContent, content);
	}

	function statesEqual(model:Model, states:string[]) {
		var i, len = states.length - 1;
		for (i = 0; i < len; i++) {
			stateEqual(model._lines[i].getState(), states[i]);
		}
		stateEqual((<any>model)._lastState, states[len]);
	}

	var thisModel: Model;

	setup(() => {
		var text =
			'Line1' + '\r\n' +
			'Line2' + '\n' +
			'Line3' + '\n' +
			'Line4' + '\r\n' +
			'Line5';
		thisModel = Model.createFromString(text, undefined, LANGUAGE_ID);
	});

	teardown(() => {
		thisModel.dispose();
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

	const LANGUAGE_ID = 'modelModeTestTokenIterator';

	class NState extends AbstractState {

		private n:number;
		private allResults:ITokenizationResult[];

		constructor(modeId:string, n:number) {
			super(modeId);
			this.n = n;
			this.allResults = null;
		}

		public makeClone():NState {
			return this;
		}

		public equals(other: modes.IState):boolean {
			return true;
		}

		public tokenize(stream:LineStream):ITokenizationResult {
			var ndash = this.n, value = '';
			while(!stream.eos() && ndash > 0) {
				value += stream.next();
				ndash--;
			}
			return { type: 'n-' + (this.n - ndash) + '-' + value };
		}
	}
	modes.TokenizationRegistry.register(LANGUAGE_ID, new TokenizationSupport(null, LANGUAGE_ID, {
		getInitialState: () => new NState(LANGUAGE_ID, 3)
	}, false));

	var thisModel: Model;

	setup(() => {
		var text =
			'foobarfoobar' + '\r\n' +
			'foobarfoobar' + '\r\n' +
			'foobarfoobar' + '\r\n';
		thisModel = Model.createFromString(text, undefined, LANGUAGE_ID);
	});

	teardown(() => {
		thisModel.dispose();
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
			while(iter.hasNext()) {
				calls++;
				if(a.length === 0) {
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
			while(iter.hasNext()) {
				iter.next();
				n++;
			}
		});
		assert.equal(n, 12);
	});

	test('all tokens from beginning with prev', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			while(iter.hasPrev()) {
				iter.prev();
				n++;
			}
		});
		assert.equal(n, 1);
	});

	test('all tokens from end with prev', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while(iter.hasPrev()) {
				iter.prev();
				n++;
			}
		});
		assert.equal(n, 12);
	});

	test('all tokens from end with next', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while(iter.hasNext()) {
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
			while(iter.hasNext()) {
				var next = iter.next();
				up.push(next);
				n++;
			}
			while(iter.hasPrev()) {
				var prev = iter.prev();
				down.push(prev);
				n++;
			}
		});
		assert.equal(n, 24);
		assert.equal(up.length, 12);
		assert.equal(down.length, 12);
		while(up.length) {
			assert.deepEqual(up.pop(), down.shift());
		}
	});

	test('iterator allows prev/next', () => {
		var n = 0;
		var up = [], down = [];
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while(iter.hasPrev()) {
				var prev = iter.prev();
				down.push(prev);
				n++;
			}
			while(iter.hasNext()) {
				var next = iter.next();
				up.push(next);
				n++;
			}
		});
		assert.equal(n, 24);
		assert.equal(up.length, 12);
		assert.equal(down.length, 12);
		while(up.length) {
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
		} catch(e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.next();
			assert.ok(false);
		} catch(e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.hasPrev();
			assert.ok(false);
		} catch(e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.prev();
			assert.ok(false);
		} catch(e) {
			assert.ok(true);
		}
	});
});


