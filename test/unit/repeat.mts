/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describeListedTest, isListed, type IListedTest } from './testList.mts';

/**
 * A test or hook that an attempt reports. `file` is its test module, if it belongs to one.
 */
export interface IRunnable {
	readonly file?: string;
	readonly titlePath: readonly string[];
}

/**
 * What an attempt reports: the tests that passed, the tests and hooks that failed, and the
 * failures that belong to no test file, such as the runner's own checks.
 */
export interface IAttemptResult {
	readonly passed: readonly IRunnable[];
	readonly failures: readonly IRunnable[];
	readonly unattributedFailures: readonly string[];
}

export interface IRepeatedRunsOptions {
	/** The number of attempts. */
	readonly count: number;
	/** The seconds after which no attempt starts that would end later, no limit when unset. */
	readonly budget: string | undefined;
	/** The tests of `--testList` that the runner runs. */
	readonly listed: readonly IListedTest[] | undefined;
	/** The runner, in messages and annotations. */
	readonly runner: string;
	/** What each attempt runs in, such as `a fresh process`. */
	readonly fresh: string;
}

interface IRecord {
	readonly file: string;
	readonly titlePath: readonly string[];
	readonly passed: number[];
	readonly failed: number[];
}

/**
 * Parses `--repeat`: how many times to run the selected tests, or 0 when it is not set.
 */
export function parseRepeatCount(value: string | undefined): number {
	if (value === undefined) {
		return 0;
	}
	const count = Number(value);
	if (!Number.isInteger(count) || count < 1) {
		throw new Error(`--repeat must be a positive number of runs, not '${value}'`);
	}
	return count;
}

/**
 * Runs the same tests several times, each time in a fresh process, window or browser, and
 * reports how often each test failed, so that a flaky test fails the run.
 */
export class RepeatedRuns {

	private readonly options: IRepeatedRunsOptions;
	private readonly budgetMs: number;
	private readonly startTime = Date.now();
	private attempts = 0;
	/** Why fewer than `count` attempts ran. */
	private stopReason: string | undefined;
	/** The tests and hooks of test files, by file and title path. */
	private readonly records = new Map<string, IRecord>();
	/** Failures that do not belong to a test, and attempts that did not report their results. */
	private readonly problems: string[] = [];

	constructor(options: IRepeatedRunsOptions) {
		this.options = options;
		this.budgetMs = Math.max(0, Number(options.budget) || 0) * 1000;
	}

	/**
	 * Whether to run the attempt with the number `attempt`, the next one: until `count` attempts
	 * ran, unless the first attempt ran no test, or the next one would end after the budget.
	 */
	shouldRun(attempt: number): boolean {
		if (attempt > this.options.count) {
			return false;
		}
		if (attempt > 1) {
			const elapsed = Date.now() - this.startTime;
			if (this.records.size === 0) {
				this.stopReason = 'the first attempt ran none of the selected tests';
				return false;
			}
			if (this.budgetMs > 0 && elapsed + elapsed / (attempt - 1) > this.budgetMs) {
				this.stopReason = `the next attempt would end after the time budget of ${this.budgetMs / 1000}s (--repeat-budget)`;
				return false;
			}
		}
		console.log(`\n[${this.options.runner}] Attempt ${attempt} of ${this.options.count}, in ${this.options.fresh}:`);
		return true;
	}

	/**
	 * Records an attempt's results, or `undefined` when it did not complete or report them.
	 */
	record(attempt: number, result: IAttemptResult | undefined): void {
		this.attempts = attempt;
		if (!result) {
			this.problems.push(`attempt ${attempt} did not complete or report its results`);
			return;
		}
		for (const title of result.unattributedFailures) {
			this.problems.push(`${title} failed in attempt ${attempt}`);
		}
		const failed = new Set<IRecord>();
		for (const runnable of result.failures) {
			if (runnable.file) {
				const record = this.recordOf(runnable.file, runnable.titlePath);
				if (record.failed.at(-1) !== attempt) {
					record.failed.push(attempt);
				}
				failed.add(record);
			}
		}
		for (const runnable of result.passed) {
			// A test that passes and then fails in teardown is reported both ways.
			const record = runnable.file ? this.recordOf(runnable.file, runnable.titlePath) : undefined;
			if (record && !failed.has(record)) {
				record.passed.push(attempt);
			}
		}
	}

	private recordOf(file: string, titlePath: readonly string[]): IRecord {
		const key = JSON.stringify([file, titlePath]);
		let record = this.records.get(key);
		if (!record) {
			record = { file, titlePath, passed: [], failed: [] };
			this.records.set(key, record);
		}
		return record;
	}

	/**
	 * Prints how often each test failed, and returns the exit code: 1 when a test failed in any
	 * attempt, a failure belongs to no test, or an attempt did not report its results.
	 */
	report(): number {
		const { runner, count, fresh, listed } = this.options;
		const records = [...this.records.values()];
		const failed = records.filter(record => record.failed.length > 0);
		const seconds = Math.round((Date.now() - this.startTime) / 1000);
		console.log(`\n[${runner}] Ran ${records.length} test(s) in ${this.attempts} attempt(s) of ${count}, each in ${fresh} (${seconds}s)${this.stopReason ? `. Stopped early: ${this.stopReason}` : ''}.`);
		console.log(`  ${records.length - failed.length} test(s) passed in every attempt that ran them.`);

		if (failed.length > 0) {
			console.error(`  ${failed.length} test(s) failed:`);
			for (const record of failed) {
				const message = `${describe(record)} failed in ${record.failed.length} of ${record.failed.length + record.passed.length} attempts (${record.failed.join(', ')})`;
				console.error(`    ${message}`);
				annotate('error', `Test failed when repeated (${runner})`, message, record.file);
			}
			if (failed.some(record => record.passed.length === 0)) {
				console.error('  A test that fails in every attempt but passes in a full run may depend on other tests of its file, which do not run here.');
			}
		}

		for (const problem of this.problems) {
			console.error(`  ${problem}`);
			annotate('error', `Repeated tests (${runner})`, problem, undefined);
		}

		const notRun = (listed ?? []).filter(test => !records.some(record => isListed([test], record.file, record.titlePath)));
		if (notRun.length > 0) {
			console.log(`  ${notRun.length} listed test(s) did not run, because they are skipped, only defined on other platforms, or not found:`);
			for (const test of notRun) {
				console.log(`    ${describeListedTest(test)}`);
			}
			annotate('notice', `Repeated tests (${runner})`, `${notRun.length} listed test(s) did not run, because they are skipped, only defined on other platforms, or not found. See the log.`, undefined);
		}

		return failed.length > 0 || this.problems.length > 0 ? 1 : 0;
	}
}

/**
 * Describes a test or hook on one line, so that a title with line breaks stays in one annotation.
 */
function describe(record: IRecord): string {
	return `${record.titlePath.join(' ').replace(/\s*[\n\r\u2028\u2029]+\s*/g, ' ')} (${record.file})`;
}

/**
 * Reports a message as a CI annotation, on the test file when it is known (`file` is the test
 * module, such as `vs/base/test/common/strings.test`).
 */
function annotate(type: 'error' | 'notice', title: string, message: string, file: string | undefined): void {
	if (process.env.GITHUB_ACTIONS) {
		const data = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
		console.log(`::${type} ${file ? `file=src/${file}.ts,` : ''}title=${title}::${data}`);
	} else if (process.env.TF_BUILD && type === 'error') {
		console.log(`##vso[task.logissue type=error]${title}: ${message}`);
	}
}
