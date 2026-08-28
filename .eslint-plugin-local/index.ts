/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ESLint } from 'eslint';
import glob from 'glob';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

// Re-export all .ts files as rules
const rules: NonNullable<ESLint.Plugin['rules']> = {};
glob.sync(`${import.meta.dirname}/*.ts`)
	.filter(file => !file.endsWith('index.ts') && !file.endsWith('utils.ts'))
	.map(file => {
		rules[path.basename(file, '.ts')] = require(file).default;
	});

export { rules };
