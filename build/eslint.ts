/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ESLint } from 'eslint';
import { eslintFilter } from './filters.ts';

async function eslint(): Promise<void> {
	const linter = new ESLint({
		cache: true,
		cacheLocation: '.eslintcache',
		cacheStrategy: 'content',
		concurrency: 'auto',
		errorOnUnmatchedPattern: false,
	});
	const formatter = await linter.loadFormatter('compact');

	const results = await linter.lintFiles(Array.from(eslintFilter));
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
	eslint().catch((err) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
