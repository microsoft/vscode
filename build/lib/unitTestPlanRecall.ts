/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * What a unit test runner reports when its run ends (see `VSCODE_TEST_FAILURE_REPORT` in
 * test/unit/README.md).
 */
export interface IFailureReport {
	/** The test files that still failed at the end of the run, such as `src/vs/a.test.ts`. */
	readonly failed: readonly string[];
	/** The test files that failed, but whose failures all passed when rerun. */
	readonly flaky: readonly string[];
	/** The titles of the failures that do not belong to a test file. */
	readonly unattributed: readonly string[];
}

/** GitHub shows at most 10 warning annotations of a step. */
const MAX_WARNINGS = 10;

/**
 * Compares the test files that failed on Linux, which runs every unit test, with the unit test
 * files that the unit test plan selected, which are the only ones that macOS and Windows ran (see
 * build/ripple/README.md). Returns a warning for each failed test file that the plan did not
 * select, as workflow commands, and a job summary.
 * @param selected the test files that the plan selected, from its unit.txt
 * @param reports the failure reports of the test runners
 */
export function compareFailuresWithPlan(selected: ReadonlySet<string>, reports: readonly IFailureReport[]): { commands: string[]; summary: string } {
	const failed = [...new Set(reports.flatMap(report => report.failed))].sort();
	const flaky = [...new Set(reports.flatMap(report => report.flaky))].filter(file => !failed.includes(file)).sort();
	const unattributed = reports.flatMap(report => report.unattributed);
	const missed = failed.filter(file => !selected.has(file));

	const commands = missed.map(file => `::warning file=${escapeProperty(file)},title=Unit test plan miss::${escapeData(`${file} failed on Linux, but the unit test plan did not select it, so macOS and Windows did not run it.`)}`);
	if (commands.length > MAX_WARNINGS) {
		const more = commands.length - MAX_WARNINGS + 1;
		commands.splice(MAX_WARNINGS - 1, more, `::warning title=Unit test plan miss::${more} more test files failed on Linux, but the unit test plan did not select them. See the job summary.`);
	}

	const lines = ['### Unit test plan recall', ''];
	const ran = selected.size > 0
		? `macOS and Windows only ran the ${plural(selected.size, 'unit test file')} that the unit test plan selected`
		: 'macOS and Windows ran none, because the unit test plan selected no unit test file';
	if (failed.length > 0) {
		lines.push(`Linux runs every unit test, while ${ran}. The plan selected ${failed.length - missed.length} of the ${plural(failed.length, 'test file')} that failed in this job:`, '');
		for (const file of missed) {
			lines.push(`- \`${file}\`: **not selected**, so macOS and Windows did not run it`);
		}
		for (const file of failed.filter(file => selected.has(file))) {
			lines.push(`- \`${file}\`: selected`);
		}
	} else if (unattributed.length > 0) {
		lines.push(`Linux runs every unit test, while ${ran}. No test file failed in this job.`);
	} else {
		lines.push('The unit tests failed without reporting which test files failed, for example because a test file failed to load or a test runner crashed, so the failures cannot be compared with the unit test plan.');
	}
	if (flaky.length > 0) {
		lines.push('', `Not counted, because they passed when rerun (flaky): ${flaky.map(file => `\`${file}\``).join(', ')}`);
	}
	if (unattributed.length > 0) {
		lines.push('', `Not counted, because they do not belong to a test file: ${unattributed.map(title => `\`${title.replace(/\s*[\n\r\u2028\u2029]+\s*/g, ' ').replace(/`/g, '\'')}\``).join(', ')}`);
	}
	lines.push('');
	return { commands, summary: lines.join('\n') };
}

/** Escapes the message of a workflow command. */
function escapeData(value: string): string {
	return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escapes a property of a workflow command. */
function escapeProperty(value: string): string {
	return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Compares the failure reports in `reportFolder` with the unit test plan in `planFolder`,
 * prints the warnings and the summary, and adds the summary to the job summary on GitHub.
 */
function main(planFolder: string, reportFolder: string): void {
	const planFile = path.join(planFolder, 'plan.json');
	if (!existsSync(planFile) || JSON.parse(readFileSync(planFile, 'utf8')).select !== true) {
		console.log('No unit test plan selects unit test files, so macOS and Windows ran every unit test.');
		return;
	}

	// Without a list, the plan selected no unit test file.
	const listFile = path.join(planFolder, 'unit.txt');
	const selected = new Set(existsSync(listFile) ? readFileSync(listFile, 'utf8').split(/\r?\n/).map(line => line.trim().replace(/\\/g, '/')).filter(line => line.length > 0) : []);
	const reports: IFailureReport[] = existsSync(reportFolder)
		? readdirSync(reportFolder).filter(name => name.endsWith('.json')).sort().map(name => JSON.parse(readFileSync(path.join(reportFolder, name), 'utf8')))
		: [];

	const { commands, summary } = compareFailuresWithPlan(selected, reports);
	console.log([...commands, summary].join('\n'));
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
	}
}

if (import.meta.main) {
	const [planFolder, reportFolder] = process.argv.slice(2);
	if (!planFolder || !reportFolder) {
		console.error('Usage: node build/lib/unitTestPlanRecall.ts <unit test plan folder> <failure report folder>');
		process.exit(1);
	}
	main(planFolder, reportFolder);
}
