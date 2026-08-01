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

async function eslint(args: readonly string[]): Promise<void> {
	const linter = new ESLint({
		cache: true,
		cacheLocation: '.eslintcache',
		cacheStrategy: 'content',
		concurrency: 'auto',
		errorOnUnmatchedPattern: shouldErrorOnUnmatchedPattern(args),
	});
	const formatter = await linter.loadFormatter('compact');

	const results = await linter.lintFiles(getEslintFilePatterns(args));
	const message = await formatter.format(results);
	if (message) {
		console.log(message);
	}

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
