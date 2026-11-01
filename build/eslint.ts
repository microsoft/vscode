/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ESLint } from 'eslint';
import { parseArgs } from 'util';
import { eslintFilter } from './filters.ts';
import { getChangedFilesScope, getEslintScope, type CheckScope } from './lib/changedFiles.ts';

export function getEslintFilePatterns(args: readonly string[]): string[] {
	if (args.length === 0) {
		return Array.from(eslintFilter);
	}

	return Array.from(args);
}

export function shouldErrorOnUnmatchedPattern(args: readonly string[]): boolean {
	return args.length > 0;
}

interface IEslintRun {
	readonly description: string;
	readonly patterns: readonly string[];
	readonly options: ESLint.Options;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Determines what to lint: the full repository, the requested files and globs, or with `--changed-since <ref>` the
 * files that changed between `ref` and `HEAD`.
 */
export function getEslintRun(args: readonly string[], getScope: (base: string) => CheckScope = base => getChangedFilesScope(base, getEslintScope)): IEslintRun {
	const { values, positionals } = parseArgs({
		args: Array.from(args),
		options: { 'changed-since': { type: 'string' } },
		allowPositionals: true,
	});
	const changedSince = values['changed-since'];
	if (changedSince === undefined) {
		return {
			description: positionals.length > 0 ? plural(positionals.length, 'requested target') : 'the full repository',
			patterns: getEslintFilePatterns(positionals),
			options: { errorOnUnmatchedPattern: shouldErrorOnUnmatchedPattern(positionals) },
		};
	}
	if (positionals.length > 0) {
		throw new Error('Pass either files to lint or --changed-since, not both.');
	}
	if (!changedSince) {
		throw new Error('--changed-since requires a git revision.');
	}

	const scope = getScope(changedSince);
	if (scope.kind === 'full') {
		return {
			description: `the full repository because ${scope.reason}`,
			patterns: getEslintFilePatterns([]),
			options: { errorOnUnmatchedPattern: false },
		};
	}
	return {
		description: `${plural(scope.files.length, 'file')} (${scope.reason})`,
		patterns: scope.files,
		// The changed files are paths, not globs. Skip the ones that eslint.config.js ignores.
		options: { errorOnUnmatchedPattern: false, globInputPaths: false, warnIgnored: false },
	};
}

async function eslint(args: readonly string[]): Promise<void> {
	const started = Date.now();
	const run = getEslintRun(args);
	console.log(`ESLint: checking ${run.description}.`);
	if (run.patterns.length === 0) {
		return;
	}

	const linter = new ESLint({
		cache: true,
		cacheLocation: '.eslintcache',
		cacheStrategy: 'content',
		concurrency: 'auto',
		...run.options,
	});
	const formatter = await linter.loadFormatter('compact');

	const results = await linter.lintFiles(Array.from(run.patterns));
	const message = await formatter.format(results);
	if (message) {
		console.log(message);
	}
	console.log(`ESLint: checked ${results.length} file${results.length === 1 ? '' : 's'} in ${Date.now() - started}ms.`);

	let warningCount = 0;
	let errorCount = 0;
	for (const r of results) {
		warningCount += r.warningCount;
		errorCount += r.errorCount;
	}
	if (warningCount > 0 || errorCount > 0) {
		throw new Error(`eslint failed with ${warningCount + errorCount} warnings and/or errors`);
	}
}

if (import.meta.main) {
	eslint(process.argv.slice(2)).catch((err) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
