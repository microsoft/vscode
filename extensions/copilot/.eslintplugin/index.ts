/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ESLint } from 'eslint';
import fs from 'fs';
import path from 'path';

// Re-export all .ts files as rules
const rules: NonNullable<ESLint.Plugin['rules']> = {};

try {
	await Promise.all(
		fs.readdirSync(import.meta.dirname)
			.filter(file => file.endsWith('.ts') && !file.endsWith('index.ts') && !file.endsWith('utils.ts'))
			.map(async file => {
				const ruleModule = await import('./' + file);
				if (!ruleModule.default) {
					throw new Error(`ESLint rule module '${file}' is missing a default export.`);
				}
				rules[path.basename(file, '.ts')] = ruleModule.default;
			})
	);
} catch (error) {
	// Fail fast with contextual error to prevent silent cascading failures in eslint.config.js
	throw new Error(`Failed to initialize Copilot ESLint plugin rules: ${error instanceof Error ? error.message : error}`);
}

export { rules };
