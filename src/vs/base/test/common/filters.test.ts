/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IFilter, or, matchesPrefix, matchesStrictPrefix, matchesCamelCase, matchesSubString, matchesContiguousSubString } from 'vs/base/common/filters';

function filterOk(filter: IFilter, word: string, wordToMatchAgainst: string, highlights?: { start: number; end: number; }[]) {
	var r = filter(word, wordToMatchAgainst);
	assert(r);
	if (highlights) {
		assert.deepEqual(r, highlights);
	}
}

function filterNotOk(filter, word, suggestion) {
	assert(!filter(word, suggestion));
}

suite("Filters", () => {
	test("or", function () {
		var filter, counters;
		var newFilter = function (i, r) {
			return function () { counters[i]++; return r; };
		};

		counters = [0,0];
		filter = or(newFilter(0, false), newFilter(1, false));
		filterNotOk(filter, "anything", "anything");
		assert.deepEqual(counters, [1,1]);

		counters = [0,0];
		filter = or(newFilter(0, true), newFilter(1, false));
		filterOk(filter, "anything", "anything");
		assert.deepEqual(counters, [1,0]);

		counters = [0,0];
		filter = or(newFilter(0, true), newFilter(1, true));
		filterOk(filter, "anything", "anything");
		assert.deepEqual(counters, [1,0]);

		counters = [0,0];
		filter = or(newFilter(0, false), newFilter(1, true));
		filterOk(filter, "anything", "anything");
		assert.deepEqual(counters, [1,1]);
	});

	test("PrefixFilter - case sensitive", function () {
		filterNotOk(matchesStrictPrefix, "", "");
		filterOk(matchesStrictPrefix, "", "anything", []);
		filterOk(matchesStrictPrefix, "alpha", "alpha", [{ start: 0, end: 5 }]);
		filterOk(matchesStrictPrefix, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
		filterNotOk(matchesStrictPrefix, "alpha", "alp");
		filterOk(matchesStrictPrefix, "a", "alpha", [{ start: 0, end: 1 }]);
		filterNotOk(matchesStrictPrefix, "x", "alpha");
		filterNotOk(matchesStrictPrefix, "A", "alpha");
		filterNotOk(matchesStrictPrefix, "AlPh", "alPHA");
	});

	test("PrefixFilter - ignore case", function () {
		filterOk(matchesPrefix, "alpha", "alpha", [{ start: 0, end: 5 }]);
		filterOk(matchesPrefix, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
		filterNotOk(matchesPrefix, "alpha", "alp");
		filterOk(matchesPrefix, "a", "alpha", [{ start: 0, end: 1 }]);
		filterNotOk(matchesPrefix, "x", "alpha");
		filterOk(matchesPrefix, "A", "alpha", [{ start: 0, end: 1 }]);
		filterOk(matchesPrefix, "AlPh", "alPHA", [{ start: 0, end: 4 }]);
	});

	test("CamelCaseFilter", function () {
		filterNotOk(matchesCamelCase, "", "");
		filterOk(matchesCamelCase, "", "anything", []);
		filterOk(matchesCamelCase, "alpha", "alpha", [{ start: 0, end: 5 }]);
		filterOk(matchesCamelCase, "AlPhA", "alpha", [{ start: 0, end: 5 }]);
		filterOk(matchesCamelCase, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
		filterNotOk(matchesCamelCase, "alpha", "alp");

		filterOk(matchesCamelCase, "c", "CamelCaseRocks", [
			{ start: 0, end: 1 }
		]);
		filterOk(matchesCamelCase, "cc", "CamelCaseRocks", [
			{ start: 0, end: 1 },
			{ start: 5, end: 6 }
		]);
		filterOk(matchesCamelCase, "ccr", "CamelCaseRocks", [
			{ start: 0, end: 1 },
			{ start: 5, end: 6 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, "cacr", "CamelCaseRocks", [
			{ start: 0, end: 2 },
			{ start: 5, end: 6 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, "cacar", "CamelCaseRocks", [
			{ start: 0, end: 2 },
			{ start: 5, end: 7 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, "ccarocks", "CamelCaseRocks", [
			{ start: 0, end: 1 },
			{ start: 5, end: 7 },
			{ start: 9, end: 14 }
		]);
		filterOk(matchesCamelCase, "cr", "CamelCaseRocks", [
			{ start: 0, end: 1 },
			{ start: 9, end: 10 }
		]);
		filterOk(matchesCamelCase, "fba", "FooBarAbe", [
			{ start: 0, end: 1 },
			{ start: 3, end: 5 }
		]);
		filterOk(matchesCamelCase, "fbar", "FooBarAbe", [
			{ start: 0, end: 1 },
			{ start: 3, end: 6 }
		]);
		filterOk(matchesCamelCase, "fbara", "FooBarAbe", [
			{ start: 0, end: 1 },
			{ start: 3, end: 7 }
		]);
		filterOk(matchesCamelCase, "fbaa", "FooBarAbe", [
			{ start: 0, end: 1 },
			{ start: 3, end: 5 },
			{ start: 6, end: 7 }
		]);
		filterOk(matchesCamelCase, "fbaab", "FooBarAbe", [
			{ start: 0, end: 1 },
			{ start: 3, end: 5 },
			{ start: 6, end: 8 }
		]);
		filterOk(matchesCamelCase, "c2d", "canvasCreation2D", [
			{ start: 0, end: 1 },
			{ start: 14, end: 16 }
		]);
		filterOk(matchesCamelCase, "cce", "_canvasCreationEvent", [
			{ start: 1, end: 2 },
			{ start: 7, end: 8 },
			{ start: 15, end: 16 }
		]);
	});

	test("CamelCaseFilter - #19256", function () {
		assert(matchesCamelCase('Debug Console', 'Open: Debug Console'));
		assert(matchesCamelCase('Debug console', 'Open: Debug Console'));
		assert(matchesCamelCase('debug console', 'Open: Debug Console'));
	});

	test("matchesContiguousSubString", function () {
		filterOk(matchesContiguousSubString, "cela", "cancelAnimationFrame()", [
			{ start: 3, end: 7 }
		]);
	});

	test("matchesSubString", function () {
		filterOk(matchesSubString, "cmm", "cancelAnimationFrame()", [
			{ start: 0, end: 1 },
			{ start: 9, end: 10 },
			{ start: 18, end: 19 }
		]);
	});
});
