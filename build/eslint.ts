/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ESLint } from 'eslint';
import { eslintFilter } from './filters.ts';

export function getEslintFilePatterns(args: readonly string[]): string[] {
	if (args.length === 0) {
		return Array.from(eslintFilter);
	}

	return Array.from(args);
}

export function shouldErrorOnUnmatchedPattern(args: readonly string[]): boolean {
	return args.length > 0;
}

/**
 * Parses the ESLint `concurrency` option from `VSCODE_ESLINT_CONCURRENCY`:
 * `auto` (the default), `off`, or a positive number of worker threads.
 */
export function getEslintConcurrency(value: string | undefined): number | 'auto' | 'off' {
	if (!value || value === 'auto') {
		return 'auto';
	}
	if (value === 'off') {
		return 'off';
	}
	const workers = Number(value);
	if (!Number.isInteger(workers) || workers < 1) {
		throw new Error(`Invalid VSCODE_ESLINT_CONCURRENCY: ${value}`);
	}
	return workers;
}

async function eslint(args: readonly string[]): Promise<void> {
	const started = Date.now();
	const concurrency = getEslintConcurrency(process.env['VSCODE_ESLINT_CONCURRENCY']);
	console.log(args.length > 0
		? `ESLint: checking ${args.length} requested target${args.length === 1 ? '' : 's'} (concurrency: ${concurrency}).`
		: `ESLint: checking the full repository (concurrency: ${concurrency}).`);
	const linter = new ESLint({
		cache: true,
		cacheLocation: '.eslintcache',
		cacheStrategy: 'content',
		concurrency,
		errorOnUnmatchedPattern: shouldErrorOnUnmatchedPattern(args),
	});
	const formatter = await linter.loadFormatter('compact');

	const results = await linter.lintFiles(getEslintFilePatterns(args));
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
