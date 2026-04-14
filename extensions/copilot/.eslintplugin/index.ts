/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { LooseRuleDefinition } from '@typescript-eslint/utils/ts-eslint';
import * as glob from 'glob';
import path from 'path';

// Re-export all .ts files as rules
const rules: Record<string, LooseRuleDefinition> = {};
await Promise.all(
	glob.sync('*.ts', { cwd: import.meta.dirname })
		.filter(file => !file.endsWith('index.ts') && !file.endsWith('utils.ts'))
		.map(async file => {
			rules[path.basename(file, '.ts')] = (await import('./' + file)).default;
		})
);

export { rules };
