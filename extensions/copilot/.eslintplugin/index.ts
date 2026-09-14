/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ESLint } from 'eslint';
import fs from 'fs';
import path from 'path';

// Re-export all .ts files as rules
const rules: NonNullable<ESLint.Plugin['rules']> = {};
await Promise.all(
	fs.readdirSync(import.meta.dirname)
		.filter(file => file.endsWith('.ts') && !file.endsWith('index.ts') && !file.endsWith('utils.ts'))
		.map(async file => {
			rules[path.basename(file, '.ts')] = (await import('./' + file)).default;
		})
);

export { rules };
