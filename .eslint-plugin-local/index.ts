/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ESLint } from 'eslint';
import { readdirSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

// Re-export all .ts files as rules
const rules: NonNullable<ESLint.Plugin['rules']> = {};
readdirSync(import.meta.dirname)
	.filter(file => file.endsWith('.ts') && !file.startsWith('.') && !file.endsWith('index.ts') && !file.endsWith('utils.ts'))
	.sort()
	.map(file => {
		rules[path.basename(file, '.ts')] = require(path.join(import.meta.dirname, file)).default;
	});

export { rules };
