/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Observer, ReplaySubject, Subject } from '../subject';

suite('Subject', function () {
	let subject: Subject<number>;
	let observer: Observer<number>;
	let nextCount: number;
	let lastValue: number | undefined;
	let errorCount: number;
	let lastError: unknown;
	let completeCount: number;

	setup(function () {
		subject = new Subject<number>();
		nextCount = 0;
		errorCount = 0;
		completeCount = 0;
		lastValue = undefined;
		lastError = undefined;
		observer = {
			next: (value: number) => {
				nextCount++;
				lastValue = value;
			},
			error: (err: unknown) => {
				errorCount++;
				lastError = err;
			},
			complete: () => {
				completeCount++;
			},
		};
	});

	test('should notify subscribed observers on next', function () {
		subject.subscribe(observer);
		subject.next(1);
		assert.strictEqual(nextCount, 1);
		assert.strictEqual(lastValue, 1);
	});

	test('should notify subscribed observers on error', function () {
		const error = new Error('test error');
		subject.subscribe(observer);
		subject.error(error);
		assert.strictEqual(errorCount, 1);
		assert.strictEqual(lastError, error);
	});

	test('should notify subscribed observers on complete', function () {
		subject.subscribe(observer);
		subject.complete();
		assert.strictEqual(completeCount, 1);
	});

	test('should not notify unsubscribed observers', function () {
		const unsubscribe = subject.subscribe(observer);
		unsubscribe();
		subject.next(1);
		subject.error(new Error());
		subject.complete();

		assert.strictEqual(nextCount, 0);
		assert.strictEqual(errorCount, 0);
		assert.strictEqual(completeCount, 0);
	});

	test('should notify multiple observers', function () {
		let nextCount2 = 0;
		let lastValue2: number | undefined;
		const observer2 = {
			next: (value: number) => {
				nextCount2++;
				lastValue2 = value;
			},
			error: () => { },
			complete: () => { },
		};

		subject.subscribe(observer);
		subject.subscribe(observer2);
		subject.next(1);

		assert.strictEqual(nextCount, 1);
		assert.strictEqual(lastValue, 1);
		assert.strictEqual(nextCount2, 1);
		assert.strictEqual(lastValue2, 1);
	});

	suite('ReplaySubject', function () {
		setup(function () {
			subject = new ReplaySubject<number>();
		});

		test('should notify late subscribed observers', function () {
			subject.next(1);
			subject.subscribe(observer);
			assert.strictEqual(nextCount, 1);
			assert.strictEqual(lastValue, 1);
		});
	});
});
