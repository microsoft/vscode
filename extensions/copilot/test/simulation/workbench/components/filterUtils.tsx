/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { grepStrToRegex } from '../../shared/grepFilter';
import { ISimulationTest } from '../stores/simulationTestsProvider';
import { TestFilterer } from './testFilterer';

/**
 * A filter predicate for simulation tests
 */
export type FilterPredicate = (test: ISimulationTest) => boolean;

/**
 * Creates a TestFilterer from a set of filter predicates
 * @param predicates Array of filter predicates to apply
 * @returns A TestFilterer that applies all predicates
 */
export function createFilterer(predicates: FilterPredicate[]): TestFilterer {
	return {
		filter: (tests: readonly ISimulationTest[]) => {
			// Fast path for empty predicates or empty tests
			if (predicates.length === 0 || tests.length === 0) {
				return [...tests];
			}

			// Combine all predicates with AND logic
			return tests.filter(test => predicates.every(predicate => predicate(test)));
		}
	};
}

// Common filter predicates

const suiteSearchPrefix = /^!s:/;

/**
 * Filter by test name or suite name (using grep syntax)
 */
export function createGrepFilter(grep: string): FilterPredicate {
	if (!grep || grep.trim() === '') {
		return () => true;
	}

	let trimmedGrep = grep.trim();
	const isSuiteNameSearch = trimmedGrep.startsWith('!s:');
	if (isSuiteNameSearch) {
		trimmedGrep = trimmedGrep.replace(suiteSearchPrefix, '');
	}
	const grepRegex = grepStrToRegex(trimmedGrep);

	return (test) => isSuiteNameSearch
		? grepRegex.test(test.suiteName)
		: grepRegex.test(test.name);
}

/**
 * Filter tests that have baseline JSON changes
 */
export function createBaselineChangedFilter(): FilterPredicate {
	return (test) => {
		if (test.runnerStatus === undefined || test.baselineJSON === undefined) {
			return false;
		}

		const canCompareWithBaseline = test.runnerStatus.expectedRuns === (
			test.baselineJSON.passCount +
			test.baselineJSON.failCount +
			test.baselineJSON.contentFilterCount
		);

		if (!canCompareWithBaseline) {
			return false;
		}

		const passCount = test.runnerStatus.runs.filter(r => r.pass).length;
		const changedByPassCount = passCount !== test.baselineJSON?.passCount;

		if (changedByPassCount) {
			return true;
		}

		// check if explicit score has changed
		const explicitScoreBasedTest = test.runnerStatus.runs.at(0)?.explicitScore !== undefined;
		if (explicitScoreBasedTest) {
			const expectedScore = test.baselineJSON.score.toFixed(2);
			const actualScore = (
				test.runnerStatus.runs.reduce((acc, run) => acc + (run.explicitScore ?? 0), 0) /
				test.runnerStatus.runs.length
			).toFixed(2);
			return expectedScore !== actualScore;
		}

		return changedByPassCount;
	};
}

/**
 * Filter tests with failures
 */
export function createFailuresFilter(): FilterPredicate {
	return (test) => {
		return !!test.runnerStatus &&
			test.runnerStatus.runs.filter(r => r.pass).length < test.runnerStatus.expectedRuns;
	};
}

/**
 * Filter tests with cache misses
 */
export function createCacheMissesFilter(): FilterPredicate {
	return (test) => !!test.runnerStatus && test.runnerStatus.runs.some(r => r.hasCacheMiss);
}

/**
 * Filter tests that have been run
 */
export function createRanTestsFilter(): FilterPredicate {
	return (test) => !!test.runnerStatus;
}

/**
 * Filter tests by annotations
 */
export function createAnnotationFilter(selectedAnnotations: Set<string> | undefined): FilterPredicate {
	if (!selectedAnnotations || selectedAnnotations.size === 0) {
		return () => true;
	}

	return (test) => test.runnerStatus?.runs.some(
		r => r.annotations.some(a => selectedAnnotations.has(a.label))
	) === true;
}
