/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import { resolve } from 'path';
import rule from '../code-no-restricted-zone-imports.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const file = (path: string) => resolve(import.meta.dirname, '../..', path);
const commonFile = file('extensions/copilot/src/platform/git/common/gitService.ts');
const platformFile = file('extensions/copilot/src/platform/git/vscode/gitService.ts');
const message = 'Platform code must not depend on extension code.';
const options = [{
	zones: [
		{ target: '**/common/**', from: ['**/vscode/**', '**/node/**'] },
		{ target: './extensions/copilot/src/platform', from: './extensions/copilot/src/extension', except: ['./allowed'], message },
		{ target: 'extensions/copilot/src/!(lib)/**', from: './extensions/copilot/src/lib' },
	],
}];
const error = (specifier: string, suffix = '') => ({ message: `Unexpected path "${specifier}" imported in restricted zone.${suffix}` });

new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } }).run('code-no-restricted-zone-imports', rule, {
	valid: [
		{ name: 'allowed relative import', filename: commonFile, options, code: `import { IGitService } from './git';` },
		{ name: 'bare specifier', filename: commonFile, options, code: `import { Worker } from 'some-package/node/worker';` },
		{ name: 'except', filename: platformFile, options, code: `import { x } from '../../../extension/allowed/x';` },
		{ name: 'file excluded by an extglob', filename: file('extensions/copilot/src/lib/node/chatLibMain.ts'), options, code: `import { x } from '../common/x';` },
	],
	invalid: [
		{ name: 'glob zone, extensionless', filename: commonFile, options, code: `import { Repository } from '../vscode/git';`, errors: [error('../vscode/git')] },
		{ name: 'glob zone, .js', filename: commonFile, options, code: `import { exec } from '../node/exec.js';`, errors: [error('../node/exec.js')] },
		{ name: 'type-only import', filename: commonFile, options, code: `import type { Repository } from '../vscode/git';`, errors: [error('../vscode/git')] },
		{
			name: 're-export, dynamic import, import equals, and require',
			filename: commonFile,
			options,
			code: [
				`export * from '../node/a';`,
				`const b = import('../node/b');`,
				`import c = require('../node/c');`,
				`const d = require('../node/d');`,
			].join('\n'),
			errors: [error('../node/a'), error('../node/b'), error('../node/c'), error('../node/d')],
		},
		{ name: 'directory zone with message', filename: platformFile, options, code: `import { x } from '../../../extension/x/common/x';`, errors: [error('../../../extension/x/common/x', ` ${message}`)] },
		{ name: 'extglob target', filename: file('extensions/copilot/src/util/vscode/x.ts'), options, code: `import { x } from '../../lib/node/chatLibMain';`, errors: [error('../../lib/node/chatLibMain')] },
	],
});
