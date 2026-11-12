/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import rule from '../code-translation-remind.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const code = `import { localize } from '../../../../nls.js';`;

new RuleTester().run('code-translation-remind', rule, {
	valid: [
		{ filename: '/repo/src/vs/workbench/contrib/chat/browser/example.ts', code },
		{ filename: String.raw`C:\repo\src\vs\workbench\contrib\chat\browser\example.ts`, code },
	],
	invalid: [
		{ filename: '/repo/src/vs/sessions/contrib/unregistered/browser/example.ts', code, errors: [{ messageId: 'missing' }] },
		{ filename: String.raw`C:\repo\src\vs\sessions\contrib\unregistered\browser\example.ts`, code, errors: [{ messageId: 'missing' }] },
	],
});
