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
				try {
					const ruleModule = await import('./' + file);
					if (ruleModule.default) {
						rules[path.basename(file, '.ts')] = ruleModule.default;
					}
				} catch (error) {
					console.error(`Failed to load ESLint rule from ${file}:`, error);
				}
			})
	);
} catch (error) {
	console.error('Failed to read ESLint rules directory:', error);
}

export { rules };
