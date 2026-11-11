/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ESLint, Rule } from 'eslint';
import tseslint from 'typescript-eslint';

/**
 * The typescript-eslint rules that oxlint does not implement, as the `ts-eslint-js` plugin. Both linters run
 * typescript-eslint's implementation under the same name, so configuration and disable directives work in both.
 */
const ruleNames = [
	'naming-convention',
	'no-restricted-imports',
];

// Parser services without a TypeScript program, for linters that provide none (oxlint). The rules above only need a
// program for options that select by type, which this repository does not use.
const servicesWithoutProgram = {
	program: null,
	esTreeNodeToTSNodeMap: new WeakMap(),
	tsNodeToESTreeNodeMap: new WeakMap(),
	emitDecoratorMetadata: undefined,
	experimentalDecorators: undefined,
	isolatedDeclarations: undefined,
};

function forwardTo<T extends object>(target: T, overrides: Record<string, unknown>): T {
	// The proxy target is empty, because the linter's objects can have read-only properties that a proxy must not change.
	return new Proxy<T>(Object.create(null), {
		get(_, property) {
			if (typeof property === 'string' && Object.hasOwn(overrides, property)) {
				return overrides[property];
			}
			const value = Reflect.get(target, property, target);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
}

function withParserServices(rule: Rule.RuleModule): Rule.RuleModule {
	return {
		...rule,
		create(context) {
			if (context.sourceCode.parserServices?.esTreeNodeToTSNodeMap) {
				return rule.create(context);
			}
			const sourceCode = forwardTo(context.sourceCode, { parserServices: servicesWithoutProgram });
			return rule.create(forwardTo(context, { sourceCode, getSourceCode: () => sourceCode }));
		}
	};
}

const typescriptEslintRules = (tseslint.plugin as ESLint.Plugin).rules ?? {};
const rules: Record<string, Rule.RuleModule> = {};
for (const name of ruleNames) {
	const rule = typescriptEslintRules[name];
	if (!rule) {
		throw new Error(`typescript-eslint has no rule '${name}'`);
	}
	rules[name] = withParserServices(rule);
}

export default { meta: { name: 'ts-eslint-js' }, rules } satisfies ESLint.Plugin;
