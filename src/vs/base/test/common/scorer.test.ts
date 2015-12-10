/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import scorer = require('vs/base/common/scorer');

suite('Scorer', () => {

	test("score", function() {
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
		let sortedScores = scores.sort();
		assert.deepEqual(scores.reverse(), sortedScores);
	});
});