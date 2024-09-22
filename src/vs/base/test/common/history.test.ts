/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { HistoryNavigator, HistoryNavigator2 } from '../../common/history.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('History Navigator', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('create reduces the input to limit', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 2);

		assert.deepStrictEqual(['3', '4'], toArray(testObject));
	});

	test('create sets the position after last', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 100);

		assert.strictEqual(testObject.current(), null);
		assert.strictEqual(testObject.isNowhere(), true);
		assert.strictEqual(testObject.isFirst(), false);
		assert.strictEqual(testObject.isLast(), false);
		assert.strictEqual(testObject.next(), null);
		assert.strictEqual(testObject.previous(), '4');
		assert.strictEqual(testObject.isNowhere(), false);
		assert.strictEqual(testObject.isFirst(), false);
		assert.strictEqual(testObject.isLast(), true);
	});

	test('last returns last element', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 100);

		assert.strictEqual(testObject.first(), '1');
		assert.strictEqual(testObject.last(), '4');
		assert.strictEqual(testObject.isFirst(), false);
		assert.strictEqual(testObject.isLast(), true);
	});

	test('first returns first element', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		assert.strictEqual('2', testObject.first());
		assert.strictEqual(testObject.isFirst(), true);
		assert.strictEqual(testObject.isLast(), false);
	});

	test('next returns next element', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();

		assert.strictEqual(testObject.next(), '3');
		assert.strictEqual(testObject.next(), '4');
		assert.strictEqual(testObject.next(), null);
	});

	test('previous returns previous element', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		assert.strictEqual(testObject.previous(), '4');
		assert.strictEqual(testObject.previous(), '3');
		assert.strictEqual(testObject.previous(), '2');
		assert.strictEqual(testObject.previous(), null);
	});

	test('next on last element returns null and remains on last', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();
		testObject.last();

		assert.strictEqual(testObject.isLast(), true);
		assert.strictEqual(testObject.current(), '4');
		assert.strictEqual(testObject.next(), null);
		assert.strictEqual(testObject.isLast(), false); // Stepping past the last element, is no longer "last"
	});

	test('previous on first element returns null and remains on first', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();

		assert.strictEqual(testObject.isFirst(), true);
		assert.strictEqual(testObject.current(), '2');
		assert.strictEqual(testObject.previous(), null);
		assert.strictEqual(testObject.isFirst(), true);
	});

	test('add reduces the input to limit', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 2);

		testObject.add('5');

		assert.deepStrictEqual(toArray(testObject), ['4', '5']);
	});

	test('adding existing element changes the position', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 5);

		testObject.add('2');

		assert.deepStrictEqual(toArray(testObject), ['1', '3', '4', '2']);
	});

	test('add resets the navigator to last', () => {
		const testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();
		testObject.add('5');

		assert.strictEqual(testObject.previous(), '5');
		assert.strictEqual(testObject.isLast(), true);
		assert.strictEqual(testObject.next(), null);
		assert.strictEqual(testObject.isLast(), false);
	});

	test('adding an existing item changes the order', () => {
		const testObject = new HistoryNavigator(['1', '2', '3']);

		testObject.add('1');

		assert.deepStrictEqual(['2', '3', '1'], toArray(testObject));
	});

	test('previous returns null if the current position is the first one', () => {
		const testObject = new HistoryNavigator(['1', '2', '3']);

		testObject.first();

		assert.deepStrictEqual(testObject.previous(), null);
		assert.strictEqual(testObject.isFirst(), true);
	});

	test('previous returns object if the current position is not the first one', () => {
		const testObject = new HistoryNavigator(['1', '2', '3']);

		testObject.first();
		testObject.next();

		assert.deepStrictEqual(testObject.previous(), '1');
	});

	test('next returns null if the current position is the last one', () => {
		const testObject = new HistoryNavigator(['1', '2', '3']);

		testObject.last();

		assert.strictEqual(testObject.isLast(), true);
		assert.deepStrictEqual(testObject.next(), null);
		assert.strictEqual(testObject.isLast(), false);
	});

	test('next returns object if the current position is not the last one', () => {
		const testObject = new HistoryNavigator(['1', '2', '3']);

		testObject.last();
		testObject.previous();

		assert.deepStrictEqual(testObject.next(), '3');
	});

	test('clear', () => {
		const testObject = new HistoryNavigator(['a', 'b', 'c']);
		assert.strictEqual(testObject.previous(), 'c');
		testObject.clear();
		assert.strictEqual(testObject.current(), null);
		assert.strictEqual(testObject.isNowhere(), true);
	});

	function toArray(historyNavigator: HistoryNavigator<string>): Array<string | null> {
		const result: Array<string | null> = [];
		historyNavigator.first();
		if (historyNavigator.current()) {
			do {
				result.push(historyNavigator.current()!);
			} while (historyNavigator.next());
		}
		return result;
	}
});

suite('History Navigator 2', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('constructor', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4']);

		assert.strictEqual(testObject.current(), '4');
		assert.strictEqual(testObject.isAtEnd(), true);
	});

	test('constructor - initial history is not empty', () => {
		assert.throws(() => new HistoryNavigator2([]));
	});

	test('constructor - capacity limit', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4'], 3);

		assert.strictEqual(testObject.current(), '4');
		assert.strictEqual(testObject.isAtEnd(), true);
		assert.strictEqual(testObject.has('1'), false);
	});

	test('constructor - duplicate values', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4', '3', '2', '1']);

		assert.strictEqual(testObject.current(), '1');
		assert.strictEqual(testObject.isAtEnd(), true);
	});

	test('navigation', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4']);

		assert.strictEqual(testObject.current(), '4');
		assert.strictEqual(testObject.isAtEnd(), true);

		assert.strictEqual(testObject.next(), '4');
		assert.strictEqual(testObject.previous(), '3');
		assert.strictEqual(testObject.previous(), '2');
		assert.strictEqual(testObject.previous(), '1');
		assert.strictEqual(testObject.previous(), '1');

		assert.strictEqual(testObject.current(), '1');
		assert.strictEqual(testObject.next(), '2');
		assert.strictEqual(testObject.resetCursor(), '4');
	});

	test('add', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4']);
		testObject.add('5');

		assert.strictEqual(testObject.current(), '5');
		assert.strictEqual(testObject.isAtEnd(), true);
	});

	test('add - existing value', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4']);
		testObject.add('2');

		assert.strictEqual(testObject.current(), '2');
		assert.strictEqual(testObject.isAtEnd(), true);

		assert.strictEqual(testObject.previous(), '4');
		assert.strictEqual(testObject.previous(), '3');
		assert.strictEqual(testObject.previous(), '1');
	});

	test('replaceLast', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4']);
		testObject.replaceLast('5');

		assert.strictEqual(testObject.current(), '5');
		assert.strictEqual(testObject.isAtEnd(), true);
		assert.strictEqual(testObject.has('4'), false);

		assert.strictEqual(testObject.previous(), '3');
		assert.strictEqual(testObject.previous(), '2');
		assert.strictEqual(testObject.previous(), '1');
	});

	test('replaceLast - existing value', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4']);
		testObject.replaceLast('2');

		assert.strictEqual(testObject.current(), '2');
		assert.strictEqual(testObject.isAtEnd(), true);
		assert.strictEqual(testObject.has('4'), false);

		assert.strictEqual(testObject.previous(), '3');
		assert.strictEqual(testObject.previous(), '1');
	});

	test('prepend', () => {
		const testObject = new HistoryNavigator2(['1', '2', '3', '4']);
		assert.strictEqual(testObject.current(), '4');
		assert.ok(testObject.isAtEnd());
		assert.deepStrictEqual(Array.from(testObject), ['1', '2', '3', '4']);

		testObject.prepend('0');
		assert.strictEqual(testObject.current(), '4');
		assert.ok(testObject.isAtEnd());
		assert.deepStrictEqual(Array.from(testObject), ['0', '1', '2', '3', '4']);

		testObject.prepend('2');
		assert.strictEqual(testObject.current(), '4');
		assert.ok(testObject.isAtEnd());
		assert.deepStrictEqual(Array.from(testObject), ['0', '1', '2', '3', '4']);
	});

});
