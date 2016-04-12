/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import scorer = require('vs/base/common/scorer');

suite('Scorer', () => {

	test('score', function () {
		const target = 'HelLo-World';

		const scores = [];
		scores.push(scorer.score(target, 'HelLo-World')); // direct case match
		scores.push(scorer.score(target, 'hello-world')); // direct mix-case match
		scores.push(scorer.score(target, 'HW')); // direct case prefix (multiple)
		scores.push(scorer.score(target, 'H')); // direct case prefix
		scores.push(scorer.score(target, 'hw')); // direct mix-case prefix (multiple)
		scores.push(scorer.score(target, 'h')); // direct mix-case prefix
		scores.push(scorer.score(target, 'W')); // direct case word prefix
		scores.push(scorer.score(target, 'w')); // direct mix-case word prefix
		scores.push(scorer.score(target, 'Ld')); // in-string case match (multiple)
		scores.push(scorer.score(target, 'L')); // in-string case match
		scores.push(scorer.score(target, 'ld')); // in-string mix-case match
		scores.push(scorer.score(target, 'l')); // in-string mix-case match
		scores.push(scorer.score(target, '4')); // no match

		// Assert scoring order
		let sortedScores = scores.sort((a, b) => b - a);
		assert.deepEqual(scores, sortedScores);
	});

	test('cache', function () {
		const cache = Object.create(null);

		scorer.score('target', 'query', cache);
		scorer.score('target', 't', cache);

		assert.equal(Object.getOwnPropertyNames(cache).length, 2);
	});

	test('matches', function () {
		assert.ok(scorer.matches('hello world', 'h'));
		assert.ok(!scorer.matches('hello world', 'q'));
		assert.ok(scorer.matches('hello world', 'hw'));
		assert.ok(scorer.matches('hello world', 'horl'));
		assert.ok(scorer.matches('hello world', 'd'));
		assert.ok(!scorer.matches('hello world', 'wh'));
		assert.ok(!scorer.matches('d', 'dd'));
	});
});