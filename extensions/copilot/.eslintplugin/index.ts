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
	// Fail fast with contextual error and preserve the original stack trace as error cause
	const errorMessage = error instanceof Error ? error.message : String(error);
	throw new Error(`Failed to initialize Copilot ESLint plugin rules: ${errorMessage}`, { cause: error });
}

export { rules };
