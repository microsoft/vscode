/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ESLint, Rule } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';

/**
 * The ESLint core rules that oxlint does not implement, as the `eslint-js` plugin. Both linters run ESLint's own
 * implementation under the same name, so configuration and disable directives work in both.
 */
const ruleNames = [
	'no-buffer-constructor',
	'no-restricted-syntax',
];

const rules: Record<string, Rule.RuleModule> = {};
for (const name of ruleNames) {
	const rule = builtinRules.get(name);
	if (!rule) {
		throw new Error(`ESLint has no core rule '${name}'`);
	}
	rules[name] = rule;
}

export default { meta: { name: 'eslint-js' }, rules } satisfies ESLint.Plugin;
