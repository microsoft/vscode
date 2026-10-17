/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';

const registrations = new Set(['test', 'it', 'suite', 'describe']);
const testBodies = new Set(['test', 'it']);

/**
 * Tests and suites are registered while the surrounding suite runs. Registering one from inside a
 * test body happens too late: Mocha silently drops it, so it never runs. This typically comes from
 * a misplaced closing brace.
 */
export default new class NoNestedTest implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		messages: {
			nested: '`{{name}}` is declared inside the body of another test and will never run. Check for a misplaced closing brace.'
		},
		schema: []
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const sourceCode = context.sourceCode;

		/** Returns the test API name (`test`, `suite`, ...) when the call is a call into the test framework. */
		function getTestApiName(node: ESTree.Node): string | undefined {
			if (node.type !== 'CallExpression') {
				return undefined;
			}
			let callee = node.callee;
			// `test.skip(...)`, `test.only(...)`
			if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && !callee.computed) {
				callee = callee.object;
			}
			if (callee.type !== 'Identifier' || !registrations.has(callee.name)) {
				return undefined;
			}
			// A local helper that happens to be named `test` is not the test framework.
			const name = callee.name;
			for (let scope: eslint.Scope.Scope | null = sourceCode.getScope(node); scope; scope = scope.upper) {
				const variable = scope.set.get(name);
				if (variable) {
					return variable.defs.length > 0 && variable.defs.every(def => def.type === 'ImportBinding') ? name : undefined;
				}
			}
			return name;
		}

		function isInsideTestBody(node: ESTree.Node): boolean {
			const ancestors = sourceCode.getAncestors(node);
			for (let i = ancestors.length - 1; i > 0; i--) {
				const fn = ancestors[i];
				const parent = ancestors[i - 1];
				if ((fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')
					&& parent.type === 'CallExpression' && parent.arguments.includes(fn)) {
					const name = getTestApiName(parent);
					if (name && testBodies.has(name)) {
						return true;
					}
				}
			}
			return false;
		}

		return {
			CallExpression: (node: ESTree.CallExpression) => {
				const name = getTestApiName(node);
				if (name && node.arguments.some(arg => arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') && isInsideTestBody(node)) {
					context.report({ node, messageId: 'nested', data: { name } });
				}
			}
		};
	}
};
