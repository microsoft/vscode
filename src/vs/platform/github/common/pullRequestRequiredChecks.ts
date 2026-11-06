/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { parse, YamlMapNode, YamlNode } from '../../../base/common/yaml.js';
import { PullRequestCheck, PullRequestChecks, PullRequestCheckSuite } from './githubPullRequestService.js';

/**
 * A job of a GitHub Actions workflow, reduced to what decides the names of the
 * checks it reports and the jobs it waits for.
 */
export interface WorkflowJob {
	/** The job's key under `jobs:`. */
	readonly id: string;
	/** The job's `name:`, which may contain `${{ }}` expressions, or its key when it has none. */
	readonly name: string;
	/** The keys of the jobs it lists in `needs:`. */
	readonly needs: readonly string[];
	/** Whether it calls a reusable workflow, whose jobs report as `<name> / <job>`. */
	readonly reusable: boolean;
	/** Whether it runs a matrix, whose jobs may report as `<name> (<values>)`. */
	readonly matrix: boolean;
}

/**
 * Reads the jobs of a workflow file, or returns `undefined` when it has none
 * that can be read, in which case none of its checks count as the dependency
 * of a required check.
 *
 * The parser reports values it does not support, such as an empty
 * `workflow_dispatch:` trigger, while still reading the rest, so its errors
 * are ignored. It supports no anchors either, which ends the jobs it reads
 * early; the jobs it misses only contribute no dependencies.
 */
export function parseWorkflowJobs(text: string): ReadonlyMap<string, WorkflowJob> | undefined {
	const root = parse(text);
	const jobs = root?.type === 'map' ? getMapValue(root, 'jobs') : undefined;
	if (jobs?.type !== 'map') {
		return undefined;
	}
	const result = new Map<string, WorkflowJob>();
	for (const { key, value } of jobs.properties) {
		if (value.type !== 'map') {
			continue;
		}
		const name = getMapValue(value, 'name');
		const needs = getMapValue(value, 'needs');
		const strategy = getMapValue(value, 'strategy');
		result.set(key.value, {
			id: key.value,
			name: name?.type === 'scalar' && name.value ? name.value : key.value,
			needs: needs?.type === 'scalar' ? [needs.value]
				: needs?.type === 'sequence' ? needs.items.flatMap(item => item.type === 'scalar' ? [item.value] : [])
					: [],
			reusable: getMapValue(value, 'uses') !== undefined,
			matrix: strategy?.type === 'map' && getMapValue(strategy, 'matrix') !== undefined,
		});
	}
	return result;
}

/**
 * Marks each check that a required check waits for, directly or through other
 * jobs, with that required check's name in {@link PullRequestCheck.requiredBy}.
 *
 * GitHub does not report which jobs a job `needs:`, so they are read from the
 * workflow of the run that reported each check. This matters for an aggregate
 * gate, such as a `PR Gate` job that needs every other job of its workflow:
 * GitHub only creates its check once everything it needs has finished, so a
 * job it needs can fail long before the gate itself reports.
 *
 * @param requiredNames The required checks whose dependencies to mark.
 * @param getWorkflowJobs The jobs of the workflow at a path, if it could be read.
 */
export function annotateRequiredCheckDependencies(
	checks: readonly PullRequestCheck[],
	requiredNames: Iterable<string>,
	getWorkflowJobs: (path: string) => ReadonlyMap<string, WorkflowJob> | undefined,
): readonly PullRequestCheck[] {
	const runChecks = new Map<string, PullRequestCheck[]>();
	for (const check of checks) {
		if (check.workflowRunId !== undefined && check.workflowPath !== undefined) {
			const run = runChecks.get(check.workflowRunId);
			if (run) {
				run.push(check);
			} else {
				runChecks.set(check.workflowRunId, [check]);
			}
		}
	}
	const runs = [...runChecks.values()].flatMap(checks => {
		const jobs = getWorkflowJobs(checks[0].workflowPath!);
		return jobs ? [{ checks, jobs: [...jobs.values()].map(job => ({ job, pattern: getJobCheckNamePattern(job) })), definitions: jobs }] : [];
	});
	const requiredBy = new Map<PullRequestCheck, Set<string>>();
	for (const name of requiredNames) {
		// A job named literally in any workflow is the required check's. A name
		// that is only an expression could be anything, so it never is.
		const literal = runs.some(run => run.jobs.some(({ job, pattern }) => !hasExpression(job.name) && pattern.test(name)));
		for (const run of runs) {
			const gates = run.jobs
				.filter(({ job, pattern }) => (literal ? !hasExpression(job.name) : !isOnlyExpression(job.name)) && pattern.test(name))
				.map(({ job }) => job.id);
			const dependencies = getTransitiveNeeds(run.definitions, gates);
			if (dependencies.size === 0) {
				continue;
			}
			for (const check of run.checks) {
				if (check.name !== name && getReportingJobs(run.jobs, check.name).some(job => dependencies.has(job.id))) {
					let set = requiredBy.get(check);
					if (!set) {
						set = new Set();
						requiredBy.set(check, set);
					}
					set.add(name);
				}
			}
		}
	}
	return checks.map(check => {
		const set = requiredBy.get(check);
		return set ? { ...check, requiredBy: [...set].sort() } : check;
	});
}

/**
 * The names of the checks the base branch requires: those its branch
 * protection and rulesets name, and any check GitHub reports as required.
 */
export function getRequiredPullRequestCheckNames(value: PullRequestChecks): ReadonlySet<string> {
	const names = new Set(value.requiredContexts);
	for (const check of value.checks) {
		if (check.required === true) {
			names.add(check.name);
		}
	}
	return names;
}

/**
 * The required checks that have not finished: those still running, and those
 * that have not reported at all. Only their dependencies count; see
 * {@link classifyRequiredPullRequestChecks}.
 */
export function getUnfinishedRequiredPullRequestCheckNames(value: PullRequestChecks): readonly string[] {
	return [...getRequiredPullRequestCheckNames(value)].filter(name => {
		const own = getOwnRequiredChecks(value, name);
		return own.length === 0 || own.some(check => getPullRequestCheckState(check) === 'pending');
	});
}

export type PullRequestCheckState = 'passed' | 'pending' | 'failed';

const passedConclusions = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

/** How a check stands; the one rule every pull request surface judges checks by. */
export function getPullRequestCheckState(check: Pick<PullRequestCheck, 'type' | 'status' | 'conclusion'>): PullRequestCheckState {
	const status = check.status?.toUpperCase();
	if (check.type === 'statusContext') {
		return !status || status === 'PENDING' || status === 'EXPECTED' ? 'pending' : status === 'SUCCESS' ? 'passed' : 'failed';
	}
	if (status !== 'COMPLETED' || !check.conclusion) {
		return 'pending';
	}
	return passedConclusions.has(check.conclusion.toUpperCase()) ? 'passed' : 'failed';
}

export interface RequiredPullRequestChecks {
	/** Whether the base branch requires no check, so that every check counts. */
	readonly everyCheck: boolean;
	/** The checks that count, in the order they were reported. */
	readonly checks: readonly PullRequestCheck[];
	/** The counted checks that failed. */
	readonly failed: readonly PullRequestCheck[];
	/** The required checks that have not reported yet. */
	readonly missing: readonly string[];
	/** Whether a counted check is still running, or a required check has not reported yet. */
	readonly pending: boolean;
}

/**
 * Decides which checks of a pull request head count, and how they stand.
 *
 * A required check counts, and so does every check it needs while it has not
 * finished, so a failure surfaces as soon as a job the required check waits
 * for fails. Once a required check has finished, its own result decides: an
 * aggregate gate may deliberately tolerate the failure of a job it needs. A
 * required check that has not reported yet is pending. When the base branch
 * requires no check at all, every check counts, including check suites that
 * have not reported a check yet.
 *
 * @param isIgnored Excludes checks by name, as do the patterns of
 * `chat.artifactIntegrations.githubPullRequests.autoMarkReadyIgnoredChecks`
 * when deciding readiness. An excluded required check also excludes the
 * checks it needs.
 */
export function classifyRequiredPullRequestChecks(value: PullRequestChecks, isIgnored: (name: string) => boolean = () => false): RequiredPullRequestChecks {
	const required = getRequiredPullRequestCheckNames(value);
	if (required.size === 0) {
		const checks = [
			...value.checks,
			...value.expectedSuites.filter(suite => !suite.checkRunsReported).map(toUnreportedCheckSuiteCheck),
		].filter(check => !isIgnored(check.name));
		return summarize(true, checks, []);
	}
	const counted = new Set<PullRequestCheck>();
	const missing: string[] = [];
	for (const name of required) {
		if (isIgnored(name)) {
			continue;
		}
		const own = getOwnRequiredChecks(value, name);
		for (const check of own) {
			counted.add(check);
		}
		if (own.length > 0 && own.every(check => getPullRequestCheckState(check) !== 'pending')) {
			continue;
		}
		if (own.length === 0) {
			missing.push(name);
		}
		for (const check of value.checks) {
			if (check.requiredBy?.includes(name) && !isIgnored(check.name)) {
				counted.add(check);
			}
		}
	}
	return summarize(false, value.checks.filter(check => counted.has(check)), missing);
}

const unreportedCheckSuitePrefix = 'suite:';

/**
 * Stands in for a check suite that has not reported a check yet, such as a
 * workflow whose jobs have not started, so that it counts as a check.
 */
export function toUnreportedCheckSuiteCheck(suite: PullRequestCheckSuite): PullRequestCheck {
	return { id: `${unreportedCheckSuitePrefix}${suite.id}`, type: 'checkRun', name: suite.name, status: suite.status, conclusion: suite.conclusion };
}

/**
 * Whether a check stands in for a check suite that has not reported a check
 * yet (see {@link toUnreportedCheckSuiteCheck}), which has no runs, logs or
 * annotations to read.
 */
export function isUnreportedCheckSuite(check: PullRequestCheck): boolean {
	return check.id.startsWith(unreportedCheckSuitePrefix);
}

export type PullRequestChecksStatus = 'pending' | 'success' | 'failure';

/**
 * Summarizes the checks that count for a pull request head (see
 * {@link classifyRequiredPullRequestChecks}) as one status: a failure as soon
 * as any of them failed, even while others still run. Returns `undefined`
 * when no check counts.
 */
export function getRequiredPullRequestChecksStatus(value: PullRequestChecks): PullRequestChecksStatus | undefined {
	const result = classifyRequiredPullRequestChecks(value);
	if (result.failed.length > 0) {
		return 'failure';
	}
	if (result.pending) {
		return 'pending';
	}
	return result.checks.length > 0 ? 'success' : undefined;
}

function summarize(everyCheck: boolean, checks: readonly PullRequestCheck[], missing: readonly string[]): RequiredPullRequestChecks {
	return {
		everyCheck,
		checks,
		failed: checks.filter(check => getPullRequestCheckState(check) === 'failed'),
		missing,
		pending: missing.length > 0 || checks.some(check => getPullRequestCheckState(check) === 'pending'),
	};
}

/** The checks named after a required check, except those GitHub reports as not required, such as a namesake from another app. */
function getOwnRequiredChecks(value: PullRequestChecks, name: string): readonly PullRequestCheck[] {
	return value.checks.filter(check => check.name === name && check.required !== false);
}

/**
 * Matches the names of the checks a job reports. An expression in its name
 * matches anything, a matrix job may append its values, and the jobs of a
 * reusable workflow report under the calling job's name.
 */
function getJobCheckNamePattern(job: WorkflowJob): RegExp {
	const parts = job.name.split(expressionPattern);
	const name = parts.map(escapeRegExpCharacters).join('.*');
	const matrix = job.matrix || parts.length > 1 ? '(?: \\(.*\\))?' : '';
	return new RegExp(`^${name}${matrix}${job.reusable ? ' / .+' : ''}$`);
}

const expressionPattern = /\$\{\{.*?\}\}/;

function hasExpression(name: string): boolean {
	return expressionPattern.test(name);
}

function isOnlyExpression(name: string): boolean {
	return name.split(expressionPattern).every(part => part.trim() === '');
}

/**
 * The jobs that report a check of the given name. A job named literally
 * claims it over one whose name has expressions, which match more broadly.
 */
function getReportingJobs(jobs: readonly { readonly job: WorkflowJob; readonly pattern: RegExp }[], name: string): readonly WorkflowJob[] {
	const reporting = jobs.filter(({ pattern }) => pattern.test(name)).map(({ job }) => job);
	const literal = reporting.filter(job => !hasExpression(job.name));
	return literal.length > 0 ? literal : reporting;
}

function getTransitiveNeeds(jobs: ReadonlyMap<string, WorkflowJob>, roots: readonly string[]): ReadonlySet<string> {
	const result = new Set<string>();
	const pending = [...roots];
	while (pending.length > 0) {
		for (const need of jobs.get(pending.pop()!)?.needs ?? []) {
			if (!result.has(need)) {
				result.add(need);
				pending.push(need);
			}
		}
	}
	return result;
}

function getMapValue(node: YamlMapNode, key: string): YamlNode | undefined {
	return node.properties.find(property => property.key.value === key)?.value;
}
