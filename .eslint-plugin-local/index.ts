/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { readdirSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import type { Plugin } from '@oxlint/plugins';

const require = createRequire(import.meta.url);

// Re-export all .ts files as rules
const rules: Plugin['rules'] = {};
readdirSync(import.meta.dirname)
	.filter(file => file.endsWith('.ts') && !file.startsWith('.') && !file.endsWith('index.ts') && !file.endsWith('utils.ts'))
	.sort()
	.map(file => {
		rules[path.basename(file, '.ts')] = require(path.join(import.meta.dirname, file)).default;
	});

export default { meta: { name: 'local' }, rules } satisfies Plugin;
