/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import rule from '../code-class-name-pascal-case.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const error = (name: string) => ({ message: `Class name \`${name}\` must match one of the following formats: PascalCase` });

new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } }).run('code-class-name-pascal-case', rule, {
	valid: [
		{ name: 'PascalCase', code: `class SignService {}` },
		{ name: 'anonymous class expression', code: `const service = class {};` },
	],
	invalid: [
		{ name: 'lowercase declared class', code: `declare namespace vsda { export class signer {} }`, errors: [error('signer')] },
		{ name: 'underscore', code: `const service = class Sign_Service {};`, errors: [error('Sign_Service')] },
	],
});
